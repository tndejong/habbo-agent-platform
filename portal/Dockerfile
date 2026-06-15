FROM node:20-alpine AS build
WORKDIR /app
COPY portal/package*.json ./
RUN npm install
COPY portal/ .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
COPY portal/package*.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY portal/server.js ./server.js
COPY portal/server ./server
COPY agents/skills ./agents/skills
EXPOSE 3000
CMD ["npm", "start"]
