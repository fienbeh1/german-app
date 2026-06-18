#!/usr/bin/env python3
"""
Rename ALL audio files to a consistent naming scheme AND update metadata.

Naming scheme:
    {BookName}_{Source}_{CD_Label}_T{NN}_{Description}.mp3

Example:
    Lagune1_KB_CD1_T01_Arbeitsbuch_Hueber_Lagune_1_01.mp3
    SchritteA1.1_KB_CD1_T26_Kursbuch_1_4.mp3

Processing steps:
  1. Discover all mp3/m4a/wav files in DE base directory
  2. Extract metadata from filename, path, audio_index, annotations
  3. Group files by book based on directory structure
  4. Propose new names with book, source, cd, track, description
  5. Optionally rename files in-place
  6. Optionally update audio_index in DB
  7. Optionally write ID3 tags (mutagen)

Usage:
    python3 rename_and_index.py --dry-run
    python3 rename_and_index.py --book Lagune_1 --rename --tag --db
    python3 rename_and_index.py --rename --tag --db
"""

import os, sys, json, re, csv, hashlib, logging, argparse
from collections import defaultdict
from datetime import datetime
from pathlib import Path

AUDIO_EXTS = {'.mp3', '.m4a', '.wav', '.ogg', '.flac', '.wma'}
MUTAGEN_AVAILABLE = False
try:
    import mutagen
    import mutagen.mp3
    import mutagen.mp4
    import mutagen.wave
    MUTAGEN_AVAILABLE = True
except ImportError:
    pass

PSYCOPG_AVAILABLE = False
try:
    import psycopg2
    PSYCOPG_AVAILABLE = True
except ImportError:
    pass

BASE = os.environ.get('DEUTSCH_APP_DIR', '/home/f/deutsch-app/de')
LOG = logging.getLogger('rename_audio')

BOOK_ALIASES = {
    # Canonical short name -> regex patterns to match directory names
    'Lagune1':       [r'^Lagune[_\s]*1\b', r'^Lagune[-_]1\b'],
    'Lagune2':       [r'^Lagune[_\s]*2\b', r'^Lagune[-_]2\b'],
    'Lagune3':       [r'^Lagune[_\s]*3\b', r'^Lagune[-_]3\b'],
    'Tangram1':      [r'^Tangram[_\s]*1\b', r'^Tangram[-_]1\b'],
    'Tangram2':      [r'^Tangram[_\s]*2\b', r'^Tangram[-_]2\b'],
    'Tangram3':      [r'^Tangram[_\s]*3\b', r'^Tangram[-_]3\b'],
    'SchritteA1.1':  [r'Schritte.*?Plus.*?Neu.*?A1\.1', r'Schritte.*?A1\.1'],
    'SchritteA1.2':  [r'Schritte.*?plus.*?neu.*?A1\.2', r'Schritte.*?A1\.2'],
    'SchritteA2.1':  [r'Schritte.*?plus.*?neu.*?A2\.1', r'Schritte.*?A2\.1'],
    'SchritteA2.2':  [r'Schritte.*?plus.*?neu.*?A2\.2', r'Schritte.*?A2\.2'],
    'SchritteB1.1':  [r'Schritte.*?plus.*?neu.*?B1\.1', r'Schritte.*?B1\.1'],
    'SchritteB1.2':  [r'Schritte.*?plus.*?neu.*?B1\.2', r'Schritte.*?B1\.2'],
    'SchritteInt1':  [r'Schritte\s*International\s*1', r'Schritte[-_]Int[ea]rnational[-_]1'],
    'Delfin':        [r'^delfin\b', r'^Delfin\b'],
    'Menschen':      [r'^Menschen\b'],
    'B2_EM_Neu':     [r'B2\s*EM\s*Neu', r'B2[_-]EM[_-]Neu'],
    'Neu_B1_Plus':   [r'Neu[_-]B1[_-]Plus', r'Neu[- ]B1[- ]Plus'],
    'Varied_Books':  [r'^Varied[_-]Books\b'],
    'Verbs':         [r'^Verbs\b'],
    'B1_Plus':       [r'^B1[_-]?[Pp]lus\b'],
}

