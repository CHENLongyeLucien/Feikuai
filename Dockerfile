FROM node:24.14.0-bookworm-slim AS build
WORKDIR /app
ARG VITE_APPROVER_URL=http://localhost:8081
ENV VITE_APPROVER_URL=$VITE_APPROVER_URL
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@10.32.1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages ./packages
COPY apps ./apps
COPY scripts ./scripts
COPY fixtures ./fixtures
COPY deployments ./deployments
COPY tsconfig.json ./
RUN pnpm install --frozen-lockfile
RUN pnpm build

FROM node:24.14.0-bookworm-slim AS api
WORKDIR /app
ENV NODE_ENV=production API_HOST=0.0.0.0 API_PORT=3001 DATABASE_PATH=/data/secure-finance.sqlite ARTIFACT_ROOT=/data/artifacts
COPY --from=build /app /app
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=3 CMD node -e "fetch('http://127.0.0.1:3001/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","apps/api/dist/index.js"]

FROM nginx:1.28.0-alpine AS web
COPY deploy/nginx-web.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

FROM nginx:1.28.0-alpine AS approver
COPY deploy/nginx-approver.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/approver/dist /usr/share/nginx/html
