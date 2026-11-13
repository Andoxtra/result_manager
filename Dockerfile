FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/prisma.config.ts server/
COPY server/prisma server/prisma
COPY client/package.json client/
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24-slim
ENV NODE_ENV=production \
    DATA_DIR=/app/data \
    PORT=3000
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules node_modules
# packages npm did not hoist to the root, among them the prisma CLI
COPY --from=build /app/server/node_modules server/node_modules
COPY --from=build /app/server/package.json /app/server/prisma.config.ts server/
COPY --from=build /app/server/prisma server/prisma
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/client/dist client/dist
RUN mkdir -p /app/data && chown node:node /app/data
USER node
VOLUME /app/data
EXPOSE 3000
WORKDIR /app/server
# applies pending database migrations, then starts the server
CMD ["npm", "start"]
