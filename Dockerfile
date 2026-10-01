# syntax=docker/dockerfile:1

ARG NODE_IMAGE=node:24-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6

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

FROM base AS runtime
ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/opt/playwright

LABEL org.opencontainers.image.title="OLX MCP" \
      org.opencontainers.image.description="MCP server for searching OLX listings" \
      org.opencontainers.image.source="https://github.com/Harsh-2002/OLX-MCP" \
      org.opencontainers.image.licenses="MIT"

COPY --from=production-dependencies /app/node_modules ./node_modules
# Install only the browser used by headless chromium.launch(), from the locked Playwright version.
RUN apt-get update \
    && apt-get install -y --no-install-recommends tini \
    && node node_modules/playwright/cli.js install --with-deps --only-shell chromium \
    && rm -rf /var/lib/apt/lists/* /root/.npm

COPY --from=build /app/dist ./dist
COPY package.json LICENSE ./

USER node
ENTRYPOINT ["/usr/bin/tini", "--", "node", "dist/index.js"]