SOURCE_LABELS = {
    'kursbuch': 'KB',
    'kursbuchteil': 'KB',
    'kursbuch hörtexte': 'KB',
    'kb': 'KB',
    'arbeitsbuch': 'AB',
    'arbeitsbuchteil': 'AB',
    'arbeitsbuch hörtexte': 'AB',
    'ab': 'AB',
    'lehrerhandbuch': 'LH',
    'lh': 'LH',
    'übungsgrammatik': 'UG',
    'übungsgrammatik v2': 'UG',
}

REVERSE_SOURCE = {
    'KB': 'Kursbuch',
    'AB': 'Arbeitsbuch',
    'LH': 'Lehrerhandbuch',
    'UG': 'Ubungsgrammatik',
}


def detect_book_name(dirname):
    """Map a top-level directory name to a canonical book short name."""
    for book, patterns in BOOK_ALIASES.items():
        for pat in patterns:
            if re.search(pat, dirname, re.IGNORECASE):
                return book
    return dirname.replace(' ', '').replace('_', '').replace('-', '')[:30]


def detect_source_from_path(rel_path, dirname):
    """Detect source (KB, AB, LH) from directory path or filename."""
    parts = rel_path.split(os.sep)
    combined = ' '.join(parts).lower()
    fname = parts[-1].lower() if parts else ''
    combined_with_name = combined + ' ' + fname

    for label, code in SOURCE_LABELS.items():
        if label in combined_with_name:
            return code

    if re.search(r'\bAB\b', combined_with_name):
        return 'AB'
    if re.search(r'\bKB\b', combined_with_name):
        return 'KB'

    if 'kursbuch' in combined:
        return 'KB'
    if 'arbeitsbuch' in combined:
        return 'AB'
    if 'lehrerhandbuch' in combined:
        return 'LH'
    if 'übungsgrammatik' in combined or 'ubungsgrammatik' in combined:
        return 'UG'

    if 'kursbuch' in fname:
        return 'KB'
    if 'arbeitsbuch' in fname:
        return 'AB'

    return 'KB'


def extract_cd_number(rel_path, filename_no_ext, info=None):
    """Extract CD number from path, filename, or audio_index info."""
    parts = rel_path.split(os.sep)

    for p in parts[:-1]:
        m = re.search(r'(?:CD|Disk|Disc)\s*(\d+)', p, re.IGNORECASE)
        if m:
            return int(m.group(1))

    m = re.search(r'(?:CD|Disk|Disc)[_\s]*(\d+)', filename_no_ext, re.IGNORECASE)
    if m:
        return int(m.group(1))

    m = re.search(r'CD[_\s]*(\d+)', filename_no_ext, re.IGNORECASE)
    if m:
        return int(m.group(1))

    if info and info.get('cd_num') is not None:
        return int(info['cd_num'])

    return None


def extract_track_number(filename_no_ext, info=None):
    """Extract track number from filename."""
    m = re.search(r'[Tt]rack\s*(\d+)', filename_no_ext)
    if m:
        return int(m.group(1))

    m = re.search(r'(?:Track|Bande)[_\s]*(\d+)', filename_no_ext, re.IGNORECASE)
    if m:
        return int(m.group(1))

    m = re.search(r'_T(\d+)(?:_|\.)', filename_no_ext)
    if m:
        return int(m.group(1))

    m = re.match(r'(\d+)\s*[-–]', filename_no_ext)
    if m:
        return int(m.group(1))

    m = re.search(r'(\d+)\s*[-–]\s*(?:Track)?', filename_no_ext)
    if m:
        return int(m.group(1))

    m = re.search(r'Seite\s*(\d+)', filename_no_ext, re.IGNORECASE)
    if m:
        return int(m.group(1))

    nums = re.findall(r'(\d+)', filename_no_ext)
    if nums:
        return int(nums[-1])

    if info and info.get('track_num') is not None:
        return int(info['track_num'])

    return None


