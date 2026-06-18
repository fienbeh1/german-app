#!/usr/bin/env python3
"""
Import Goethe A1/A2/B1 Wortschatz from layout txt → PostgreSQL.
Parses two-column PDF-extracted layout files with word entries and plural patterns.
"""
import re, sys, csv, os
import psycopg2
from collections import defaultdict

PG_DSN = "host=/var/run/postgresql dbname=deutsch user=f"

UMLAUT_MAP = {
    'ä': ('a', 'au'), 'Ä': ('A', 'Au'),
    'ö': ('o',), 'Ö': ('O',),
    'ü': ('u',), 'Ü': ('U',),
}

def apply_umlaut(word: str, umlaut_char: str) -> str:
    if not umlaut_char:
        return word
    mapping = UMLAUT_MAP.get(umlaut_char)
    if not mapping:
        return word
    word_lower = word.lower()
    for src in mapping:
        src_lower = src.lower()
        if src_lower == 'au' and 'au' in word_lower:
            idx = word_lower.rfind('au')
            return word[:idx] + ('äu' if word[idx].islower() else 'Äu') + word[idx+2:]
        if src_lower == 'au' and 'Au' in word:
            return word.replace('Au', 'Äu', 1)
        if src_lower in word_lower:
            idx = word_lower.rfind(src_lower)
            target = umlaut_char.upper() if word[idx].isupper() else umlaut_char
            return word[:idx] + target + word[idx+1:]
    return word

def build_plural(word: str, article: str, umlaut: str, suffix: str) -> str:
    if suffix == '-':
        return word
    result = apply_umlaut(word, umlaut)
    if suffix and suffix not in ('-', ''):
        if suffix.startswith('e') and word.endswith('e') and len(word) > 1:
            result = result[:-1] + suffix
        elif suffix == 'n' and word.endswith('e') and len(word) > 1:
            result = result + suffix
        elif suffix == 'en' and word.endswith('e') and len(word) > 1:
            result = result[:-1] + suffix
        else:
            result += suffix
    return result

def parse_noun_plural(text: str) -> dict:
    """Parse plural notation: 'Apfel, -Ä, e', 'Adresse,-en', 'Baby, -s', 'Mutter, -ü',
       'Ehemann, ä, er', 'Brötchen, –', etc."""
    result = {'word': '', 'umlaut': '', 'suffix': ''}
    text = text.strip()
    
    # Strip trailing punctuation that might be part of example
    text = re.sub(r'\s+[A-Z].*$', '', text).strip()
    
    if text.startswith('(pl.)'):
        result['plural_only'] = True
        rest = text[5:].strip()
        result['word'] = rest.split(' ')[0] if rest else ''
        return result
    
    text = re.sub(r'\(Sg\.?\)', '', text).strip()
    
    parts = [p.strip() for p in text.split(',')]
    if not parts:
        return result
    
    result['word'] = parts[0].strip()
    
    if len(parts) >= 2:
        p2 = parts[1]
        # Strip leading dash, em-dash, spaces
        p2_clean = p2.lstrip('-– ').strip()
        p2_is_umlaut = p2_clean in ('ä','ö','ü','Ä','Ö','Ü')
        
        if p2_clean == '...':
            pass
        elif p2_clean in ('', '-'):
            result['suffix'] = '-'
        elif p2_is_umlaut:
            result['umlaut'] = p2_clean
            if len(parts) >= 3:
                p3 = parts[2].strip()
                if p3:
                    p3 = p3.lstrip('-– ').strip()
                    if p3 and p3 not in ('...', ''):
                        result['suffix'] = p3
        elif p2_clean in ('–', '—'):
            result['suffix'] = '-'
        else:
            # Could be "e", "en", "er", "s", "n", "se", etc.
            result['suffix'] = p2_clean
            # Check if remaining parts have umlaut
            if len(parts) >= 3:
                p3 = parts[2].strip().lstrip('-– ').strip()
                if p3 in ('ä','ö','ü','Ä','Ö','Ü'):
                    result['umlaut'] = p3
                    result['suffix'] = p2_clean
    
    return result

def detect_word_type(col1: str, article: str, example: str) -> str:
    if article in ('der', 'die', 'das', 'dem', 'den'):
        return 'Substantiv'
    word = col1.strip()
    if not word:
        return 'Sonstiges'
    if word[0].isupper():
        return 'Substantiv'
    if word.endswith(('en', 'n', 'eln', 'ern')) and word[0].islower():
        return 'Verb'
    if word.endswith(('heit', 'keit', 'ung', 'tät', 'schaft', 'ion', 'sion')):
        return 'Substantiv'
    if word.endswith(('lich', 'ig', 'isch', 'bar', 'sam', 'haft', 'los')):
        return 'Adjektiv'
    if word[0].islower():
        return 'Verb' if any(word.endswith(e) for e in ['en','n','ln','rn']) else 'Sonstiges'
    return 'Sonstiges'

