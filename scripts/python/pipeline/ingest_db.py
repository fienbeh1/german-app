#!/usr/bin/env python3
"""Ingest annotation data and verbs into PostgreSQL for the Deutsch Lern App."""

import json, csv, os, sys
import psycopg2

CONN = "dbname=deutsch user=f"
CSV_PATH = "/home/f/deutsch-app/app/public/verben.csv"

def get_conn():
    return psycopg2.connect(CONN)

def ingest_vocabulary():
    """Extract vokabular[] from raw_data annotation JSONs into vocabulario table."""
    conn = get_conn()
    cur = conn.cursor()
    
    # Get curso_id mapping by book_name
    cur.execute("SELECT id, name FROM cursos")
    curso_map = {row[1].strip(): row[0] for row in cur.fetchall()}
    
    # Get all annotation rows with their book_name
    cur.execute("""
        SELECT id, book_name, page_num, content_json, file_name 
        FROM raw_data 
        WHERE content_type = 'annotation' 
        AND content_json IS NOT NULL
        ORDER BY id
    """)
    
    rows = cur.fetchall()
    total_vocab = 0
    skipped = 0
    
    print(f"Processing {len(rows)} annotation rows...")
    
    for rid, book_name, page_num, content_json, file_name in rows:
        if not content_json:
            continue
        
        try:
            data = content_json if isinstance(content_json, dict) else json.loads(content_json)
        except:
            skipped += 1
            continue
        
        vokabular = data.get('vokabular', []) or data.get('vocabulary', [])
        struktur = data.get('struktur', {})
        lektion = struktur.get('lektion', '') if struktur else ''
        seite = struktur.get('seite', str(page_num or '')) if struktur else str(page_num or '')
        
        # Map book_name to curso_id
        curso_id = None
        for bname, cid in curso_map.items():
            if bname in book_name or (book_name and book_name in bname):
                curso_id = cid
                break
        
        for vocab in vokabular:
            if not vocab.get('wort'):
                continue
            
            palabra = vocab['wort']
            traduccion = vocab.get('übersetzung_es', '') or vocab.get('traduccion', '')
            wortart = vocab.get('wortart', '')
            artikel = vocab.get('artikel', '')
            plural = vocab.get('plural', '')
            kontext = vocab.get('kontext', '')
            english = vocab.get('english', '')
            french = vocab.get('french', '')
            audio_url = vocab.get('audio_url', '')
            
            # Check if exists
            cur.execute("SELECT id FROM vocabulario WHERE palabra = %s AND traduccion = %s AND COALESCE(lektion,'') = %s LIMIT 1",
                       (palabra, traduccion, lektion or ''))
            if cur.fetchone():
                continue
            
            cur.execute("""
                INSERT INTO vocabulario 
                    (palabra, traduccion, wortart, plural, kontext, english, french, 
                     audio_url, lektion, seite, source_file, curso_id, ejemplo)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                palabra, traduccion, wortart, plural, kontext,
                english, french, audio_url,
                lektion or '', seite or '', file_name or '',
                curso_id, kontext or ''
            ))
            total_vocab += 1
        
        if total_vocab % 500 == 0 and total_vocab > 0:
            conn.commit()
            print(f"  Ingested {total_vocab} vocabulary items so far...")
    
    conn.commit()
    cur.close()
    conn.close()
    print(f"Done! Ingested {total_vocab} vocabulary items, skipped {skipped} annotations.")

def ingest_verbs():
    """Ingest verben.csv into german_verbs table."""
    if not os.path.exists(CSV_PATH):
        print(f"CSV not found: {CSV_PATH}")
        return
    
    conn = get_conn()
    cur = conn.cursor()
    total = 0
    
    with open(CSV_PATH, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            infinitive = row.get('Infinitiv', '').strip()
            if not infinitive:
                continue
            
            # Check exists
            cur.execute("SELECT id FROM german_verbs WHERE infinitive = %s", (infinitive,))
            if cur.fetchone():
                continue
            
            cur.execute("""
                INSERT INTO german_verbs 
                    (infinitive, rank, freq, praeteritum, perfekt, auxiliary_verb,
                     praesens_ich, praesens_du, praesens_er,
                     konjunktiv_ii_ich, imperativ_singular, imperativ_plural,
                     english, spanish_translation, french)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                infinitive,
                int(row.get('Rank', 0)) if row.get('Rank', '').strip().isdigit() else None,
                int(row.get('Freq', 0)) if row.get('Freq', '').strip().isdigit() else None,
                row.get('Präteritum_ich', '').strip(),
                row.get('Partizip II', '').strip(),
                row.get('Hilfsverb', '').strip(),
                row.get('Präsens_ich', '').strip(),
                row.get('Präsens_du', '').strip(),
                row.get('Präsens_er, sie, es', '').strip(),
                row.get('Konjunktiv II_ich', '').strip(),
                row.get('Imperativ Singular', '').strip(),
                row.get('Imperativ Plural', '').strip(),
                row.get('English', '').strip(),
                row.get('Spanish', '').strip(),
                row.get('French', '').strip()
            ))
            total += 1
            
            if total % 500 == 0:
                conn.commit()
                print(f"  Ingested {total} verbs so far...")
    
    conn.commit()
    cur.close()
    conn.close()
    print(f"Done! Ingested {total} verbs.")

if __name__ == '__main__':
    print("=== Ingesting Vocabulary from Annotations ===")
    ingest_vocabulary()
    print()
    print("=== Ingesting Verbs from CSV ===")
    ingest_verbs()
    print()
    print("All done! Database is now populated.")
