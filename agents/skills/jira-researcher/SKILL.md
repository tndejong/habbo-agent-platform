---
name: jira-researcher
title: Jira Researcher
description: >
  Fetch, analyze, and report on Jira issues using the Atlassian MCP. Use this
  skill to retrieve sprint tasks, issue details, and priority information.
category: research
tags: [jira, atlassian, sprint, research, planning]
mcp_tools: [mcp__atlassian__searchJiraIssuesUsingJql, mcp__atlassian__getJiraIssue]
requires_integration: atlassian
difficulty: beginner
version: "1.0"
---

# Jira Researcher

Fetch and analyze Jira issues using the Atlassian MCP server (`atlassian` integration).

**CRITICAL: Call these tools directly — do NOT use ToolSearch to discover them first.**
ToolSearch does not reliably surface Atlassian MCP tools. The tools listed below are guaranteed to be registered when the `atlassian` integration is active. Invoke them directly by their full prefixed name.

**Always use the `mcp__atlassian__` prefixed tools** — do not use bare tool names or Bash for Jira access.

## Fetch open sprint tasks

```
mcp__atlassian__searchJiraIssuesUsingJql({
  jql: "project = PROJ AND sprint in openSprints() ORDER BY priority DESC",
  maxResults: 10
})
```

## Fetch a specific issue

```
mcp__atlassian__getJiraIssue({ issueKey: "PROJ-123" })
```

## Search by project

```
mcp__atlassian__searchJiraIssuesUsingJql({
  jql: "project = PROJ ORDER BY updated DESC",
  maxResults: 20
})
```

## Reporting format

When reporting issues to teammates or in hotel chat:

```
[PRIORITY] KEY - Short summary (status)
```

Example: `[HIGH] PROJ-42 - Fix login timeout bug (In Progress)`

## Notes

- Always sort by priority DESC to surface the most important work first.
- Use `mcp__atlassian__getJiraIssue` for full details (description, comments, acceptance criteria).
- Pass structured data to teammates via the task-coordinator messages array, not hotel chat.
- Do NOT use Bash, curl, or any other method to access Jira — always use the MCP tools above.
- Do NOT waste turns running ToolSearch to "verify" these tools exist — call them immediately.
- If `searchJiraIssuesUsingJql` returns an auth error, fall back to `mcp__atlassian__search` with a plain text query.
