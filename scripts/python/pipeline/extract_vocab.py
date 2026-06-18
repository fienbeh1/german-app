#!/usr/bin/env python3
"""Extract vocabulary from OCR text files using spaCy and insert into vocabulario."""
import os, sys, re, json, time
import psycopg2
from pathlib import Path
from collections import defaultdict

# Add venv path for spacy
sys.path.insert(0, '/home/f/deutsch-app/scripts/.venv/lib/python3.14/site-packages')
import spacy

DB = dict(host='/var/run/postgresql', user='f', database='deutsch')
ROOT = '/home/f/deutsch-app/de'

# Books that need vocabulary (have OCR but no vocab in DB)
BOOKS_NEEDING_VOCAB = [
    'delfin/Delfin_Lehrbuch',
    'Schritte plus neu A1.2',
    'Schritte plus neu A2.1',
    'Schritte plus neu A2.2',
    'Schritte plus neu B1.1',
    'Schritte plus neu B1.2',
    'Schritte Plus Neu A1.1',
    'Lagune_2/Lagune 2/Lagune-2-Kursbuch/Lagune_2_Kursbuch',
    'Lagune_2/Lagune 2/Lagune-2-Arbeitsbuch/Lagune_2_Arbeitsbuch',
    'Lagune_3/Lagune 3/Kursbuch +CD/Lagune-3-Kursbuch',
    'Neu-B1-Plus/B1-plus-Kursbuch',
    'Neu-B1-Plus/B1-plus-Arbeitsbuch',
]

# Map book paths to curso_id
BOOK_TO_CURSO = {
    'delfin': None,  # No curso for Delfin
    'Schritte plus neu A1.2': 13,
    'Schritte plus neu A2.1': 14,
    'Schritte plus neu A2.2': 15,
    'Schritte plus neu B1.1': 16,
    'Schritte plus neu B1.2': 17,
    'Schritte Plus Neu A1.1': 13,  # Same as A1.2
    'Lagune_2': 2,
    'Lagune_3': 3,
    'Neu-B1-Plus': 9,  # EM B2
}

# POS mapping
POS_MAP = {
    'NOUN': 'Substantiv',
    'VERB': 'Verb',
    'AUX': 'Verb',
    'ADJ': 'Adjektiv',
    'ADV': 'Adverb',
    'PROPN': 'Substantiv',
}

# Common German stop words to filter
STOP_WORDS = {
    'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einem', 'einen', 'einer',
    'und', 'oder', 'aber', 'dass', 'wenn', 'als', 'wie', 'was', 'wer', 'wo', 'wann',
    'ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr', 'Sie', 'mich', 'dich', 'sich',
    'mein', 'dein', 'sein', 'unser', 'euer', 'Ihr',
    'in', 'an', 'auf', 'aus', 'bei', 'mit', 'nach', 'seit', 'von', 'zu', 'zum', 'zur',
    'durch', 'für', 'gegen', 'ohne', 'um', 'bis', 'ab', 'außer',
    'ist', 'sind', 'war', 'waren', 'hat', 'haben', 'hatte', 'hatten',
    'wird', 'werden', 'wurde', 'wurden',
    'kann', 'können', 'konnte', 'konnten',
    'muss', 'müssen', 'musste', 'mussten',
    'soll', 'sollen', 'sollte', 'sollten',
    'will', 'wollen', 'wollte', 'wollten',
    'darf', 'dürfen', 'durfte', 'durften',
    'nicht', 'kein', 'keine', 'keinem', 'keinen', 'keiner',
    'auch', 'nur', 'noch', 'schon', 'sehr', 'mehr', 'viel', 'wenig',
    'hier', 'da', 'dort', 'jetzt', 'heute', 'dann', 'so', 'also',
    'man', 'mir', 'dir', 'ihm', 'ihr', 'uns', 'euch', 'ihnen',
    'am', 'im', 'vom', 'zum', 'zur', 'ans', 'ins', 'aufs',
    'Seite', 'Seite', 'Buch', 'Text', 'Übung', 'Aufgabe',
}

def load_nlp():
    print("Loading spaCy German model...")
    return spacy.load('de_core_news_sm')

