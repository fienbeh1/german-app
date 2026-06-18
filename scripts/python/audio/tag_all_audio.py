#!/usr/bin/env python3
"""
tag_all_audio.py — Write ID3 metadata to ALL Deutsch Lern App audio files.

Scans every book directory, extracts book/source/CD/track info from
path and filename, then writes Title/Artist/Album/Track/Disc tags.

No file renaming — just metadata. Run per book or all at once.

Usage:
    python3 tag_all_audio.py                          # all books
    python3 tag_all_audio.py --book Delfin            # one book
    python3 tag_all_audio.py --book Lagune_1 --dry-run
    python3 tag_all_audio.py --dry-run                # preview only
"""

import argparse
import glob
import os
import re
import sys
from collections import defaultdict
from pathlib import Path

try:
    import mutagen
    import mutagen.id3
    import mutagen.mp3
    import mutagen.mp4
    HAS_MUTAGEN = True
except ImportError:
    HAS_MUTAGEN = False

BASE = "/home/f/deutsch-app/de"
AUDIO_EXTS = {'.mp3', '.m4a', '.wav', '.ogg', '.flac'}

BOOK_ALIASES = {
    'Lagune1':       [r'^Lagune[_\s]*1\b'],
    'Lagune2':       [r'^Lagune[_\s]*2\b'],
    'Lagune3':       [r'^Lagune[_\s]*3\b'],
    'Tangram1':      [r'^Tangram[_\s]*1\b'],
    'Tangram2':      [r'^Tangram[_\s]*2\b'],
    'Tangram3':      [r'^Tangram[_\s]*3\b'],
    'SchritteA1.1':  [r'Schritte.*?Plus.*?Neu.*?A1\.1', r'Schritte.*?A1\.1'],
    'SchritteA1.2':  [r'Schritte.*?plus.*?neu.*?A1\.2', r'Schritte.*?A1\.2'],
    'SchritteA2.1':  [r'Schritte.*?plus.*?neu.*?A2\.1', r'Schritte.*?A2\.1'],
    'SchritteA2.2':  [r'Schritte.*?plus.*?neu.*?A2\.2', r'Schritte.*?A2\.2'],
    'SchritteB1.1':  [r'Schritte.*?plus.*?neu.*?B1\.1', r'Schritte.*?B1\.1'],
    'SchritteB1.2':  [r'Schritte.*?plus.*?neu.*?B1\.2', r'Schritte.*?B1\.2'],
    'SchritteInt1':  [r'Schritte\s*International\s*1'],
    'Delfin':        [r'^delfin\b', r'^Delfin\b'],
    'Menschen':      [r'^Menschen\b'],
    'B2_EM_Neu':     [r'B2\s*EM\s*Neu', r'B2[_-]EM[_-]Neu'],
    'Neu_B1_Plus':   [r'Neu[_-]B1[_-]Plus'],
    'Varied_Books':  [r'^Varied[_-]Books\b'],
    'Verbs':         [r'^Verbs\b'],
}

SOURCE_LABELS = {
    'kursbuch': 'Kursbuch', 'kursbuchteil': 'Kursbuch',
    'kb': 'Kursbuch', 'arbeitsbuch': 'Arbeitsbuch',
    'arbeitsbuchteil': 'Arbeitsbuch', 'ab': 'Arbeitsbuch',
    'lehrerhandbuch': 'Lehrerhandbuch', 'lh': 'Lehrerhandbuch',
    'übungsgrammatik': 'Übungsgrammatik', 'ubungsgrammatik': 'Übungsgrammatik',
}

CLEAN_BOOK_NAMES = {
    'Lagune1': 'Lagune 1',
    'Lagune2': 'Lagune 2',
    'Lagune3': 'Lagune 3',
    'Tangram1': 'Tangram 1',
    'Tangram2': 'Tangram 2',
    'Tangram3': 'Tangram 3',
    'SchritteA1.1': 'Schritte Plus Neu A1.1',
    'SchritteA1.2': 'Schritte Plus Neu A1.2',
    'SchritteA2.1': 'Schritte Plus Neu A2.1',
    'SchritteA2.2': 'Schritte Plus Neu A2.2',
    'SchritteB1.1': 'Schritte Plus Neu B1.1',
    'SchritteB1.2': 'Schritte Plus Neu B1.2',
    'SchritteInt1': 'Schritte International 1',
    'Delfin': 'Delfin',
    'B2_EM_Neu': 'B2 EM Neu',
    'Neu_B1_Plus': 'Neu B1 Plus',
}


def detect_book(dirname):
    for book, patterns in BOOK_ALIASES.items():
        for pat in patterns:
            if re.search(pat, dirname, re.IGNORECASE):
                return book
    return dirname.replace(' ', '_')[:30]


def clean_book_name(book_key):
    return CLEAN_BOOK_NAMES.get(book_key, book_key)


def detect_source(rel_path):
    parts = rel_path.lower().split(os.sep)
    combined = ' '.join(parts)
    for label, name in SOURCE_LABELS.items():
        if label in combined:
            return name
    if 'lehrer' in combined:
        return 'Lehrerhandbuch'
    if 'ubungs' in combined:
        return 'Übungsgrammatik'
    return 'Kursbuch'


