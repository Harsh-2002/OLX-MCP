# syntax=docker/dockerfile:1

ARG NODE_IMAGE=node:24-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6

ARG RUNTIME_IMAGE=debian:bookworm-slim@sha256:3783cc01769c7b2b1b83a5c5ad96c815348e28ed7da68e2e3687004faa906251

FROM ${NODE_IMAGE} AS base
WORKDIR /app
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

FROM base AS build
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --ignore-scripts
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && rm -f dist/.tsbuildinfo

FROM base AS production-dependencies
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --ignore-scripts

FROM production-dependencies AS browsers
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/playwright
RUN node node_modules/playwright/cli.js install --only-shell chromium

FROM ${RUNTIME_IMAGE} AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/opt/playwright

LABEL org.opencontainers.image.title="OLX MCP" \
      org.opencontainers.image.description="MCP server for searching OLX listings" \
      org.opencontainers.image.source="https://github.com/Harsh-2002/OLX-MCP" \
      org.opencontainers.image.licenses="MIT"

# Install shared libraries required by the headless shell, without headed-browser
# packages such as Xvfb and Mesa drivers. Keep fonts for Latin and Indian text.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       ca-certificates tini libstdc++6 libglib2.0-0 libnspr4 libnss3 \
       libatk1.0-0 libatk-bridge2.0-0 libdbus-1-3 libx11-6 libxcomposite1 \
       libxdamage1 libxext6 libxfixes3 libxrandr2 libgbm1 libexpat1 \
       libxcb1 libxkbcommon0 libudev1 libasound2 fonts-liberation fonts-noto-core \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 1000 node \
    && useradd --uid 1000 --gid node --create-home node

COPY --from=base /usr/local/bin/node /usr/local/bin/node
COPY --from=base /usr/local/LICENSE /usr/local/share/doc/node/LICENSE
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=browsers /opt/playwright /opt/playwright
COPY --from=build /app/dist ./dist
COPY package.json LICENSE ./

USER node
ENTRYPOINT ["/usr/bin/tini", "--", "node", "dist/index.js"]
