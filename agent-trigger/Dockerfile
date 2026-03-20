FROM oven/bun:1.2-alpine

# Install Node.js + npm for claude CLI
RUN apk add --no-cache nodejs npm

# Install claude CLI globally
RUN npm install -g @anthropic-ai/claude-code

WORKDIR /app

COPY package.json ./
COPY src/ ./src/
COPY entrypoint.sh ./entrypoint.sh

# Bake Claude hook settings + narrator script into the image
# Placed at /app/hooks/ (not under /project) so the Portainer volume mount
# on /project doesn't shadow these files.
COPY .claude/ /root/.claude/
COPY hooks/ /app/hooks/

RUN chmod +x /app/entrypoint.sh

EXPOSE 3004

ENTRYPOINT ["/app/entrypoint.sh"]
