FROM node:24-bookworm-slim AS build

WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY upstream/package.json upstream/package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY upstream/ ./
ENV CANVAS_INTEGRATION=1 NEXT_PUBLIC_CANVAS_INTEGRATION=1 DATABASE_URL=file:./dev.db
RUN npm run build

FROM node:24-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ffmpeg && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/docs/TUTORIAL.canvas.md ./docs/TUTORIAL.canvas.md
COPY --from=build /app/prisma/migrations ./prisma/migrations
COPY --from=build /app/scripts/apply-prisma-migrations.cjs ./scripts/apply-prisma-migrations.cjs
COPY --from=build /app/scripts/runtime-paths.cjs ./scripts/runtime-paths.cjs
ENV NODE_ENV=production CANVAS_INTEGRATION=1 NEXT_PUBLIC_CANVAS_INTEGRATION=1 PORT=3002 HOSTNAME=0.0.0.0 MOTU_DATA_DIR=/data
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:3002/motu/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "server.js"]
