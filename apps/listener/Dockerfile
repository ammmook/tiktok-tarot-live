FROM node:22-alpine

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-workspace.yaml turbo.json ./
COPY apps/listener/package.json apps/listener/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --no-frozen-lockfile

COPY . .
RUN pnpm --filter @tarot-live/listener build

CMD ["pnpm", "--filter", "@tarot-live/listener", "start"]
