FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN npm install -g pnpm@12.10.0 && pnpm install --frozen-lockfile
COPY . .
RUN pnpm typecheck && pnpm test && pnpm web:build