def extract_cd_track(fname_no_ext, rel_path):
    cd = None
    track = None

    # CD number from path or filename
    search = rel_path + ' ' + fname_no_ext
    m = re.search(r'(?:CD|Disk|Disc)[_\s]*(\d+)', search, re.IGNORECASE)
    if m:
        cd = int(m.group(1))

    # Track number
    m = re.search(r'[Tt]rack[_\s]*(\d+)', search, re.IGNORECASE)
    if m:
        track = int(m.group(1))
    if track is None:
        m = re.search(r'_T(\d+)', fname_no_ext)
        if m:
            track = int(m.group(1))
    if track is None:
        m = re.search(r'(\d+)\s*[-–]', fname_no_ext)
        if m:
            track = int(m.group(1))
    if track is None:
        nums = re.findall(r'\d+', fname_no_ext)
        if nums:
            track = int(nums[-1])

    return cd, track


def build_title(fname_no_ext, source, cd, track):
    parts = []
    if source:
        parts.append(source)
    if cd:
        parts.append(f'CD{cd}')
    parts.append(f'Track {track or "?"}')
    return ' - '.join(parts)


def write_mp3_tags(filepath, title, artist, album, track, disc):
    try:
        audio = mutagen.mp3.MP3(filepath)
        audio.tags = mutagen.id3.ID3()
        audio.tags.add(mutagen.id3.TIT2(encoding=3, text=title))
        audio.tags.add(mutagen.id3.TPE1(encoding=3, text=artist))
        audio.tags.add(mutagen.id3.TALB(encoding=3, text=album))
        if track:
            audio.tags.add(mutagen.id3.TRCK(encoding=3, text=str(track)))
        if disc:
            audio.tags.add(mutagen.id3.TPOS(encoding=3, text=str(disc)))
        audio.save()
        return True
    except Exception as e:
        print(f"    FAIL: {e}")
        return False


def write_m4a_tags(filepath, title, artist, album, track, disc):
    try:
        audio = mutagen.mp4.MP4(filepath)
        audio['\xa9nam'] = title
        audio['\xa9ART'] = artist
        audio['\xa9alb'] = album
        if track:
            audio['trkn'] = [(track, 0)]
        if disc:
            audio['disk'] = [(disc, 0)]
        audio.save()
        return True
    except Exception as e:
        print(f"    FAIL: {e}")
        return False


def tag_file(filepath, book_key, dry_run=False):
    fname = os.path.basename(filepath)
    fname_no_ext = os.path.splitext(fname)[0]
    ext = os.path.splitext(fname)[1].lower()
    rel_path = os.path.relpath(filepath, os.path.join(BASE, book_key))

    book_name = clean_book_name(detect_book(book_key))
    source = detect_source(rel_path)
    cd, track = extract_cd_track(fname_no_ext, rel_path)
    title = build_title(fname_no_ext, source, cd, track)
    artist = book_name
    album = f"{book_name}" + (f" - {source}" if source != 'Kursbuch' else "")

    if dry_run:
        print(f"  [{book_key}] {fname[:50]:50s} → Title={title[:35]:35s} Album={album[:35]:35s} Track={track} CD={cd}")
        return True

    if ext == '.mp3':
        return write_mp3_tags(filepath, title, artist, album, track, cd)
    elif ext == '.m4a':
        return write_m4a_tags(filepath, title, artist, album, track, cd)
    else:
        return False


def main():
    parser = argparse.ArgumentParser(description='Tag all Deutsch Lern App audio with ID3 metadata')
    parser.add_argument('--book', help='Process only one book directory')
    parser.add_argument('--dry-run', action='store_true', help='Preview only')
    args = parser.parse_args()

    if not HAS_MUTAGEN:
        print("ERROR: mutagen not installed. Install: pip install mutagen")
        sys.exit(1)

    # Discover books with audio
    books_audio = defaultdict(list)
    for entry in sorted(os.listdir(BASE)):
        dpath = os.path.join(BASE, entry)
        if not os.path.isdir(dpath) or entry.startswith('.'):
            continue
        if args.book and entry.lower() != args.book.lower() and detect_book(entry).lower() != args.book.lower():
            continue

        for root, dirs, files in os.walk(dpath):
            dirs[:] = [d for d in dirs if not d.startswith('.')]
            for f in files:
                if os.path.splitext(f)[1].lower() in AUDIO_EXTS:
                    books_audio[entry].append(os.path.join(root, f))

    total_books = len(books_audio)
    total_files = sum(len(v) for v in books_audio.values())
    print(f"Found {total_files} audio files in {total_books} book directories")
    if args.dry_run:
        print("DRY RUN — no changes will be made\n")

    ok, fail = 0, 0
    for book_key in sorted(books_audio.keys()):
        files = sorted(books_audio[book_key])
        book_name = clean_book_name(detect_book(book_key))
        print(f"\n{'='*60}")
        print(f"{book_name} ({book_key}): {len(files)} files")

        for fpath in files:
            if tag_file(fpath, book_key, args.dry_run):
                ok += 1
            else:
                fail += 1

    print(f"\n{'='*60}")
    print(f"Done: {ok} tagged, {fail} failed")
    if args.dry_run:
        print("Run without --dry-run to write tags.")


if __name__ == "__main__":
    main()
