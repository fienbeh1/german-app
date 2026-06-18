#!/usr/bin/env python3
"""
Process German-English Bilingual Visual Dictionary PDFs:
1. Extract raw text per page → parse German-English word pairs
2. Cross-reference translations with PostgreSQL dictionary table
3. Register pages in materials_registry
4. Generate AI content (structured word pairs JSON)
"""
import sys, os, re, json, subprocess, tempfile, argparse
from pathlib import Path
from collections import OrderedDict

import psycopg2
from psycopg2.extras import DictCursor

DB_DSN = "dbname=deutsch user=f host=/var/run/postgresql"

# Regex to detect a German word/entry line
# German nouns are capitalized, often with article der/die/das/dem/den/ein/eine
GERMAN_WORD_RE = re.compile(
    r'^(der |die |das |den |dem |ein |eine |einen |einer |einem |'
    r'des |eines )?(?P<word>[A-ZÄÖÜ][a-zäöüßA-ZÄÖÜ\-]+.*)$'
)

# Lines that are NOT word pairs
SKIP_LINES = re.compile(
    r'^(deutsch\s*[•·]\s*english|english\s*[•·]\s*deutsch|'
    r'\d+\s*$|'
    r'Vokabular\s*[•·]\s*vocabulary|'
    r'Inhalt\s*[•·]\s*contents)$'
)

SECTION_HEADER_RE = re.compile(r'[•·]')

def extract_text_page(pdf_path, page_num):
    """Extract raw text from a single PDF page."""
    result = subprocess.run(
        ['pdftotext', '-f', str(page_num), '-l', str(page_num),
         str(pdf_path), '-'],
        capture_output=True, text=True
    )
    return result.stdout

def is_german_word(line):
    """Check if a line looks like a German word entry."""
    if not line:
        return False
    if line.startswith(('der ', 'die ', 'das ', 'den ', 'dem ',
                        'ein ', 'eine ', 'einen ', 'einer ', 'einem ', 'des ')):
        return True
    if line[0].isupper() and not line.startswith(('Vokabular', 'Inhalt', 'deutsch', 'english')):
        return True
    return False

def is_artifact(line):
    """Check if line is a production artifact."""
    if not line:
        return True
    return ('qxd' in line.lower() or 'Page' in line or
            'TEXT BLACK plate' in line or
            re.match(r'^[\d/:\s]{3,}$', line) or
            re.match(r'^US\s*$', line) or
            line.startswith('DK') or
            'www.dk.com' in line or 'Copyright' in line or
            'All rights reserved' in line or
            line == '\f')

def parse_word_pairs(text):
    """
    Parse raw PDF text into German-English word pairs.
    Two-phase approach:
    1. Clean & normalize lines (merge broken words, remove artifacts)
    2. Extract alternating German-English pairs
    """
    raw_lines = [l.strip() for l in text.split('\n')]
    
    # Phase 1: Clean and normalize
    cleaned = []
    i = 0
    while i < len(raw_lines):
        line = raw_lines[i]
        i += 1
        
        # Skip empty, form feeds, and artifact lines
        if not line or line == '\f' or is_artifact(line):
            continue
        
        # Skip section headers (contain • or ·)
        if SECTION_HEADER_RE.search(line):
            continue
        
        # Skip known labels
        if SKIP_LINES.match(line):
            continue
        
        # Skip purely numeric lines (page numbers)
        if re.match(r'^\d{1,5}$', line):
            continue
        
        # Merge broken German words across lines (two-column layout)
        # Case 1: Line is just an article (der/die/das), next line is capitalized noun
        if line in ('der', 'die', 'das', 'den', 'dem', 'ein', 'eine', 'einen', 'einer', 'einem', 'des'):
            if i < len(raw_lines) and raw_lines[i] and raw_lines[i][0].isupper():
                line = line + ' ' + raw_lines[i]
                i += 1
        # Case 2: Line starts with article but ends with lowercase (incomplete adj+noun),
        # next line is capitalized noun (e.g., "der kleine\nFinger")
        elif any(line.startswith(a) for a in ('der ', 'die ', 'das ', 'den ', 'dem ', 'ein ', 'eine ')):
            words = line.split()
            if len(words) > 1 and words[-1][0].islower():
                if i < len(raw_lines) and raw_lines[i] and raw_lines[i][0].isupper():
                    line = line + ' ' + raw_lines[i]
                    i += 1
        
        cleaned.append(line)
    
    # Phase 2: Extract German-English pairs
    pairs = []
    i = 0
    while i < len(cleaned):
        line = cleaned[i]
        i += 1
        
        if not is_german_word(line):
            continue
        
        german = line
        
        # Collect English from following lines until next German word
        eng_parts = []
        while i < len(cleaned):
            next_line = cleaned[i]
            if is_german_word(next_line):
                break
            eng_parts.append(next_line)
            i += 1
        
        english = ' '.join(eng_parts).strip()
        
        # Skip pairs where English starts with a German article (parsing error)
        if english and not english.startswith(('die ', 'der ', 'das ', 'den ', 'dem ')):
            pairs.append((german, english))
    
    return pairs

