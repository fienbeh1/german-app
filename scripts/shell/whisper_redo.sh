#!/bin/bash
export LD_LIBRARY_PATH="/mnt/storage/venv/lib/python3.14/site-packages/nvidia/cu13/lib:$LD_LIBRARY_PATH"
exec /mnt/storage/venv/bin/python3 /home/f/deutsch-app/scripts/python/whisper_redo_tangram.py
