#!/usr/bin/env python3
"""
tag_delfin_audio.py — Write ID3 tags to Delfin audio files.

Parses the already-renamed filenames (Delfin_{Source}_CD{N}_T{NN}.mp3)
and writes proper ID3 tags: Title, Artist, Album, Track, Disc.

Usage:
    python3 tag_delfin_audio.py [--dry-run] [--dir /path/to/audio]
"""

import argparse
import glob
import os
import re
import sys

try:
    import mutagen
    import mutagen.id3
    import mutagen.mp3
    HAS_MUTAGEN = True
except ImportError:
    HAS_MUTAGEN = False

AUDIO_DIR = "/home/f/deutsch-app/de/delfin/Audio"
BOOK_NAME = "Delfin"

FILENAME_RE = re.compile(
    r"Delfin_(?P<source>.+?)_CD(?P<cd>\d+)_T(?P<track>\d+)(?:_(?P<desc>.*?))?\.mp3$",
    re.IGNORECASE
)

SOURCE_LABELS = {
    'Delphin1_1': 'Delfin Lehrbuch 1 CD1',
    'Delphin1_2': 'Delfin Lehrbuch 1 CD2-3',
    'Delphin2_1': 'Delfin Lehrbuch 2 CD1',
    'Delphin2_2': 'Delfin Lehrbuch 2 CD3',
}

def parse_filename(fname):
    m = FILENAME_RE.match(fname)
    if not m:
        return None
    cd = int(m.group('cd'))
    track = int(m.group('track'))
    source_raw = m.group('source')
    source = SOURCE_LABELS.get(source_raw, source_raw)
    desc = m.group('desc') or ''
    desc_clean = desc.replace('_', ' ') if desc else f'{source_raw} CD{cd} Track {track}'
    return {
        'cd': cd,
        'track': track,
        'source': source,
        'source_raw': source_raw,
        'description': desc_clean,
    }

def write_tags(filepath, meta, dry_run=False):
    fname = os.path.basename(filepath)
    title = meta['description']
    artist = BOOK_NAME
    album = f"{BOOK_NAME} - {meta['source']}"
    track = meta['track']
    disc = meta['cd']

    if dry_run:
        print(f"  [DRY-RUN] Would tag: {fname}")
        print(f"    Title:  {title}")
        print(f"    Artist: {artist}")
        print(f"    Album:  {album}")
        print(f"    Track:  {track}")
        print(f"    Disc:   {disc}")
        return True

    try:
        audio = mutagen.mp3.MP3(filepath)
        audio.tags = mutagen.id3.ID3()
        audio.tags.add(mutagen.id3.TIT2(encoding=3, text=title))
        audio.tags.add(mutagen.id3.TPE1(encoding=3, text=artist))
        audio.tags.add(mutagen.id3.TALB(encoding=3, text=album))
        audio.tags.add(mutagen.id3.TRCK(encoding=3, text=str(track)))
        audio.tags.add(mutagen.id3.TPOS(encoding=3, text=str(disc)))
        audio.save()
        print(f"  Tagged: {fname} ← '{title}' | {album} | T{track} CD{disc}")
        return True
    except Exception as e:
        print(f"  FAILED: {fname}: {e}", file=sys.stderr)
        return False

def main():
    parser = argparse.ArgumentParser(description='Tag Delfin audio files with ID3 metadata')
    parser.add_argument('--dir', default=AUDIO_DIR, help=f'Audio directory (default: {AUDIO_DIR})')
    parser.add_argument('--dry-run', action='store_true', help='Preview only')
    args = parser.parse_args()

    if not HAS_MUTAGEN:
        print("ERROR: mutagen not installed. Install with: pip install mutagen")
        sys.exit(1)

    audio_dir = args.dir
    if not os.path.isdir(audio_dir):
        print(f"ERROR: Directory not found: {audio_dir}")
        sys.exit(1)

    mp3s = sorted(glob.glob(os.path.join(audio_dir, "Delfin_*.mp3")))
    print(f"Found {len(mp3s)} Delfin MP3s in {audio_dir}")
    if args.dry_run:
        print("DRY RUN — no changes will be made\n")

    ok = 0
    fail = 0
    skip = 0
    for path in mp3s:
        fname = os.path.basename(path)
        meta = parse_filename(fname)
        if not meta:
            print(f"  SKIP (unparseable): {fname}")
            skip += 1
            continue
        if write_tags(path, meta, args.dry_run):
            ok += 1
        else:
            fail += 1

    print(f"\nDone: {ok} tagged, {fail} failed, {skip} skipped")
    if args.dry_run:
        print("Run without --dry-run to write tags.")

if __name__ == "__main__":
    main()
