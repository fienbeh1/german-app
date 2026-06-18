#!/usr/bin/env python3
"""
Update audio_index file_path values to match current filesystem.

Strategy:
1) Exact filename match against files under /home/f/deutsch-app/de
2) Rename-log mapping (rename_log_*.csv) for old filename -> new filename

Notes:
- Does not rename files.
- Only updates audio_index.file_path.
"""

import argparse
import csv
import glob
import os
import subprocess
from collections import defaultdict


AUDIO_EXTS = {'.mp3', '.m4a', '.wav', '.ogg', '.flac', '.wma'}


def walk_audio_files(base_dir):
    files = []
    for dirpath, dirnames, filenames in os.walk(base_dir):
        dirnames[:] = [d for d in dirnames if not d.startswith('.') and d != '__pycache__']
        for fname in filenames:
            if os.path.splitext(fname)[1].lower() in AUDIO_EXTS:
                files.append(os.path.join(dirpath, fname))
    return files


def load_rename_map(log_paths):
    mapping = {}
    for log_path in log_paths:
        try:
            with open(log_path, newline='') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    old_path = row.get('old_path') or ''
                    new_name = row.get('new_name') or ''
                    if not old_path or not new_name:
                        continue
                    old_base = os.path.basename(old_path).lower()
                    old_dir = os.path.dirname(old_path)
                    if old_base not in mapping:
                        mapping[old_base] = (old_dir, new_name)
        except FileNotFoundError:
            continue
    return mapping


def query_psql(sql):
    return subprocess.check_output(
        ['psql', '-d', 'deutsch', '-At', '-F', '\t', '-c', sql],
        text=True
    )


def apply_updates_psql(updates):
    proc = subprocess.Popen(['psql', '-d', 'deutsch'], stdin=subprocess.PIPE, text=True)
    proc.stdin.write('BEGIN;\n')
    for row_id, new_path in updates:
        safe_path = new_path.replace("'", "''")
        proc.stdin.write(f"UPDATE audio_index SET file_path = '{safe_path}' WHERE id = {row_id};\n")
    proc.stdin.write('COMMIT;\n')
    proc.stdin.close()
    proc.wait()


def main():
    parser = argparse.ArgumentParser(description='Update audio_index file_path values')
    parser.add_argument('--base', default='/home/f/deutsch-app/de', help='Courses base directory')
    parser.add_argument('--logs', default='/home/f/deutsch-app/rename_log_*.csv', help='Glob for rename logs')
    parser.add_argument('--dry-run', action='store_true', help='Print counts only')
    args = parser.parse_args()

    base_dir = os.path.abspath(args.base)
    log_paths = sorted(glob.glob(args.logs))

    audio_files = walk_audio_files(base_dir)
    actual_by_name = defaultdict(list)
    for full in audio_files:
        actual_by_name[os.path.basename(full).lower()].append(full)

    rename_map = load_rename_map(log_paths)

    rows = query_psql('SELECT id, file_name, file_path FROM audio_index;').strip().split('\n')
    updates = []

    for row in rows:
        if not row:
            continue
        parts = row.split('\t')
        if len(parts) < 3:
            continue
        row_id, file_name, current_path = parts
        if not file_name:
            continue

        name_key = file_name.lower()
        new_path = None

        if name_key in actual_by_name:
            new_path = actual_by_name[name_key][0]
        elif name_key in rename_map:
            old_dir, new_name = rename_map[name_key]
            candidate = os.path.join(base_dir, old_dir, new_name)
            if os.path.exists(candidate):
                new_path = candidate

        if new_path and new_path != current_path:
            updates.append((row_id, new_path))

    print(f"Audio files found: {len(audio_files)}")
    print(f"Rename logs: {len(log_paths)}")
    print(f"Updates to apply: {len(updates)}")

    if args.dry_run:
        return

    if updates:
        apply_updates_psql(updates)
        print("Update complete")


if __name__ == '__main__':
    main()
