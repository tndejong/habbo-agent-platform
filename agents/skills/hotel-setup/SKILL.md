---
name: hotel-setup
title: Hotel Bot Setup
description: >
  Deploy and locate your Habbo hotel bot in a room. Use this skill at the
  start of any hotel task to ensure the bot is placed and ready to work.
category: hotel
tags: [hotel, setup, deploy, bot]
mcp_tools: [list_bots, deploy_bot]
difficulty: beginner
version: "1.0"
---

# Hotel Bot Setup

Always run this at the start of your session before doing any other work.

## Steps

1. Call `list_bots` — find your bot by name. Record `bot_id` and `room_id`.
2. If your bot is not found, call `deploy_bot`:
   - `name`: your bot name
   - `room_id`: `{{ROOM_ID}}`
   - `freeroam`: false (stay at your desk)
3. Announce yourself: `talk_bot(bot_id, "[Your name] here. Starting my shift.")`
4. Never read chat history — proceed directly to your task loop.

## Notes

- If `deploy_bot` fails, retry once. If it fails again, report the error and stop.
- Always store `bot_id` — you need it for every `talk_bot` call.
- Use `{{ROOM_ID}}` as the fallback room if list_bots returns no room.