def clean_description(filename_no_ext, rel_path, source_code):
    """Build a clean description from the filename."""
    desc = filename_no_ext

    desc = re.sub(r'CD[_\s]*\d+', '', desc, flags=re.IGNORECASE)
    desc = re.sub(r'(?:Track|Bande)[_\s]*\d+', '', desc, flags=re.IGNORECASE)
    desc = re.sub(r'[Tt]rack\s*\d+', '', desc)
    desc = re.sub(r'Lektion[_\s]*\d+', '', desc, flags=re.IGNORECASE)
    desc = re.sub(r'^\d{5,6}[_/\\]', '', desc)
    desc = re.sub(r'^\d+\s*[-–]\s*', '', desc)
    desc = re.sub(r'_T\d+', '', desc)
    desc = re.sub(r'^\d+\s*', '', desc)
    desc = re.sub(r'\s+', ' ', desc).strip().rstrip('.-–_ ')
    desc = re.sub(r'\s*[-–]\s*$', '', desc)

    desc = re.sub(r'[^\w\s\-äöüßÄÖÜ]', '', desc, flags=re.UNICODE)
    desc = re.sub(r'\s+', '_', desc.strip())
    desc = desc.strip('_')

    dir_context = [p for p in rel_path.split(os.sep)[:-1]
                   if p.lower() not in ('audio', '') and not p.startswith('.')]
    if not desc or len(desc) < 3:
        if dir_context:
            desc = dir_context[-1][:40]
            desc = re.sub(r'[^\w\s\-äöüßÄÖÜ]', '', desc, flags=re.UNICODE)
            desc = desc.replace(' ', '_')
        else:
            desc = 'audio'

    desc = desc[:80]
    return desc


def compute_md5(filepath):
    """Compute MD5 hash of a file."""
    h = hashlib.md5()
    with open(filepath, 'rb') as f:
        for chunk in iter(lambda: f.read(65536), b''):
            h.update(chunk)
    return h.hexdigest()


def discover_audio_files(root, book_filter=None):
    """Discover all audio files, grouped by top-level book directory."""
    book_files = defaultdict(list)
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if not d.startswith('.') and d != '__pycache__']
        for f in filenames:
            ext = os.path.splitext(f)[1].lower()
            if ext not in AUDIO_EXTS:
                continue
            rel = os.path.relpath(dirpath, root)
            book_key = rel.split(os.sep)[0]
            if book_filter and book_key != book_filter:
                continue
            book_files[book_key].append(os.path.join(dirpath, f))
    return book_files


def load_audio_index(conn=None):
    """Load audio_index rows into a list of dicts, optionally from DB or JSON."""
    rows = []
    if conn and PSYCOPG_AVAILABLE:
        try:
            cur = conn.cursor()
            cur.execute("""
                SELECT id, file_name, file_path, directory, book_name,
                       track_num, cd_num, duration_secs, file_size, md5_hash, linked_page
                FROM audio_index
            """)
            cols = [desc[0] for desc in cur.description]
            for row in cur.fetchall():
                rows.append(dict(zip(cols, row)))
        except Exception as e:
            LOG.warning(f"Could not load audio_index from DB: {e}")

    json_path = os.path.join(BASE, 'audio_index.json')
    if not rows and os.path.exists(json_path):
        try:
            with open(json_path) as f:
                rows = json.load(f)
        except Exception as e:
            LOG.warning(f"Could not load audio_index from JSON: {e}")

    return rows


def load_annotation_refs(book_key):
    """Load audio references from annotation JSONs for a book."""
    book_path = os.path.join(BASE, book_key)
    candidates = [
        os.path.join(book_path, 'txt', 'annotations'),
        os.path.join(book_path, 'Lehrerhandbuch', 'txt', 'annotations'),
    ]
    refs = []
    for ann_dir in candidates:
        if not os.path.isdir(ann_dir):
            continue
        for fname in sorted(os.listdir(ann_dir)):
            if not fname.endswith('.json'):
                continue
            fpath = os.path.join(ann_dir, fname)
            try:
                with open(fpath) as f:
                    data = json.load(f)
            except Exception:
                continue
            for a in data.get('audio', []):
                cd = a.get('cd')
                track = a.get('track')
                page = None
                m = re.search(r'(\d+)', fname)
                if m:
                    page = int(m.group(1))
                refs.append({
                    'cd': int(cd) if cd and str(cd).isdigit() else cd,
                    'track': int(track) if track and str(track).isdigit() else track,
                    'anweisung': a.get('anweisung', ''),
                    'page': page,
                })
    return refs


