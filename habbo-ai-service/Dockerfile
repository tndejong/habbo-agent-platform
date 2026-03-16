FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --production=false

COPY tsconfig.json ./
COPY src ./src
COPY migrations ./migrations

RUN npm run build

EXPOSE 3002

CMD ["node", "dist/index.js"]
