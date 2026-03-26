---
name: web-researcher
title: Web Researcher
description: >
  Search the web and fetch page content to gather context, facts, or reference
  material. Use this skill when information needs to come from external sources.
category: research
tags: [web, search, research, context]
mcp_tools: [WebSearch, WebFetch]
difficulty: beginner
version: "1.0"
---

# Web Researcher

Gather external information via web search and page fetching.

## Search

```
WebSearch({ query: "<specific search query>", num_results: 5 })
```

## Fetch a page

```
WebFetch({ url: "<url from search results>" })
```

## Research workflow

1. Start with 1-2 targeted searches — be specific in your query.
2. Identify the 1-2 most relevant results.
3. Fetch those pages for full content.
4. Synthesize into a concise briefing.

## Briefing format

Structure your output as:

```
## Research: <topic>

**What**: <1-sentence summary>
**Why it matters**: <context / relevance>
**Key facts**:
- <fact 1>
- <fact 2>
**Source**: <url>
```

## Notes

- Max 2 searches per task — be targeted, not exhaustive.
- Do not dump raw web content into hotel chat. Summarize to under 120 chars.
- Pass full research briefing to teammates via task-coordinator messages.
