#!/usr/bin/env python3
"""
Import German-English dictionary (de-en.txt) into PostgreSQL.
Format:
  German {pos}; ... | Translation [domain] :: English translation [domain]
"""
import re, sys, os, time
import psycopg2

PG_DSN = "host=/var/run/postgresql dbname=deutsch user=f"
DICT_FILE = "/home/f/deutsch-app/de/goethe/de-en.txt.2026-04-01"

def parse_entry(line: str) -> dict | None:
    """Parse a single dictionary line."""
    if line.startswith('#') or not line.strip():
        return None
    
    line = line.strip()
    if not line:
        return None
    
    # Split by :: separator (German :: English)
    parts = line.split('::', 1)
    if len(parts) < 2:
        return None
    
    german_side = parts[0].strip()
    english_side = parts[1].strip() if len(parts) > 1 else ''
    
    # Extract domains from brackets
    domains = re.findall(r'\[([^\]]+)\]', german_side + ' ' + english_side)
    
    # Extract gender/article
    article = ''
    art_match = re.match(r'(der|die|das)\s+', german_side)
    if art_match:
        article = art_match.group(1)
    
    # Extract base word (first German word before {pos})
    german_word = re.sub(r'\{[^}]+\}', '', german_side).strip()
    german_word = re.split(r'\s*[|;]\s*', german_word)[0].strip()
    german_word = re.split(r'\s*[,]\s*(?:der|die|das)\s+', german_word)[0].strip()
    
    # Clean English: remove [domain] tags
    english_clean = re.sub(r'\s*\[[^\]]+\]\s*', ' ', english_side).strip()
    english_clean = re.sub(r'\s+', ' ', english_clean)
    
    # Detect word type
    word_type = ''
    pos_matches = re.findall(r'\{([^}]+)\}', german_side)
    if pos_matches:
        pos_clean = ';'.join(p.strip() for p in pos_matches)
        if 'm}' in german_side or '{f}' in german_side or '{n}' in german_side or '{pl}' in german_side:
            word_type = 'Substantiv'
        elif '{adj}' in pos_clean:
            word_type = 'Adjektiv'
        elif '{vb}' in pos_clean or '{v}' in pos_clean:
            word_type = 'Verb'
        else:
            word_type = pos_clean
    else:
        if german_word[0:1].isupper() and article:
            word_type = 'Substantiv'
        elif german_word.endswith(('en', 'n', 'eln', 'ern', 'ieren')):
            word_type = 'Verb'
        elif german_word.endswith(('lich', 'ig', 'isch', 'bar', 'sam', 'haft', 'los', 'iv')):
            word_type = 'Adjektiv'
        elif german_word[0:1].isupper():
            word_type = 'Substantiv'
    
    return {
        'german_raw': german_side[:500],
        'german_word': german_word[:200],
        'article': article,
        'english': english_clean[:500],
        'domains': ';'.join(domains[:5]),
        'word_type': word_type[:50],
    }


def main():
    print(f"=== Dictionary Import ===")
    print(f"File: {DICT_FILE}")
    
    if not os.path.exists(DICT_FILE):
        print(f"ERROR: File not found: {DICT_FILE}")
        sys.exit(1)
    
    file_size = os.path.getsize(DICT_FILE)
    print(f"Size: {file_size:,} bytes")
    
    conn = psycopg2.connect(PG_DSN)
    cur = conn.cursor()
    
    # Create table
    cur.execute("""
        CREATE TABLE IF NOT EXISTS dictionary (
            id SERIAL PRIMARY KEY,
            german_raw TEXT,
            german_word TEXT,
            artikel TEXT DEFAULT '',
            english TEXT,
            domains TEXT DEFAULT '',
            word_type TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT NOW()
        )
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_dict_word ON dictionary(german_word)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_dict_type ON dictionary(word_type)")
    
    # Count existing
    cur.execute("SELECT COUNT(*) FROM dictionary")
    existing = cur.fetchone()[0]
    if existing > 0:
        print(f"Table already has {existing} entries. Would you like to re-import?")
        cur.execute("TRUNCATE dictionary")
        print("  Truncated.")
    
    # Parse and insert
    total = 0
    errors = 0
    batch = []
    BATCH_SIZE = 1000
    
    print("Parsing and importing...")
    start_time = time.time()
    
    with open(DICT_FILE, 'r', encoding='utf-8', errors='replace') as f:
        for line in f:
            entry = parse_entry(line)
            if entry:
                batch.append(entry)
                total += 1
                
                if len(batch) >= BATCH_SIZE:
                    _insert_batch(cur, batch)
                    batch = []
                    elapsed = time.time() - start_time
                    rate = total / elapsed if elapsed > 0 else 0
                    print(f"  {total:,} entries imported ({rate:.0f}/sec)", end='\r')
    
    if batch:
        _insert_batch(cur, batch)
    
    elapsed = time.time() - start_time
    rate = total / elapsed if elapsed > 0 else 0
    
    conn.commit()
    cur.close()
    conn.close()
    
    print(f"\n\nDone! {total:,} entries imported in {elapsed:.1f}s ({rate:.0f}/sec)")
    print(f"Errors: {errors}")


def _insert_batch(cur, batch):
    for entry in batch:
        try:
            cur.execute("""
                INSERT INTO dictionary (german_raw, german_word, artikel, english, domains, word_type)
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (
                entry['german_raw'], entry['german_word'], entry['article'],
                entry['english'], entry['domains'], entry['word_type']
            ))
        except Exception as e:
            pass
    batch.clear()


if __name__ == '__main__':
    main()
