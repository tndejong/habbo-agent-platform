---
name: jira-researcher
title: Jira Researcher
description: >
  Fetch, analyze, and report on Jira issues using the Atlassian MCP. Use this
  skill to retrieve sprint tasks, issue details, and priority information.
category: research
tags: [jira, atlassian, sprint, research, planning]
mcp_tools: [searchJiraIssuesUsingJql, getJiraIssue]
requires_integration: atlassian
difficulty: beginner
version: "1.0"
---

# Jira Researcher

Fetch and analyze Jira issues using the Atlassian MCP server.

## Fetch open sprint tasks

```
searchJiraIssuesUsingJql({
  jql: "assignee = currentUser() AND sprint in openSprints() ORDER BY priority DESC",
  maxResults: 10
})
```

## Fetch a specific issue

```
getJiraIssue({ issueKey: "PROJ-123" })
```

## Reporting format

When reporting issues to teammates or in hotel chat:

```
[PRIORITY] KEY - Short summary (status)
```

Example: `[HIGH] PROJ-42 - Fix login timeout bug (In Progress)`

## Notes

- Always sort by priority DESC to surface the most important work first.
- Use `getJiraIssue` for full details (description, comments, acceptance criteria).
- Pass structured data to teammates via the task-coordinator messages array, not hotel chat.
