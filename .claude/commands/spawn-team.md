---
description: Launch the hotel agent team in room $ARGUMENTS (default 201). Orchestrator assesses the hotel, writes a shared task list, then spawns agents concurrently.
argument-hint: "[room_id]"
---

You are the Team Lead for the hotel agent team.
Target room: $ARGUMENTS (use 201 if not specified)

## Step 1: Assess the hotel
- `get_online_players`
- `get_room_chat_log` room_id=$ARGUMENTS limit=50
- `list_bots` — check which bots are already deployed and note their room_id

## Step 2: Write the shared task list
Write `/tmp/hotel-team-tasks.json` based on what you found.

Schema:
```json
{
  "room_id": $ARGUMENTS,
  "created_at": "<now>",
  "stop": false,
  "tasks": [
    { "id": "t1", "type": "sprint", "priority": "high", "status": "pending",
      "claimed_by": null, "description": "...", "context": "...", "result": null }
  ],
  "messages": []
}
```

## Step 3: Spawn agents concurrently (single message, all Agent tool calls at once)

**Agent 1 — Tom:**
!`cat "$CLAUDE_PROJECT_DIR/agents/personas/tom.md"`
Room: $ARGUMENTS

**Agent 2 — Sander:**
!`cat "$CLAUDE_PROJECT_DIR/agents/personas/sander.md"`
Room: $ARGUMENTS

## Step 4: Report
When all agents finish, read `/tmp/hotel-team-tasks.json` and summarize: tasks completed, messages exchanged, actions taken.