def lookup_dictionary(cursor, german_word):
    """Look up a German word in the dictionary table. Returns english translation or None."""
    # Try exact match first
    cursor.execute(
        "SELECT english FROM dictionary WHERE german_word = %s LIMIT 1",
        (german_word,)
    )
    row = cursor.fetchone()
    if row:
        return row[0]
    
    # Try without trailing punctuation
    clean = german_word.rstrip('.,;:!?')
    if clean != german_word:
        cursor.execute(
            "SELECT english FROM dictionary WHERE german_word = %s LIMIT 1",
            (clean,)
        )
        row = cursor.fetchone()
        if row:
            return row[0]
    
    # Try with ILIKE for fuzzy match
    cursor.execute(
        "SELECT german_word, english FROM dictionary WHERE german_word ILIKE %s LIMIT 1",
        (clean,)
    )
    row = cursor.fetchone()
    if row:
        return row[1]
    
    # Try removing the article and searching base word
    for prefix in ('der ', 'die ', 'das ', 'den ', 'dem ', 'ein ', 'eine ', 'einen ', 'einer ', 'einem '):
        if clean.startswith(prefix):
            base = clean[len(prefix):]
            cursor.execute(
                "SELECT english FROM dictionary WHERE german_word ILIKE %s LIMIT 1",
                (base,)
            )
            row = cursor.fetchone()
            if row:
                return row[0]
            break
    
    # Try joining words that may have been split by layout (e.g., "Mittelhand knochen" → "Mittelhandknochen")
    words = clean.split()
    if len(words) >= 2:
        joined = ''.join(words)
        cursor.execute(
            "SELECT english FROM dictionary WHERE german_word ILIKE %s LIMIT 1",
            (joined,)
        )
        row = cursor.fetchone()
        if row:
            return row[0]
        
        # Also try with stripped article
        for prefix in ('der ', 'die ', 'das '):
            if joined.startswith(prefix):
                base = joined[len(prefix):]
                cursor.execute(
                    "SELECT english FROM dictionary WHERE german_word ILIKE %s LIMIT 1",
                    (base,)
                )
                row = cursor.fetchone()
                if row:
                    return row[0]
    
    return None

