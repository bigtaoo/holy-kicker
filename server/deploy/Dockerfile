# Runs the bundled server (dist/server.mjs, built by ../build.mjs). mongodb is the one runtime
# dependency; everything else is in the bundle.
FROM node:22-alpine
WORKDIR /app
COPY package.json ./package.json
RUN npm install --omit=dev
COPY server.mjs ./
USER node
ENV PORT=8080
EXPOSE 8080
CMD ["node", "server.mjs"]
