FROM node:24-bookworm-slim AS verify
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl unzip && rm -rf /var/lib/apt/lists/*
WORKDIR /workspace
COPY package.json package-lock.json ./
RUN npm ci
COPY electron/ electron/
COPY src/ src/
COPY scripts/ scripts/
COPY tests/ tests/
COPY resources/ resources/
COPY index.html tsconfig.json vite.config.ts LICENSE THIRD_PARTY_NOTICES.md ./
RUN --mount=type=secret,id=github_token LUMA_GITHUB_TOKEN_FILE=/run/secrets/github_token npm run core:download && LUMA_GITHUB_TOKEN_FILE=/run/secrets/github_token npm run geodata:download
RUN npm run build && npm test
CMD ["npm", "test"]
