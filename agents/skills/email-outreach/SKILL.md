---
name: email-outreach
title: Email Outreach
description: >
  Send personalised emails to a list of recipients via Resend. Use this skill
  for waitlist outreach, notifications, or any automated email sending task.
category: communication
tags: [email, resend, outreach, communication]
mcp_tools: [send_email]
requires_integration: resend
difficulty: intermediate
version: "1.1"
---

# Email Outreach

Send personalised emails to recipients using the Resend MCP integration.

## Per-recipient workflow

For each person in the list:

1. Personalise the subject and body using their name and any context data.
2. Call `send_email`:
   ```
   send_email({
     to: "<recipient email>",
     subject: "<personalised subject>",
     body: "<personalised body — plain text or HTML>"
   })
   ```
3. Announce progress in hotel chat: `"Sent to <name>. X remaining."`
4. Wait 1-2 seconds between emails to avoid rate limiting.

## Email template pattern

```
Subject: <Hook that references something specific to them>

Hi <First name>,

<1 sentence that shows you know who they are or why you're writing>

<2-3 sentences of value / action>

<Clear single CTA>

Best,
<Sender name>
```

## Notes

- Never send to an email address that looks invalid (no @, no dot in domain).
- If `send_email` fails for a recipient, log the failure and continue to the next — do not stop.
- Report a final count: `"Outreach complete. Sent: X, Failed: Y."`
