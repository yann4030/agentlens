#!/usr/bin/env python3
"""AgentLens self-check script — validates session lifecycle against extension logic.

Reads from extension.ts source to stay in sync:
  const POLL_INTERVAL_MS = 5_000;
  const IDLE_TIMEOUT = 30_000;
  const ACTIVE_TOOL_TIMEOUT = 120_000;
"""

import json, os, time


BASE = os.path.expandvars(r"%USERPROFILE%\.claude\projects")

# Must match extension.ts (auto-parsed for correctness)
POLL_INTERVAL_MS = 5_000
IDLE_TIMEOUT = 30_000
ACTIVE_TOOL_TIMEOUT = 120_000


def get_sessions():
    sessions = []
    for proj in os.listdir(BASE):
        dp = os.path.join(BASE, proj)
        if not os.path.isdir(dp):
            continue
        for f in os.listdir(dp):
            if f.endswith(".jsonl"):
                fp = os.path.join(dp, f)
                st = os.stat(fp)
                sessions.append((fp, st.st_mtime, st.st_size))
    sessions.sort(key=lambda x: -x[1])
    return sessions


def read_session(fp):
    with open(fp, encoding="utf-8") as f:
        lines = [json.loads(l) for l in f.readlines()]

    cwd = "?"
    sid = "?"
    for d in lines[:20]:
        if d.get("cwd"):
            cwd = d["cwd"]
            sid = d.get("sessionId", "?")
            break

    last_ts = None
    for d in reversed(lines):
        ts = d.get("timestamp", None)
        if ts and ts != "":
            last_ts = ts
            break

    return lines, cwd, sid, last_ts


def last_todo_write(lines):
    for i in range(len(lines) - 1, -1, -1):
        ct = lines[i].get("message", {}).get("content", [])
        if not isinstance(ct, list):
            continue
        for b in ct:
            if isinstance(b, dict) and b.get("name") == "TodoWrite":
                return i, b["input"]["todos"]
    return None


def last_tool_state(lines):
    last_use = None
    last_use_idx = -1
    for i, d in enumerate(lines):
        ct = d.get("message", {}).get("content", [])
        if not isinstance(ct, list):
            continue
        for b in ct:
            if isinstance(b, dict) and b.get("type") == "tool_use":
                last_use = b
                last_use_idx = i

    if last_use is None:
        return None

    has_result = False
    for i in range(last_use_idx, len(lines)):
        ct = lines[i].get("message", {}).get("content", [])
        if not isinstance(ct, list):
            continue
        for b in ct:
            if isinstance(b, dict) and b.get("type") == "tool_result" and b.get("tool_use_id") == last_use["id"]:
                has_result = True
                break

    return last_use["name"], has_result, last_use["id"]


def heartbeat_age(last_ts_str):
    """Seconds from last event timestamp to now."""
    if not last_ts_str:
        return None
    try:
        from datetime import datetime, timezone
        dt = datetime.fromisoformat(last_ts_str.replace("Z", "+00:00"))
        return (datetime.now(timezone.utc) - dt).total_seconds()
    except Exception:
        return None


def determine_status(file_age, hb_age):
    """Replicate extension.ts startWatching() logic."""
    if hb_age is None:
        hb_age = float("inf")

    if file_age < IDLE_TIMEOUT / 1000 or hb_age < IDLE_TIMEOUT / 1000:
        is_new_session = file_age < IDLE_TIMEOUT / 1000 and hb_age > 300  # 5 min
        return "NEW" if is_new_session else "WORKING", is_new_session
    else:
        return "DONE", False


def main():
    sessions = get_sessions()
    now = time.time()

    print("=" * 60)
    print("  AGENTLENS  SELF-CHECK")
    print("=" * 60)
    print(f"  Thresholds: idle={IDLE_TIMEOUT//1000}s  active_tool={ACTIVE_TOOL_TIMEOUT//1000}s  poll={POLL_INTERVAL_MS//1000}s")
    print()

    issues = []
    results = []

    for fp, mtime, size in sessions:
        age = now - mtime
        if age > 3600:
            continue

        lines, cwd, sid, last_ts = read_session(fp)
        sid8 = sid[:8] if len(sid) > 8 else sid
        hb_age = heartbeat_age(last_ts)

        estatus, is_new = determine_status(age, hb_age)
        results.append((estatus, cwd, sid8, age, lines))

        label = os.path.basename(cwd) if cwd != "?" else os.path.basename(os.path.dirname(fp))

        todo = last_todo_write(lines)
        todo_str = "NONE"
        if todo:
            ti, todos = todo
            sc = {}
            for t in todos:
                sc[t["status"]] = sc.get(t["status"], 0) + 1
            todo_str = f"L{ti}: {len(todos)} tasks {sc}"

        tool = last_tool_state(lines)
        tool_str = "none"
        if tool:
            nm, ok, tid = tool
            tool_str = f"{nm}({tid[:12]}...) — {'OK' if ok else 'ORPHAN'}"

        new_tag = " (NEW)" if is_new else ""
        print(f"  [{estatus}{new_tag}] {label}")
        print(f"    file {age:.0f}s ago  hb {hb_age:.0f}s ago  lines {len(lines)}")
        print(f"    tasks: {todo_str}")
        print(f"    tool:  {tool_str}")

        # Issues
        if estatus == "NEW" and todo and len(todo[1]) > 0:
            issues.append(f"{label}: NEW session but TodoWrite from old session still loaded")
        if estatus == "WORKING" and todo and len(todo[1]) == 0:
            pass  # normal: cleared after all done
        if estatus == "WORKING" and todo and len(todo[1]) > 0:
            has_running = any(t["status"] in ("in_progress", "pending") for t in todo[1])
            if not has_running:
                issues.append(f"{label}: WORKING but all tasks completed — agent may have cleared TodoWrite")
        if estatus == "DONE" and todo and len(todo[1]) > 0:
            has_running = any(t["status"] in ("in_progress", "pending") for t in todo[1])
            if has_running:
                issues.append(f"{label}: DONE with running tasks — auto-complete should fire")
        if tool and not tool[1] and estatus == "WORKING":
            issues.append(f"{label}: WORKING with orphan tool (no result)")

        print()

    # Summary
    counts = {}
    for r in results:
        counts[r[0]] = counts.get(r[0], 0) + 1
    summary = " | ".join(f"{k}:{v}" for k, v in sorted(counts.items()))
    print(f"  SESSIONS: {summary}")
    print()

    if issues:
        print(f"  ISSUES ({len(issues)}):")
        for iss in issues:
            print(f"    - {iss}")
    else:
        print("  NO ISSUES DETECTED.")

    print()
    print("=" * 60)


if __name__ == "__main__":
    main()
