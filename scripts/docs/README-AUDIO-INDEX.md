# Audio Index Sync

This app uses the `audio_index` table to map audio metadata to real files.
If audio files are renamed or new materials are ingested, the DB paths can drift.
This script syncs `audio_index.file_path` to match the filesystem.

## What it does

- Scans `/home/f/deutsch-app/de` for audio files
- Updates `audio_index.file_path` to the current absolute path
- Uses existing rename logs (`/home/f/deutsch-app/rename_log_*.csv`) for old name -> new name
- Does **not** rename files

## Run

```bash
./scripts/shell/update_audio_index_paths.sh
```

## Dry run

```bash
python3 /home/f/deutsch-app/scripts/python/audio/update_audio_index_paths.py --dry-run
```

## Notes

- Lagune 3 has multiple CDs (KB CD1/2/3 + AB). Ensure the backend returns CD groups.
- If new materials are added, re-run this script to refresh paths.
