FROM oven/bun:1.2-alpine

# Install Node.js + npm for claude CLI
RUN apk add --no-cache nodejs npm

# Install claude CLI globally
RUN npm install -g @anthropic-ai/claude-code

WORKDIR /app

COPY package.json ./
COPY src/ ./src/
COPY entrypoint.sh ./entrypoint.sh

RUN chmod +x /app/entrypoint.sh

EXPOSE 3004

ENTRYPOINT ["/app/entrypoint.sh"]
