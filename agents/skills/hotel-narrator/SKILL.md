---
name: hotel-narrator
title: Hotel Narrator
description: >
  Narrate your work progress in the Habbo hotel room using talk_bot so hotel
  guests can follow along in real time. Use at every meaningful step.
category: hotel
tags: [hotel, communication, narration, talk_bot]
mcp_tools: [talk_bot]
difficulty: beginner
version: "1.0"
---

# Hotel Narrator

Keep guests informed by announcing what you are doing at every meaningful step.

## Rules

- Max **120 characters** per `talk_bot` message.
- Always say what you are about to do **before** you do it.
- Use plain, natural language — no technical jargon for status updates.
- Never dump raw JSON or code into `talk_bot`.

## When to narrate

| Moment | Example message |
|--------|----------------|
| Starting a task | "Checking the Jira sprint now..." |
| Found information | "Found 4 open tasks. Picking the highest priority." |
| Waiting | "Waiting for Sander to finish the research..." |
| Done | "All done. Results are in the task file." |
| Error | "Hit a problem with the API. Retrying..." |

## Template

```
talk_bot(bot_id, "<concise, friendly update under 120 chars>")
```
