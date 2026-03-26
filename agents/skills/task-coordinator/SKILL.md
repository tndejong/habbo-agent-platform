---
name: task-coordinator
title: Task Coordinator
description: >
  Coordinate work between multiple agents using a shared JSON task file at
  /tmp/hotel-team-tasks.json. Claim tasks atomically, update status, and pass
  results to other agents via the messages array.
category: coordination
tags: [coordination, tasks, multi-agent, shared-state]
mcp_tools: [Read, Write]
difficulty: intermediate
version: "1.0"
---

# Task Coordinator

Coordinate multi-agent work via `/tmp/hotel-team-tasks.json`.

## Task file structure

```json
{
  "room_id": "<room id>",
  "created_at": "<ISO timestamp>",
  "stop": false,
  "tasks": [
    {
      "id": "task-1",
      "type": "your_task_type",
      "status": "pending",
      "claimed_by": null,
      "result": null,
      "dependencies": []
    }
  ],
  "messages": []
}
```

## Task loop

Repeat until `/tmp/hotel-team-stop` exists or `stop: true`:

1. **Read** `/tmp/hotel-team-tasks.json`
2. **Check stop** — exit if `stop: true` or stop file exists.
3. **Claim** a `pending` task matching your capabilities: set `status: "in_progress"`, `claimed_by: "<your name>"`. Write immediately.
4. **Do the work** for that task.
5. **Write result**: set `status: "done"`, `result: "<output>"`. Write file.
6. Loop.

## Sending messages to teammates

```json
{
  "from": "<your name>",
  "to": "<teammate name>",
  "text": "<message content>",
  "timestamp": "<ISO>"
}
```

Append to `messages[]` and write the file.

## Notes

- Always re-read the file before writing — avoid overwriting another agent's changes.
- Never delete tasks — only update `status` and `result`.
- If no tasks match your capabilities, wait and re-check every iteration.
