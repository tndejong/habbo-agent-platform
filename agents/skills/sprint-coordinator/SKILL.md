---
name: sprint-coordinator
title: Sprint Coordinator
description: >
  Manage sprint planning and task delegation for a hotel team. Fetch open sprint
  tasks, prioritise them, and distribute work to the right team members.
category: coordination
tags: [sprint, planning, delegation, jira, coordination]
mcp_tools: [searchJiraIssuesUsingJql, getJiraIssue, talk_bot]
requires_integration: atlassian
difficulty: intermediate
version: "1.0"
---

# Sprint Coordinator

Orchestrate sprint work across a hotel team.

## Workflow

1. **Fetch sprint** using `jira-researcher` skill — get all open tasks sorted by priority.
2. **Announce in hotel**: `"Sprint check: Found X tasks. Delegating now..."`
3. **Prioritise**:
   - Critical / High → assign to most capable team member immediately
   - Medium / Low → queue for later
4. **Delegate** via task-coordinator messages:
   ```json
   {
     "from": "Sprint Coordinator",
     "to": "<agent name>",
     "text": "Your task: [KEY] - <summary>. Priority: <HIGH/MED/LOW>. Details: <brief context>",
     "timestamp": "<ISO>"
   }
   ```
5. **Confirm delegation** in hotel: `"Assigned [KEY] to <agent>. Moving on."`
6. **Monitor** — check messages[] for completion reports each loop iteration.
7. **Report summary** when all tasks are delegated or done.

## Prioritisation rules

| Priority | Action |
|----------|--------|
| Critical | Assign immediately, check every loop |
| High | Assign in current iteration |
| Medium | Assign if no High tasks remain |
| Low | Queue, assign only when team is idle |

## Notes

- One task per agent at a time — check their current `claimed_by` before assigning.
- Never assign a task without checking its `dependencies` are resolved first.
- Final report format: `"Sprint complete. Done: X/Y tasks. Remaining: Z."`
