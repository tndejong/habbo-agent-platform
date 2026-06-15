# Habbo AI Service Bundle

`habbo-ai-service/` connects in-hotel interactions to external AI providers.

## What it provides

- Hotel -> AI bridge for bot responses
- Provider integration (Anthropic only)
- Agent configuration and persistence
- Runtime APIs used by the emulator/hotel flows

## Role in architecture

When users talk to AI-enabled in-room bots, the emulator calls this service to generate responses and push them back into the hotel.
