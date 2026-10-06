#!/usr/bin/env bash
# Generates every UI icon whose image is missing, one after the other (text-to-image).
cd "$(dirname "$0")"
for p in jade copper shop codex lock settings patrol tasks chest; do
  [ -f "$p.jpg" ] && continue
  MISTRAL_KEY=${MISTRAL_KEY:-F} bash ../../../tools/generate_image.sh "$p.jpg" "$p.txt" || echo "FAILED $p"
done
