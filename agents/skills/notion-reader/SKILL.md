---
name: notion-reader
title: Notion Reader
description: >
  Read and extract structured data from Notion pages and databases using the
  Notion MCP. Use this skill to fetch waitlists, content, or any Notion data.
category: research
tags: [notion, database, reading, data-extraction]
mcp_tools: [notion_search, notion_get_page, notion_query_database]
requires_integration: notion
difficulty: beginner
version: "1.0"
---

# Notion Reader

Read structured data from Notion pages and databases.

## Find a page by name

```
notion_search({ query: "Waitlist", filter: { value: "page", property: "object" } })
```

## Read a page

```
notion_get_page({ page_id: "<page_id from search>" })
```

## Query a database

```
notion_query_database({
  database_id: "<database_id>",
  sorts: [{ property: "Created", direction: "descending" }]
})
```

## Extracting structured entries

After reading a database, map each row to a plain object with the fields you need:

```js
// Example: extract name + email from a waitlist database
entries = results.map(row => ({
  name: row.properties.Name?.title?.[0]?.text?.content,
  email: row.properties.Email?.email
}))
```

## Notes

- Always search for the page first to get its ID — do not hardcode IDs.
- Pass extracted data to teammates via task-coordinator messages, not hotel chat.
- Summarize counts in hotel chat: `"Found 47 waitlist entries. Passing to outreach agent."`
