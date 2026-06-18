#!/usr/bin/env python3
"""
Register pre-processed visual dictionary pages in materials_registry.
Batch lookup translations from dictionary table for speed.
"""
import sys, os, json, glob, re, time
from pathlib import Path
from collections import defaultdict

import psycopg2
from psycopg2.extras import DictCursor, RealDictCursor

DB_DSN = "dbname=deutsch user=f host=/var/run/postgresql"

def build_dict_lookup(cursor):
    """Build in-memory lookup from dictionary table."""
    print("Loading dictionary table into memory...")
    cursor.execute("SELECT german_word, english FROM dictionary")
    rows = cursor.fetchall()
    
    # Build lookup maps
    exact = {}
    lower = {}
    for r in rows:
        exact[r[0]] = r[1]
        lower[r[0].lower()] = r[1]
    
    print(f"  Loaded {len(exact)} entries")
    return exact, lower

def lookup_word(word, exact, lower):
    """Fast in-memory dictionary lookup."""
    clean = word.strip().rstrip('.,;:!?')
    
    # Exact match
    if clean in exact:
        return exact[clean]
    if clean in lower:
        return lower[clean]
    
    # Case-insensitive
    cl = clean.lower()
    if cl in lower:
        return lower[cl]
    
    # Remove article prefix
    for prefix in ('der ', 'die ', 'das ', 'den ', 'dem ', 'ein ', 'eine ', 'einen ', 'einer ', 'einem '):
        if clean.startswith(prefix):
            base = clean[len(prefix):]
            if base in exact:
                return exact[base]
            if base in lower:
                return lower[base]
            joined = base.replace(' ', '')
            if joined in exact:
                return exact[joined]
            break
    
    # Join split compounds
    words = clean.split()
    if len(words) >= 2:
        joined = ''.join(words)
        if joined in exact:
            return exact[joined]
        if joined in lower:
            return lower[joined]
        # Also try with just the first part (sometimes only partial match)
        if joined.lower() in lower:
            return lower[joined.lower()]
    
    return None

def main():
    import argparse
    parser = argparse.ArgumentParser(description='Register visual dictionary in materials_registry')
    parser.add_argument('book_dir', help='Path to book directory')
    parser.add_argument('--book-name', help='Book name for registry (default: derived from dirname)')
    parser.add_argument('--verify', action='store_true', help='Verify translations against dictionary')
    parser.add_argument('--missing-report', action='store_true', help='Show words missing from dictionary')
    parser.add_argument('--batch', type=int, default=50, help='DB batch size')
    args = parser.parse_args()
    
    book_dir = Path(args.book_dir)
    book_name = args.book_name or book_dir.name
    
    # Find all AI JSON files
    ai_files = sorted(book_dir.glob('ai/page-*.json'), key=lambda x: int(re.search(r'page-(\d+)', x.name).group(1)))
    print(f"Found {len(ai_files)} AI files in {book_dir}/ai/")
    
    # Load all pages data
    pages_data = {}
    unique_words = set()
    for ai_path in ai_files:
        page_match = re.search(r'page-(\d+)', ai_path.name)
        if not page_match:
            continue
        page_num = int(page_match.group(1))
        data = json.loads(ai_path.read_text())
        pairs = data.get('pairs', [])
        if pairs:
            pages_data[page_num] = pairs
            for p in pairs:
                unique_words.add(p['german'])
    
    print(f"Loaded {len(pages_data)} pages with {len(unique_words)} unique German words")
    
    conn = psycopg2.connect(DB_DSN)
    cursor = conn.cursor()
    
    # Build dictionary lookup
    dict_exact = {}
    dict_lower = {}
    if args.verify:
        dict_exact, dict_lower = build_dict_lookup(cursor)
    
    # Batch registration
    registry_book = f"goethe/{book_name}"
    stats = {
        'registered': 0, 'skipped_empty': 0,
        'lookups': 0, 'found': 0, 'missing_words': []
    }
    
    batch_values = []
    
    for page_num in sorted(pages_data.keys()):
        pairs = pages_data[page_num]
        
        # Verify translations
        verified_pairs = []
        for pair in pairs:
            german = pair['german']
            page_english = pair.get('english', '')
            entry = {'german': german, 'english': page_english}
            
            if args.verify:
                stats['lookups'] += 1
                dict_english = lookup_word(german, dict_exact, dict_lower)
                if dict_english:
                    entry['dictionary_english'] = dict_english
                    entry['verified'] = True
                    stats['found'] += 1
                else:
                    entry['verified'] = False
                    entry['dictionary_english'] = None
                    stats['missing_words'].append(german)
            
            verified_pairs.append(entry)
        
        # Write updated AI JSON
        ai_path = book_dir / 'ai' / f'page-{page_num}.json'
        ai_path.write_text(json.dumps({
            'page': page_num,
            'book': book_name,
            'pairs': verified_pairs,
            'pair_count': len(verified_pairs)
        }, ensure_ascii=False, indent=2))
        
        # Paths relative to project root
        pdf_rel = f"goethe/{book_name}/pdf/page-{page_num}.pdf"
        jpg_rel = f"goethe/{book_name}/pages/page-{page_num}.jpg"
        txt_rel = f"goethe/{book_name}/txt/page-{page_num}.txt"
        ai_rel = f"goethe/{book_name}/ai/page-{page_num}.json"
        
        batch_values.append((registry_book, page_num, pdf_rel, txt_rel, ai_rel, jpg_rel))
        
        if len(batch_values) >= args.batch:
            cursor.executemany("""
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
            """, batch_values)
            conn.commit()
            stats['registered'] += len(batch_values)
            batch_values = []
    
    if batch_values:
        cursor.executemany("""
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
        """, batch_values)
        conn.commit()
        stats['registered'] += len(batch_values)
    
    # Remove duplicates from missing list
    stats['missing_words'] = list(dict.fromkeys(stats['missing_words']))
    stats['missing_words'].sort()
    
    print(f"\nResults:")
    print(f"  Registered pages: {stats['registered']}")
    print(f"  Skipped (empty):  {stats['skipped_empty']}")
    
    if args.verify:
        print(f"  Dictionary lookups: {stats['lookups']}")
        print(f"  Found in dict:      {stats['found']} ({stats['found']/max(stats['lookups'],1)*100:.1f}%)")
        print(f"  Missing from dict:  {len(stats['missing_words'])}")
        if stats['missing_words'] and args.missing_report:
            print(f"\n  Missing words (all):")
            for w in stats['missing_words']:
                print(f"    {w}")
    
    cursor.close()
    conn.close()

if __name__ == '__main__':
    main()