def build_new_name(book_name, source, cd_num, track_num, description, ext):
    """Build the canonical new filename."""
    cd_str = f"CD{cd_num}" if cd_num is not None else "CD0"
    track_str = f"T{int(track_num):02d}" if track_num is not None else "T00"
    desc_str = description if description else "audio"
    return f"{book_name}_{source}_{cd_str}_{track_str}_{desc_str}{ext}"


def write_id3_tags(filepath, book_name, source, cd_num, track_num, description):
    """Write ID3/MP4 metadata tags to audio file."""
    if not MUTAGEN_AVAILABLE:
        LOG.debug(f"mutagen not available, skipping tags for {filepath}")
        return False

    ext = os.path.splitext(filepath)[1].lower()
    try:
        if ext == '.mp3':
            audio = mutagen.mp3.MP3(filepath)
            audio.tags = mutagen.id3.ID3()
            audio.tags.add(mutagen.id3.TIT2(encoding=3, text=description or Path(filepath).stem))
            audio.tags.add(mutagen.id3.TPE1(encoding=3, text=book_name))
            audio.tags.add(mutagen.id3.TALB(encoding=3, text=f"{book_name} - {source}"))
            if track_num is not None:
                audio.tags.add(mutagen.id3.TRCK(encoding=3, text=str(track_num)))
            if cd_num is not None:
                audio.tags.add(mutagen.id3.TPOS(encoding=3, text=str(cd_num)))
            audio.save()
            return True
        elif ext == '.m4a':
            audio = mutagen.mp4.MP4(filepath)
            audio['\xa9nam'] = description or Path(filepath).stem
            audio['\xa9ART'] = book_name
            audio['\xa9alb'] = f"{book_name} - {source}"
            if track_num is not None:
                audio['trkn'] = [(int(track_num), 0)]
            audio.save()
            return True
        elif ext == '.wav':
            try:
                audio = mutagen.wave.WAVE(filepath)
                info = mutagen.id3.ID3(filepath) if hasattr(mutagen, 'id3') else None
                if info:
                    info.add(mutagen.id3.TIT2(encoding=3, text=description or Path(filepath).stem))
                    info.save(filepath)
                    return True
            except Exception:
                pass
    except Exception as e:
        LOG.warning(f"Failed to write tags to {filepath}: {e}")
    return False


