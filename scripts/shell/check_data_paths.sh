#!/usr/bin/env bash
set -euo pipefail

BASE_DIR="/home/f/deutsch-app/de"

python3 "/home/f/deutsch-app/scripts/python/audit/check_data_paths.py" \
  --base "$BASE_DIR"