def main():
    parser = argparse.ArgumentParser(description='Process visual dictionary PDF')
    parser.add_argument('pdf_path', help='Path to the visual dictionary PDF')
    parser.add_argument('--book-name', help='Book name for registry (default: derived from filename)')
    parser.add_argument('--start-page', type=int, default=1, help='First page to process')
    parser.add_argument('--end-page', type=int, default=None, help='Last page to process')
    parser.add_argument('--skip-registry', action='store_true', help='Skip registration in materials_registry')
    parser.add_argument('--only-text', action='store_true', help='Only extract text, skip DB')
    args = parser.parse_args()
    
    pdf_path = Path(args.pdf_path)
    if not pdf_path.exists():
        print(f"ERROR: PDF not found: {pdf_path}")
        sys.exit(1)
    
    # Derive book name from filename
    book_name = args.book_name or pdf_path.stem
    
    # Determine book directory
    de_goethe = Path('/mnt/storage/deutsch-app/de/goethe')
    book_dir = de_goethe / book_name
    
    # Create structure if needed
    for d in ['txt', 'ai']:
        (book_dir / d).mkdir(parents=True, exist_ok=True)
    
    # Get page count
    result = subprocess.run(['pdfinfo', str(pdf_path)], capture_output=True, text=True)
    total_pages = None
    for line in result.stdout.split('\n'):
        if 'Pages' in line:
            total_pages = int(line.split(':')[1].strip())
            break
    
    if not total_pages:
        print("ERROR: Could not determine page count")
        sys.exit(1)
    
    end_page = args.end_page or total_pages
    print(f"Processing {book_name}: pages {args.start_page}-{end_page} of {total_pages}")
    
    # Connect to PostgreSQL
    conn = None
    cursor = None
    if not args.only_text:
        conn = psycopg2.connect(DB_DSN)
        cursor = conn.cursor(cursor_factory=DictCursor)
    
    stats = {'pages_with_content': 0, 'pages_empty': 0, 'total_pairs': 0, 'looked_up': 0, 'found_in_dict': 0}
    
    for page_num in range(args.start_page, end_page + 1):
        print(f"\rPage {page_num}/{end_page}...", end='', flush=True)
        
        # Extract text
        text = extract_text_page(pdf_path, page_num)
        if not text.strip() or text.strip() == '\f':
            stats['pages_empty'] += 1
            continue
        
        # Parse word pairs
        pairs = parse_word_pairs(text)
        if not pairs:
            stats['pages_empty'] += 1
        
        stats['pages_with_content'] += 1
        stats['total_pairs'] += len(pairs)
        
        # Write text file (the raw extraction)
        txt_path = book_dir / 'txt' / f'page-{page_num}.txt'
        txt_path.write_text(text)
        
        # Cross-reference with dictionary and build AI content
        ai_entries = []
        for german, english_from_page in pairs:
            entry = {'german': german, 'english': english_from_page}
            
            if cursor:
                stats['looked_up'] += 1
                dict_english = lookup_dictionary(cursor, german)
                if dict_english:
                    entry['dictionary_english'] = dict_english
                    entry['verified'] = True
                    stats['found_in_dict'] += 1
                else:
                    entry['verified'] = False
                    entry['dictionary_english'] = None
            
            ai_entries.append(entry)
        
        # Write AI content (structured JSON)
        ai_path = book_dir / 'ai' / f'page-{page_num}.json'
        ai_path.write_text(json.dumps({
            'page': page_num,
            'book': book_name,
            'pairs': ai_entries,
            'pair_count': len(ai_entries)
        }, ensure_ascii=False, indent=2))
        
        # Register in materials_registry
        if cursor and not args.skip_registry and pairs:
            pdf_rel = f"goethe/{book_name}/pdf/page-{page_num}.pdf"
            jpg_rel = f"goethe/{book_name}/pages/page-{page_num}.jpg"
            txt_rel = f"goethe/{book_name}/txt/page-{page_num}.txt"
            ai_rel = f"goethe/{book_name}/ai/page-{page_num}.json"
            
            cursor.execute("""
                INSERT INTO materials_registry
                    (book_name, page_num, pdf_path, txt_path, ai_path, jpg_path,
                     has_txt, has_ai, has_pdf)
                VALUES (%s, %s, %s, %s, %s, %s, true, true, true)
                ON CONFLICT (book_name, page_num)
                DO UPDATE SET
                    txt_path = EXCLUDED.txt_path,
                    ai_path = EXCLUDED.ai_path,
                    jpg_path = EXCLUDED.jpg_path,
                    pdf_path = EXCLUDED.pdf_path,
                    has_txt = true, has_ai = true, has_pdf = true,
                    dead = false
            """, (
                f"goethe/{book_name}", page_num,
                pdf_rel, txt_rel, ai_rel, jpg_rel
            ))
    
    # Commit DB changes
    if cursor:
        conn.commit()
    
    print(f"\n\nDone! Stats:")
    print(f"  Pages with content: {stats['pages_with_content']}")
    print(f"  Pages empty:        {stats['pages_empty']}")
    print(f"  Word pairs found:   {stats['total_pairs']}")
    if stats['looked_up'] > 0:
        print(f"  Dictionary lookups: {stats['looked_up']}")
        print(f"  Found in dict:      {stats['found_in_dict']}")
        print(f"  Missing from dict:  {stats['looked_up'] - stats['found_in_dict']}")
    
    if cursor:
        cursor.close()
    if conn:
        conn.close()

if __name__ == '__main__':
    main()
