#!/usr/bin/env sh
# Shared logic: set port in run.sh and config.json based on current branch.
# main -> 8000, everything else -> 8001
branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
if [ "$branch" = "main" ]; then
  PORT=8000
else
  PORT=8001
fi

# Determine the current port in run.sh
current=$(grep -o '\-\-port [0-9]*' run.sh | awk '{print $2}')
if [ "$current" != "$PORT" ]; then
  sed -i "s/--port [0-9]*/--port $PORT/" run.sh
  sed -i "s/\"8000\/tcp\": [0-9]*/\"8000\/tcp\": $PORT/" config.json
  echo "[hooks] Port set to $PORT for branch '$branch' (run.sh + config.json)"
fi
