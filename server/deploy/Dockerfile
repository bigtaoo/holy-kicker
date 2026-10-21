# Runs the bundled server (dist/server.mjs, built by ../build.mjs). mongodb is the one runtime
# dependency; everything else is in the bundle.
FROM node:22-alpine
WORKDIR /app
COPY package.json ./package.json
RUN npm install --omit=dev
COPY server.mjs ./
# collected replays (replayShelf.ts) live on the `replays` volume; a new volume takes this
# directory's owner, so the server may write there
RUN mkdir -p /data/replays && chown node:node /data/replays
USER node
ENV PORT=8080 HK_REPLAY_DIR=/data/replays
EXPOSE 8080
CMD ["node", "server.mjs"]