def parse_layout_file(filepath: str, level: str) -> list[dict]:
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    entries = []
    word_list_mode = False
    
    for line in lines:
        raw = line.rstrip('\n')
        if not raw.strip():
            continue
        
        if 'Alphabetische' in raw or 'Alphabetischer' in raw:
            word_list_mode = True
            continue
        
        if not word_list_mode:
            continue
        
        stripped = raw.strip()
        if not stripped:
            continue
        
        if re.match(r'^Seite\s+\d+', stripped) or 'VS_' in stripped or '^L' in stripped:
            continue
        if stripped == 'WORTLISTE':
            continue
        if 'Inventare' in stripped:
            continue
        
        parts = re.split(r'\s{3,}', raw)
        cleaned = [p.strip() for p in parts if p.strip()]
        if not cleaned:
            continue
        
        col1 = cleaned[0]
        col2 = ' '.join(cleaned[1:]) if len(cleaned) > 1 else ''
        
        if not col1:
            continue
        
        if col2 and not col1[0].isalnum() and col1[0] not in 'äöüÄÖÜ':
            if entries and col2:
                entries[-1]['example'] += ' ' + col2
            continue
        
        is_continuation = (len(col1) < 3 or col1[0].islower() and len(col2) > 50 and not any(
            col1.startswith(a) for a in ['der','die','das','dem','den','ab','an','auf','aus','bei','bis','durch','ein','für','gegen','hinter','in','mit','nach','neben','ohne','über','um','unter','von','vor','weg','zu','zwischen']))
        
        if is_continuation and entries:
            entries[-1]['example'] += ' ' + (col1 + ' ' + col2 if col2 else col1)
            continue
        
        article = ''
        word = col1
        nouns_with_article = False
        
        art_match = re.match(r'^(der|die|das|dem|den)\s+(.+)', col1)
        if art_match:
            article = art_match.group(1)
            word = art_match.group(2).strip()
            nouns_with_article = True
        
        if nouns_with_article:
            # Separate example text from word+plural info when no column gap
            word_part = word
            example = col2
            
            # If col2 is empty, word may contain the example
            if not example:
                # Find where plural suffix ends and example begins
                # Patterns: "word, -uml, suffix Example" or "word, -suffix Example" or "word, uml, suffix Example"
                m = re.match(r'^(.+?,\s*-?[^,]+(?:,\s*[^,]+)?)\s+(.+)$', word_part)
                if m:
                    word_part = m.group(1).strip()
                    example = m.group(2).strip()
            
            plural_info = parse_noun_plural(word_part)
            plural_form = build_plural(
                plural_info['word'], article,
                plural_info.get('umlaut', ''),
                plural_info.get('suffix', '')
            )
            entry = {
                'level': level,
                'article': article,
                'word': plural_info['word'],
                'umlaut': plural_info.get('umlaut', ''),
                'suffix': plural_info.get('suffix', ''),
                'plural_form': plural_form,
                'type': 'Substantiv',
                'example': example,
                'is_plural_only': plural_info.get('plural_only', False),
            }
        else:
            entry = {
                'level': level,
                'article': '',
                'word': col1,
                'umlaut': '',
                'suffix': '',
                'plural_form': '',
                'type': detect_word_type(col1, '', col2),
                'example': col2,
                'is_plural_only': False,
            }
        
        entries.append(entry)
    
    return entries


def main():
    goethe_dir = '/home/f/deutsch-app/de/goethe'
    levels = {}
    for lvl in ['A1', 'A2', 'B1']:
        fp = os.path.join(goethe_dir, f'{lvl}_layout.txt')
        if os.path.exists(fp):
            levels[lvl] = fp
    
    all_entries = []
    for level, filepath in levels.items():
        print(f"Parsing {level} from {os.path.basename(filepath)}...")
        entries = parse_layout_file(filepath, level)
        print(f"  Found {len(entries)} entries")
        all_entries.extend(entries)
    
    print(f"\nTotal entries parsed: {len(all_entries)}")
    
    by_level = defaultdict(int)
    by_type = defaultdict(int)
    for e in all_entries:
        by_level[e['level']] += 1
        by_type[e['type']] += 1
    
    print("By level:", dict(by_level))
    print("By type:", dict(by_type))
    
    nouns_with_plural = [e for e in all_entries if e['type'] == 'Substantiv' and (e['umlaut'] or e['suffix'])]
    print(f"\nNouns with plural info: {len(nouns_with_plural)}")
    print("Samples:")
    for e in nouns_with_plural[:25]:
        u = e['umlaut'] or '-'
        s = e['suffix'] or '-'
        print(f"  {e['article']} {e['word']} → {e['plural_form']}  (umlaut={u}, suffix={s})")
    
    csv_path = os.path.join(goethe_dir, 'wortschatz_all.csv')
    with open(csv_path, 'w', encoding='utf-8', newline='') as f:
        fieldnames = ['level', 'article', 'word', 'umlaut', 'suffix', 'plural_form', 'type', 'example', 'is_plural_only']
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(all_entries)
    print(f"\nSaved CSV: {csv_path} ({len(all_entries)} rows)")
    
    print("\nConnecting to PostgreSQL...")
    try:
        conn = psycopg2.connect(PG_DSN)
        cur = conn.cursor()
        
        cur.execute("""
            CREATE TABLE IF NOT EXISTS goethe_wortschatz (
                id SERIAL PRIMARY KEY,
                level TEXT NOT NULL,
                artikel TEXT DEFAULT '',
                wort TEXT NOT NULL,
                umlaut TEXT DEFAULT '',
                plural_suffix TEXT DEFAULT '',
                plural_form TEXT DEFAULT '',
                wortart TEXT DEFAULT '',
                beispiel TEXT DEFAULT '',
                is_plural_only BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT NOW()
            )
        """)
        
        cur.execute("DELETE FROM goethe_wortschatz")
        
        inserted = 0
        for e in all_entries:
            cur.execute("""
                INSERT INTO goethe_wortschatz 
                    (level, artikel, wort, umlaut, plural_suffix, plural_form, wortart, beispiel, is_plural_only)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                e['level'], e['article'], e['word'],
                e['umlaut'], e['suffix'], e['plural_form'],
                e['type'], e['example'], e['is_plural_only']
            ))
            inserted += 1
        
        conn.commit()
        cur.close()
        conn.close()
        print(f"Inserted {inserted} rows into goethe_wortschatz")
    except Exception as e:
        print(f"DB Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    main()
