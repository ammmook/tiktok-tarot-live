FROM node:22-alpine

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --no-frozen-lockfile

COPY . .
RUN pnpm --filter @tarot-live/db build
RUN pnpm --filter @tarot-live/api build

EXPOSE 4000
CMD ["pnpm", "--filter", "@tarot-live/api", "start"]