def main():
    parser = argparse.ArgumentParser(
        description='Rename and index audio files for Deutsch Lern App')
    parser.add_argument('--dry-run', action='store_true',
                       help='Show what would change without making changes')
    parser.add_argument('--book', type=str, default=None,
                       help='Process only one book directory (e.g., Lagune_1)')
    parser.add_argument('--rename', action='store_true',
                       help='Actually rename files')
    parser.add_argument('--tag', action='store_true',
                       help='Write ID3/MP4 tags with metadata')
    parser.add_argument('--db', action='store_true',
                       help='Update audio_index in PostgreSQL database')
    parser.add_argument('--base', type=str, default=BASE,
                       help=f'Base directory for audio files (default: {BASE})')
    parser.add_argument('--log', type=str, default=None,
                       help='Log file path (default: stderr)')
    parser.add_argument('--csv', type=str, default=None,
                       help='Path for rename log CSV (default: rename_log_TIMESTAMP.csv)')
    args = parser.parse_args()

    base_dir = os.path.abspath(args.base)

    log_level = logging.INFO
    log_handler = logging.StreamHandler(sys.stderr)
    if args.log:
        log_handler = logging.FileHandler(args.log)
    log_handler.setFormatter(logging.Formatter(
        '%(asctime)s [%(levelname)s] %(message)s', datefmt='%H:%M:%S'))
    LOG.addHandler(log_handler)
    LOG.setLevel(log_level)

    LOG.info(f"Base directory: {base_dir}")
    LOG.info(f"Dry run: {args.dry_run}")
    LOG.info(f"Target book: {args.book or 'ALL'}")
    LOG.info(f"Rename: {args.rename}")
    LOG.info(f"Tag: {args.tag}")
    LOG.info(f"DB update: {args.db}")
    LOG.info(f"Mutagen available: {MUTAGEN_AVAILABLE}")
    LOG.info(f"Psycopg2 available: {PSYCOPG_AVAILABLE}")

    conn = None
    if args.db and PSYCOPG_AVAILABLE:
        try:
            conn = psycopg2.connect(
                host='/var/run/postgresql',
                user='f',
                dbname='deutsch',
            )
            conn.autocommit = False
            LOG.info("Connected to PostgreSQL database 'deutsch'")
        except Exception as e:
            LOG.error(f"Failed to connect to database: {e}")
            conn = None

    audio_index_rows = load_audio_index(conn)

    LOG.info(f"Loaded {len(audio_index_rows)} rows from audio_index")

    by_path = {}
    by_md5 = {}
    by_filename = defaultdict(list)
    for row in audio_index_rows:
        by_path[row.get('file_path', '')] = row
        if row.get('md5_hash'):
            by_md5[row['md5_hash']] = row
        fname = row.get('file_name', '')
        by_filename[fname.lower()].append(row)
        name_no_ext = os.path.splitext(fname)[0].lower()
        by_filename[name_no_ext].append(row)

    book_files = discover_audio_files(base_dir, args.book)
    LOG.info(f"Found {sum(len(v) for v in book_files.values())} audio files in {len(book_files)} books")

    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    csv_path = args.csv or f"rename_log_{timestamp}.csv"
    rename_log = []

    total_processed = 0
    total_renamed = 0
    total_tagged = 0
    total_db_updated = 0
    total_errors = 0
    total_skipped = 0

    for book_key in sorted(book_files.keys()):
        files = sorted(book_files[book_key])
        LOG.info(f"\n{'='*60}")
        LOG.info(f"Book: {book_key} ({len(files)} files)")

        book_name = detect_book_name(book_key)
        LOG.info(f"  Canonical name: {book_name}")

        ann_refs = load_annotation_refs(book_key)
        if ann_refs:
            LOG.info(f"  Annotation refs: {len(ann_refs)}")

        for filepath in files:
            total_processed += 1
            rel_path = os.path.relpath(filepath, base_dir)
            fname = os.path.basename(filepath)
            fname_no_ext = os.path.splitext(fname)[0]
            ext = os.path.splitext(fname)[1].lower()
            fsize = os.path.getsize(filepath)

            matched_index = by_path.get(filepath)
            if not matched_index:
                try:
                    md5 = compute_md5(filepath)
                    matched_index = by_md5.get(md5)
                except Exception as e:
                    LOG.debug(f"  MD5 error for {fname}: {e}")
                    matched_index = None

            if not matched_index:
                candidates = by_filename.get(fname.lower(), [])
                if len(candidates) == 1:
                    matched_index = candidates[0]
                else:
                    name_no_ext_lower = fname_no_ext.lower()
                    matched_by_ext = [r for r in by_filename[name_no_ext_lower]
                                     if os.path.splitext(r.get('file_name', ''))[1].lower() == ext]
                    if len(matched_by_ext) == 1:
                        matched_index = matched_by_ext[0]

            source = detect_source_from_path(rel_path, book_key)
            cd_num = extract_cd_number(rel_path, fname_no_ext, matched_index)
            track_num = None

            if matched_index:
                ai_track = matched_index.get('track_num')
                if ai_track is not None:
                    track_num = int(ai_track)
                if cd_num is None:
                    ai_cd = matched_index.get('cd_num')
                    if ai_cd is not None:
                        cd_num = int(ai_cd)

            if track_num is None:
                track_num = extract_track_number(fname_no_ext, matched_index)

            description = clean_description(fname_no_ext, rel_path, source)

            for ref in ann_refs:
                r_cd = ref.get('cd')
                r_track = ref.get('track')
                if isinstance(r_cd, int) and isinstance(r_track, int):
                    if cd_num == r_cd and track_num == r_track:
                        if ref.get('anweisung') and len(description) < 5:
                            anw = ref['anweisung']
                            anw_clean = re.sub(r'[^\w\s\-äöüßÄÖÜ]', '', anw, flags=re.UNICODE)
                            anw_clean = anw_clean.replace(' ', '_')[:60]
                            if anw_clean:
                                description = anw_clean
                        if ref.get('page'):
                            pass

            new_name = build_new_name(book_name, source, cd_num, track_num, description, ext)
            new_path = os.path.join(os.path.dirname(filepath), new_name)

            needs_rename = (fname != new_name)
            rename_log.append({
                'book': book_key,
                'canonical_book': book_name,
                'source': source,
                'old_path': rel_path,
                'new_name': new_name,
                'cd': cd_num,
                'track': track_num,
                'file_size': fsize,
                'needs_rename': needs_rename,
                'status': '',
            })

            if needs_rename:
                LOG.info(f"  {fname:55s} → {new_name}")
            else:
                LOG.debug(f"  {fname:55s} (name OK)")

            if args.dry_run:
                continue

            if needs_rename and args.rename:
                if os.path.exists(new_path):
                    LOG.warning(f"  Target exists, skipping rename: {new_name}")
                    rename_log[-1]['status'] = 'SKIP_TARGET_EXISTS'
                    total_skipped += 1
                else:
                    try:
                        os.rename(filepath, new_path)
                        LOG.info(f"  RENAMED: {fname} → {new_name}")
                        rename_log[-1]['status'] = 'RENAMED'
                        total_renamed += 1
                    except Exception as e:
                        LOG.error(f"  RENAME FAILED: {fname} → {new_name}: {e}")
                        rename_log[-1]['status'] = f'ERROR: {e}'
                        total_errors += 1
                        continue

            if args.tag and (needs_rename or args.rename):
                tag_path = new_path if (needs_rename and args.rename) else filepath
                if args.dry_run:
                    pass
                else:
                    ok = write_id3_tags(tag_path, book_name, source, cd_num, track_num, description)
                    if ok:
                        total_tagged += 1
                        LOG.debug(f"  Tags written to {os.path.basename(tag_path)}")

            if args.db and conn and PSYCOPG_AVAILABLE and (needs_rename or args.rename):
                actual_path = new_path if (needs_rename and args.rename) else filepath
                actual_rel = os.path.relpath(actual_path, base_dir)
                actual_name = os.path.basename(actual_path)
                try:
                    cur = conn.cursor()
                    if matched_index:
                        sql = """
                            UPDATE audio_index
                            SET file_name = %s,
                                file_path = %s,
                                cd_num = %s,
                                track_num = %s,
                                book_name = %s
                            WHERE id = %s
                        """
                        cur.execute(sql, (
                            actual_name, actual_rel,
                            cd_num, track_num,
                            book_name,
                            matched_index['id']
                        ))
                    else:
                        try:
                            new_md5 = md5 if 'md5' in dir() else compute_md5(actual_path)
                        except Exception:
                            new_md5 = None
                        sql = """
                            INSERT INTO audio_index
                                (file_name, file_path, directory, book_name,
                                 track_num, cd_num, file_size, md5_hash)
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                            ON CONFLICT DO NOTHING
                        """
                        cur.execute(sql, (
                            actual_name, actual_rel,
                            os.path.dirname(actual_rel),
                            book_name,
                            track_num, cd_num,
                            fsize, new_md5
                        ))
                    if cur.rowcount > 0:
                        total_db_updated += cur.rowcount
                    conn.commit()
                except Exception as e:
                    LOG.warning(f"  DB update failed for {actual_name}: {e}")
                    conn.rollback()

    LOG.info(f"\n{'='*60}")
    LOG.info("SUMMARY")
    LOG.info(f"  Total files scanned: {total_processed}")
    LOG.info(f"  Renamed: {total_renamed}")
    LOG.info(f"  Tagged: {total_tagged}")
    LOG.info(f"  DB rows updated/inserted: {total_db_updated}")
    LOG.info(f"  Errors: {total_errors}")
    LOG.info(f"  Skipped: {total_skipped}")

    csv_columns = ['book', 'canonical_book', 'source', 'old_path', 'new_name',
                   'cd', 'track', 'file_size', 'needs_rename', 'status']
    try:
        with open(csv_path, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=csv_columns, extrasaction='ignore')
            writer.writeheader()
            writer.writerows(rename_log)
        LOG.info(f"  Rename log written to: {csv_path}")
    except Exception as e:
        LOG.error(f"  Failed to write CSV: {e}")

    if conn:
        conn.close()
        LOG.info("Database connection closed")

    if args.dry_run:
        LOG.info("\nDRY RUN — no changes were made. Run with --rename to execute.")


if __name__ == '__main__':
    main()
