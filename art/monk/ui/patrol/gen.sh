#!/usr/bin/env bash
# Generates every patrol-scene image that is missing (text-to-image), one after the other.
cd "$(dirname "$0")"
for p in far pine lantern rocks bamboo sign bush; do
  [ -f "$p.jpg" ] && continue
  bash ../../../../tools/generate_image.sh "$p.jpg" "$p.txt" || echo "FAILED $p"
done
