# One shared monorepo dependency layer, with independent development targets.
# Node 22 matches the existing EC-014 GitHub Actions runner.
FROM node:22-bookworm-slim AS workspace

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g pnpm@10

WORKDIR /workspace

# pnpm's frozen-lockfile install is cached until manifests change.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
RUN pnpm install --frozen-lockfile

# Do not copy .env, Git, host node_modules, reports, or generated Prisma client.
# Those are excluded by the repository-root .dockerignore.
COPY . .
RUN pnpm --filter @commercelab/api exec prisma generate

FROM workspace AS api-dev
WORKDIR /workspace/apps/api
EXPOSE 3000
CMD ["pnpm", "dev"]

FROM workspace AS web-dev
WORKDIR /workspace/apps/web
EXPOSE 5173
CMD ["pnpm", "exec", "vite", "--host", "0.0.0.0", "--port", "5173", "--strictPort"]
