#!/usr/bin/env bash
set -euo pipefail

BASE_DIR="/home/f/deutsch-app/de"
LOG_GLOB="/home/f/deutsch-app/rename_log_*.csv"

python3 "/home/f/deutsch-app/scripts/python/audio/update_audio_index_paths.py" \
  --base "$BASE_DIR" \
  --logs "$LOG_GLOB"
