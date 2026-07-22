#!/usr/bin/env python3
"""AgentLens self-check script — mirrors extension.ts invariants.

Reads live Claude Code session data and validates AgentLens logic."""
import json, os, time
from datetime import datetime, timezone

BASE = os.path.expandvars(r"%USERPROFILE%\.claude\projects")

# Must match extension.ts constants
POLL_MS = 5_000          # tail activity check interval
IDLE_TIMEOUT = 60_000    # 60s idle → DONE
ACTIVE_TOOL_TIMEOUT = 120_000  # 2m with stuck tool → INTERRUPTED
FILE_STALE = 300_000     # 5 min no writes → truly stale
TODO_STALE = 120_000     # 2 min since last TodoWrite → clear old tasks


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
    if not last_ts_str:
        return None
    try:
        dt = datetime.fromisoformat(last_ts_str.replace("Z", "+00:00"))
        return (datetime.now(timezone.utc) - dt).total_seconds()
    except Exception:
        return None


def has_running_tasks(todos):
    """Mirrors extension.ts hasRunningTasks()"""
    if not todos:
        return False
    return any(t["status"] in ("in_progress", "pending") for t in todos)


def determine_status_logically(file_age, hb_age, todos):
    """Exact logic from extension.ts startWatching() + tailActivityCheck()"""
    running = has_running_tasks(todos) if todos else False

    # If file untouched > 5 min → DONE unconditionally
    if file_age > FILE_STALE / 1000:
        return "DONE"

    # If tasks are running → WORKING
    if running:
        return "WORKING"

    # If file is being written → WORKING
    if file_age < POLL_MS / 1000:
        return "WORKING"

    # No running tasks, no activity → DONE
    if file_age > IDLE_TIMEOUT / 1000:
        return "DONE"

    return "WORKING"


def main():
    sessions = get_sessions()
    now = time.time()

    print("=" * 60)
    print("  AGENTLENS  SELF-CHECK (v3)")
    print("=" * 60)
    print(f"  Thresholds: idle={IDLE_TIMEOUT//1000}s  stale={FILE_STALE//1000}s  poll={POLL_MS//1000}s")
    print()

    issues = []
    results = []

    for fp, mtime, size in sessions:
        age = now - mtime
        if age > 3600:
            continue

        lines, cwd, sid, last_ts = read_session(fp)
        sid8 = sid[:8] if len(sid) > 8 else sid
        hb_age = heartbeat_age(last_ts) if last_ts else float("inf")

        todo = last_todo_write(lines)
        todos = todo[1] if todo else None
        todo_pos = todo[0] if todo else None
        distance_from_end = len(lines) - todo_pos if todo_pos is not None else float("inf")

        # Determine status using EXACT AgentLens logic
        status = determine_status_logically(age, hb_age, todos)
        results.append((status, cwd, sid8, age, lines))

        label = os.path.basename(cwd) if cwd != "?" else os.path.basename(os.path.dirname(fp))

        # Task summary
        todo_str = "NONE"
        if todos:
            sc = {}
            for t in todos:
                sc[t["status"]] = sc.get(t["status"], 0) + 1
            todo_str = f"L{todo_pos}: {len(todos)} tasks {sc} ({len(lines)-todo_pos} lines from end)"

        # Tool state
        tool = last_tool_state(lines)
        tool_str = "none"
        if tool:
            nm, ok, tid = tool
            tool_str = f"{nm}({tid[:12]}...) — {'OK' if ok else 'ORPHAN'}"

        running = has_running_tasks(todos)

        print(f"  [{status}] {label}")
        print(f"    file {age:.0f}s ago  hb {hb_age if hb_age else 0:.0f}s ago  lines {len(lines)}")
        print(f"    tasks: {todo_str}")
        print(f"    tool:  {tool_str}")
        print(f"    running_tasks: {running}")

        # Consistency checks
        if status == "DONE" and running:
            issues.append(f"{label}: DONE but has running tasks")

        if status == "WORKING" and not running and todo_pos and distance_from_end > 50:
            issues.append(f"{label}: WORKING but all tasks done (stale TodoWrite)")

        if tool and not tool[1] and age < POLL_MS / 1000:
            issues.append(f"{label}: WORKING with orphan tool (may be running)")

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
