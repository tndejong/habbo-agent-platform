FROM oven/bun:1.2-alpine

# Install Node.js + npm for claude CLI, Python 3 for agent scripting
RUN apk add --no-cache nodejs npm bash python3 py3-pip

# Install claude CLI globally
RUN npm install -g @anthropic-ai/claude-code

# Create non-root user — claude refuses --dangerously-skip-permissions as root
RUN addgroup -S claude && adduser -S -G claude -h /home/claude claude

WORKDIR /app

COPY package.json ./
COPY src/ ./src/
COPY entrypoint.sh ./entrypoint.sh

# Bake Claude hook settings + narrator script into the image
COPY .claude/ /home/claude/.claude/
COPY hooks/ /app/hooks/

RUN chmod +x /app/entrypoint.sh && \
    chown -R claude:claude /app /home/claude

USER claude

EXPOSE 3004

ENTRYPOINT ["/app/entrypoint.sh"]
