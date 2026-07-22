#!/usr/bin/env python3
"""AgentLens self-check script — validates session data, status logic, task state."""

import json, os, sys, time
from datetime import datetime, timezone

BASE = os.path.expandvars(r'%USERPROFILE%\.claude\projects')
TAIL_IDLE_MS = 10_000  # from extension.ts

def get_session_paths():
    """Find all jsonl sessions sorted by mtime (newest first)."""
    sessions = []
    for proj in os.listdir(BASE):
        dp = os.path.join(BASE, proj)
        if not os.path.isdir(dp):
            continue
        for f in os.listdir(dp):
            if f.endswith('.jsonl'):
                fp = os.path.join(dp, f)
                sessions.append((fp, os.stat(fp).st_mtime, os.stat(fp).st_size))
    sessions.sort(key=lambda x: -x[1])
    return sessions

def read_session(fp):
    """Read a session file, return (lines, cwd, sessionId, last_timestamp)."""
    with open(fp, encoding='utf-8') as f:
        lines = [json.loads(l) for l in f.readlines()]

    cwd = '?'
    session_id = '?'
    for d in lines[:20]:
        if d.get('cwd'):
            cwd = d['cwd']
            session_id = d.get('sessionId', '?')
            break

    last_ts = None
    for d in reversed(lines):
        ts = d.get('timestamp', None)
        if ts and ts != '':
            last_ts = ts
            break

    return lines, cwd, session_id, last_ts

def get_last_todo_write(lines):
    """Return (line_index, todos_list) of last TodoWrite, or None."""
    for i in range(len(lines) - 1, -1, -1):
        msg = lines[i].get('message', {})
        ct = msg.get('content', [])
        if not isinstance(ct, list):
            continue
        for b in ct:
            if isinstance(b, dict) and b.get('name') == 'TodoWrite':
                return i, b['input']['todos']
    return None

def get_last_tool_use(lines):
    """Return (tool_use_dict, has_result_bool) for last tool call."""
    last_use = None
    last_use_idx = -1
    for i, d in enumerate(lines):
        ct = d.get('message', {}).get('content', [])
        if not isinstance(ct, list):
            continue
        for b in ct:
            if isinstance(b, dict) and b.get('type') == 'tool_use':
                last_use = b
                last_use_idx = i

    if last_use is None:
        return None

    # Check if a result exists for this tool_use after it
    has_result = False
    for i in range(last_use_idx, len(lines)):
        ct = lines[i].get('message', {}).get('content', [])
        if not isinstance(ct, list):
            continue
        for b in ct:
            if isinstance(b, dict) and b.get('type') == 'tool_result' and b.get('tool_use_id') == last_use['id']:
                has_result = True
                break

    return last_use['name'], has_result, last_use['id']

def main():
    sessions = get_session_paths()
    now = time.time()

    print("=" * 70)
    print("AGENTLENS SELF-CHECK")
    print("=" * 70)
    print()

    issues = []
    active_count = 0
    done_count = 0

    for fp, mtime, size in sessions:
        age = now - mtime
        if age > 3600:  # skip sessions older than 1 hour
            continue

        lines, cwd, sid, last_ts = read_session(fp)
        sid_short = sid[:8] if len(sid) > 8 else sid

        # Determine status
        is_active = age < TAIL_IDLE_MS / 1000
        if is_active:
            status = 'WORKING'
            active_count += 1
        else:
            status = 'DONE'
            done_count += 1

        # Get task state
        todo = get_last_todo_write(lines)
        todo_summary = 'NONE'
        if todo:
            idx, todos = todo
            sc = {}
            for t in todos:
                sc[t['status']] = sc.get(t['status'], 0) + 1
            todo_summary = f'L{idx}: {len(todos)} tasks {sc}'

        # Get tool state
        tool_info = get_last_tool_use(lines)
        tool_str = 'none'
        if tool_info:
            name, has_result, tid = tool_info
            tool_str = f'{name}({tid[:12]}...) - {"COMPLETED" if has_result else "RUNNING*"}'

        # Print
        label = os.path.basename(cwd) if cwd != '?' else os.path.basename(os.path.dirname(fp))
        print(f"[{status}] {label}")
        print(f"  session: {sid_short}  age: {age:.0f}s  lines: {len(lines)}")
        print(f"  tasks: {todo_summary}")
        print(f"  last tool: {tool_str}")

        # Issue detection
        if status == 'WORKING' and todo:
            has_running_tasks = any(t['status'] in ('in_progress', 'pending') for t in todo[1])
            if not has_running_tasks and len(todo[1]) > 0:
                issues.append(f"{label}: WORKING but all tasks done ({len(todo[1])} completed)")
        if status == 'WORKING' and tool_info and not tool_info[1]:
            issues.append(f"{label}: WORKING but last tool has NO result — orphan activeTool possible")
        if status == 'DONE' and todo:
            has_running = any(t['status'] in ('in_progress', 'pending') for t in todo[1])
            if has_running:
                issues.append(f"{label}: DONE but has running/pending tasks — need auto-complete")

        print()

    print(f"Active sessions: {active_count}  |  Done sessions: {done_count}")
    print()

    if issues:
        print("ISSUES FOUND:")
        for iss in issues:
            print(f"  - {iss}")
    else:
        print("ALL CLEAN — no issues detected.")

if __name__ == '__main__':
    main()
