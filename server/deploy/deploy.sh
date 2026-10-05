#!/bin/sh
# Ships the built server to the box and restarts it (server/README.md "Deploy"). Run from the
# repo root through `npm run deploy:server`, which builds dist/server.mjs first. Needs the
# `blightbloom` ssh alias; the box keeps its own .env, which this never touches.
set -eu
HERE=$(cd "$(dirname "$0")" && pwd)
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
cp "$HERE/Dockerfile" "$HERE/docker-compose.yml" "$HERE/package.json" "$HERE/../dist/server.mjs" "$STAGE/"
tar -C "$STAGE" -cf - . | ssh blightbloom '
  set -eu
  D=/home/deploy/holykicker
  mkdir -p $D
  tar -C $D -xf -
  chown -R deploy:deploy $D
  test -f $D/.env || { echo "missing $D/.env (see server/README.md)"; exit 1; }
  cd $D
  docker compose up -d --build --force-recreate
  for i in $(seq 1 20); do
    s=$(docker inspect -f "{{.State.Health.Status}}" hk-api)
    [ "$s" = healthy ] && { echo "hk-api healthy"; exit 0; }
    sleep 2
  done
  docker logs --tail 30 hk-api
  echo "hk-api did not become healthy"; exit 1
'
