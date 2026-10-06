#!/bin/sh
# The only command CI's deploy key may run on blightbloom: it reads the server payload
# (a tar.gz of server.mjs, Dockerfile, docker-compose.yml, package.json) from stdin, puts it
# in /home/deploy/holykicker and restarts the containers. `.github/workflows/ci.yml`'s
# deploy-server job sends it; server/README.md "Deploy from CI" says how it is installed.
#
# The key is registered in /home/deploy/.ssh/authorized_keys as
#   command="/home/deploy/holykicker-ci-deploy.sh",restrict ssh-ed25519 AAAA... holykicker-ci
# so sshd runs this script whatever the key's holder asks for, as `deploy` (never root), with
# no pty and no forwarding. The private half lives in a GitHub Secret; this keeps it from
# being a shell on the box.
#
# The live copy sits OUTSIDE the deploy target, so a deploy can never replace it. Editing this
# file changes nothing on the box until it is installed again by hand (README).
#
# It does ship docker-compose.yml, so whoever holds the key could mount the host into a
# container; the compose file is tracked and reviewed like code, and the key ships the
# server's code anyway. `.env` is never read or written.
set -eu

TARGET="$HOME/holykicker"
FILES="server.mjs Dockerfile docker-compose.yml package.json"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

tar xzf - -C "$STAGE"
for f in $FILES; do
  [ -f "$STAGE/$f" ] || { echo "payload is missing $f, aborting" >&2; exit 1; }
done

for var in HK_MONGO_URI HK_MONGO_DB HK_TAG_SALT HK_ADMIN_KEY HK_TUNNEL_TOKEN; do
  grep -q "^$var=..*" "$TARGET/.env" 2>/dev/null || {
    echo "$var is missing or empty in $TARGET/.env (server/README.md \"Deploy\")" >&2; exit 1; }
done

up() {
  [ "$(docker inspect -f '{{.State.Health.Status}}' hk-api 2>/dev/null)" = healthy ] &&
    [ "$(docker inspect -f '{{.State.Status}}' hk-tunnel 2>/dev/null)" = running ]
}

# Every push to main runs this job; a push that does not change the bundle restarts nothing.
same=1
for f in $FILES; do
  cmp -s "$STAGE/$f" "$TARGET/$f" || same=0
done
if [ "$same" = 1 ] && up; then
  echo "unchanged, hk-api healthy, hk-tunnel running"
  exit 0
fi

for f in $FILES; do cp "$STAGE/$f" "$TARGET/$f"; done
cd "$TARGET"
docker compose up -d --build --force-recreate
for _ in $(seq 1 30); do
  up && { echo "hk-api healthy, hk-tunnel running"; exit 0; }
  sleep 2
done
docker logs --tail 30 hk-api
docker logs --tail 15 hk-tunnel || true
echo "hk-api or hk-tunnel did not come up" >&2
exit 1