def extract_vocab_from_text(text, nlp):
    """Extract German vocabulary from text using spaCy."""
    doc = nlp(text[:50000])  # Limit text length
    
    vocab = []
    seen = set()
    
    for token in doc:
        # Skip stop words, punctuation, short words
        if (token.is_stop or token.is_punct or token.is_space or 
            len(token.text) < 3 or token.text in STOP_WORDS):
            continue
        
        # Only keep nouns, verbs, adjectives, proper nouns
        if token.pos_ not in ('NOUN', 'VERB', 'AUX', 'ADJ', 'PROPN'):
            continue
        
        word = token.text
        if word in seen:
            continue
        seen.add(word)
        
        # Extract article for nouns
        artikel = ''
        plural = ''
        wortart = POS_MAP.get(token.pos_, '')
        
        # Look for article before noun
        if token.pos_ in ('NOUN', 'PROPN'):
            prev_token = token.nbor(-1) if token.i > 0 else None
            if prev_token and prev_token.text.lower() in ('der', 'die', 'das', 'ein', 'eine'):
                artikel = prev_token.text
        
        vocab.append({
            'wort': word,
            'artikel': artikel,
            'plural': plural,
            'wortart': wortart,
        })
    
    return vocab

def get_curso_id(book_name):
    """Get curso_id for a book name."""
    for key, cid in BOOK_TO_CURSO.items():
        if key in book_name:
            return cid
    return None

def find_txt_dirs(book_path):
    """Find all txt directories for a book."""
    dirs = []
    base = os.path.join(ROOT, book_path)
    
    # Check direct txt dir
    if os.path.exists(os.path.join(base, 'txt')):
        dirs.append(os.path.join(base, 'txt'))
    
    # Walk subdirectories
    if os.path.exists(base):
        for root, dnames, _ in os.walk(base):
            if 'txt' in dnames:
                dirs.append(os.path.join(root, 'txt'))
    
    return dirs

def process_book(book_path, curso_id, nlp, conn):
    """Process all OCR text files for a book."""
    txt_dirs = find_txt_dirs(book_path)
    if not txt_dirs:
        print(f"  No txt dirs for {book_path}")
        return 0
    
    cur = conn.cursor()
    total = 0
    
    print(f"  Found {len(txt_dirs)} txt directories")
    
    txt_files = []
    for txt_dir in txt_dirs:
        # Find OCR text files with various patterns
        for pattern in ['*_ocr_%%.txt', '*-*.txt', 'batch_*.raw.txt']:
            for f in Path(txt_dir).rglob(pattern):
                if f not in txt_files and 'merged' not in str(f):
                    txt_files.append(f)
    
    print(f"  Found {len(txt_files)} OCR files")
    
    for txt_file in txt_files[:100]:  # Limit to first 100 files for speed
        try:
            with open(txt_file, 'r', errors='replace') as f:
                text = f.read()
            
            if len(text.strip()) < 50:
                continue
            
            vocab = extract_vocab_from_text(text, nlp)
            
            for v in vocab:
                # Check if exists
                cur.execute(
                    "SELECT id FROM vocabulario WHERE palabra = %s AND wortart = %s LIMIT 1",
                    (v['wort'], v['wortart'])
                )
                if cur.fetchone():
                    continue
                
                cur.execute(
                    """INSERT INTO vocabulario 
                       (palabra, traduccion, wortart, artikel, plural, source_file, curso_id, lektion, seite)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                    (v['wort'], '', v['wortart'], v['artikel'], v['plural'],
                     txt_file.name, curso_id, '', '')
                )
                total += 1
            
            if total % 100 == 0 and total > 0:
                conn.commit()
                print(f"    Inserted {total} words so far...")
        
        except Exception as e:
            print(f"    Error processing {txt_file.name}: {e}")
            continue
    
    conn.commit()
    return total

def main():
    print("=== Vocabulary Extractor ===")
    nlp = load_nlp()
    
    conn = psycopg2.connect(**DB)
    print("Connected to DB")
    
    for book_path in BOOKS_NEEDING_VOCAB:
        curso_id = get_curso_id(book_path)
        print(f"\nProcessing: {book_path} (curso_id={curso_id})")
        
        count = process_book(book_path, curso_id, nlp, conn)
        print(f"  Inserted {count} vocabulary items")
    
    conn.close()
    print("\nDone!")

if __name__ == '__main__':
    main()
