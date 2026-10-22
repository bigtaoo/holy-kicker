# Runs the bundled server (dist/server.mjs, built by ../build.mjs). mongodb is the one runtime
# dependency, pinned (package.json) to the root lockfile's versions; everything else is in the bundle.
# The image is pinned too: bump it, and the pins, on purpose.
FROM node:22.23.4-alpine
WORKDIR /app
COPY package.json ./package.json
RUN npm install --omit=dev --no-audit --no-fund
COPY server.mjs ./
# collected replays (replayShelf.ts) live on the `replays` volume; a new volume takes this
# directory's owner, so the server may write there
RUN mkdir -p /data/replays && chown node:node /data/replays
USER node
# the heap stays well under the container's mem_limit (docker-compose.yml)
ENV PORT=8080 HK_REPLAY_DIR=/data/replays NODE_OPTIONS=--max-old-space-size=160
EXPOSE 8080
CMD ["node", "server.mjs"]
