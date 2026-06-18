#!/usr/bin/env python3
"""
Ingest Lagune 2 Hörverstehenstexte and Wortschatz PDFs into dokument_segmente and vocabulario.
Pipeline: PDF → Images (pdftoppm) → OCR (tesseract) → Parse → Insert into DB
"""

import os
import sys
import subprocess
import re
import json
from pathlib import Path
from datetime import datetime

# Database connection
try:
    import psycopg2
    DB_DSN = "host='/var/run/postgresql' user='f' dbname='deutsch'"
except ImportError:
    print("ERROR: psycopg2 not installed. Run: pip install psycopg2-binary")
    sys.exit(1)

# Configuration
BASE_DIR = Path('/home/f/deutsch-app/de/Lagune_2')
WORK_DIR = Path('/tmp/lagune2_ingest')
BOOK_NAME = 'Lagune_2/Lagune 2/Lagune-2-Kursbuch/Lagune_2_Kursbuch'

# PDF files to process
TRANSCRIPTION_PDFS = [
    ('776272836-Lagune-2-horverstehenstexte-CD1.pdf', 'CD1'),
    ('776272811-Lagune-2-horverstehenstexte-cd2.pdf', 'CD2'),
    ('776272800-Lagune-2-Horverstehenstexte-CD3.pdf', 'CD3'),
]

VOCABULARY_PDF = 'Lagune2_Wortschatz.pdf'


def run_command(cmd, check=True):
    """Run shell command and return output."""
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if check and result.returncode != 0:
        print(f"Command failed: {cmd}")
        print(f"stderr: {result.stderr}")
        return None
    return result.stdout


def pdf_to_images(pdf_path, output_prefix, dpi=300):
    """Convert PDF pages to JPEG images using pdftoppm."""
    output_dir = WORK_DIR / output_prefix
    output_dir.mkdir(parents=True, exist_ok=True)
    
    cmd = f'pdftoppm -jpeg -r {dpi} "{pdf_path}" "{output_dir}/page"'
    print(f"Converting {pdf_path.name} to images...")
    run_command(cmd)
    
    images = sorted(output_dir.glob('page-*.jpg'))
    print(f"  Generated {len(images)} images")
    return images


def ocr_image(image_path, lang='deu'):
    """OCR a single image using tesseract."""
    cmd = f'tesseract "{image_path}" stdout -l {lang} --psm 6 2>/dev/null'
    text = run_command(cmd, check=False)
    
    if not text or text.strip() in ['', 'Empty page!!']:
        return None
    
    # Clean up OCR artifacts
    text = text.strip()
    if len(text) < 10:  # Too short, probably noise
        return None
    
    return text


def parse_transcription_page(text, cd_label):
    """Parse a transcription page to extract track number and content."""
    lines = text.split('\n')
    
    # Look for track patterns like "Track 1", "1", "Hörtext 1", etc.
    track_num = None
    content_lines = []
    
    for i, line in enumerate(lines):
        line_stripped = line.strip()
        
        # Try to extract track number
        if not track_num:
            # Pattern: "Track 1", "1.", "1)", "Hörtext 1"
            match = re.search(r'(?:Track|Hörtext|Übung)?\s*(\d+)[\.\):]?', line_stripped)
            if match and int(match.group(1)) < 100:  # Reasonable track number
                track_num = int(match.group(1))
                # If the line is just the track number, skip it
                if len(line_stripped) < 10:
                    continue
        
        # Collect content
        if line_stripped:
            content_lines.append(line_stripped)
    
    if not content_lines:
        return None
    
    content = '\n'.join(content_lines)
    
    return {
        'track': track_num,
        'cd': cd_label,
        'content': content,
    }


def parse_vocabulary_page(text):
    """Parse a vocabulary page to extract word entries."""
    lines = text.split('\n')
    entries = []
    
    # Look for patterns like:
    # "der Apfel, Äpfel - apple"
    # "Apfel (der) - apple"
    # "laufen (läuft, lief, ist gelaufen) - to run"
    
    for line in lines:
        line = line.strip()
        if not line or len(line) < 5:
            continue
        
        # Skip headers and section titles
        if line.upper() == line or line.startswith('Lektion') or line.startswith('Kapitel'):
            continue
        
        # Try to parse German-English pairs
        # Pattern: German word - English translation
        if ' - ' in line or ' – ' in line:
            parts = re.split(r'\s+[-–]\s+', line, maxsplit=1)
            if len(parts) == 2:
                german = parts[0].strip()
                english = parts[1].strip()
                
                # Extract article if present
                artikel = ''
                if german.startswith('der '):
                    artikel = 'der'
                    german = german[4:]
                elif german.startswith('die '):
                    artikel = 'die'
                    german = german[4:]
                elif german.startswith('das '):
                    artikel = 'das'
                    german = german[4:]
                
                # Extract plural if in parentheses
                plural = ''
                plural_match = re.search(r',\s*([A-Za-zäöüÄÖÜß]+)\)', german)
                if plural_match:
                    plural = plural_match.group(1)
                    german = re.sub(r',\s*[A-Za-zäöüÄÖÜß]+\)', '', german)
                
                entries.append({
                    'palabra': german.strip(),
                    'artikel': artikel,
                    'plural': plural,
                    'traduccion': '',  # Spanish not in this PDF
                    'english': english,
                    'wortart': 'Substantiv' if artikel else 'Verb' if german.endswith('en') else '',
                })
    
    return entries


def ingest_transcriptions(conn):
    """Process and ingest all transcription PDFs."""
    cur = conn.cursor()
    total_inserted = 0
    
    for pdf_file, cd_label in TRANSCRIPTION_PDFS:
        pdf_path = BASE_DIR / pdf_file
        if not pdf_path.exists():
            print(f"WARNING: {pdf_path} not found, skipping")
            continue
        
        print(f"\n{'='*60}")
        print(f"Processing {pdf_file} ({cd_label})")
        print(f"{'='*60}")
        
        # Convert to images
        images = pdf_to_images(pdf_path, f'transcription_{cd_label}')
        
        # OCR and parse each page
        page_num = 0
        for img_path in images:
            page_num += 1
            text = ocr_image(img_path)
            
            if not text:
                continue
            
            parsed = parse_transcription_page(text, cd_label)
            if not parsed:
                continue
            
            # Insert into dokument_segmente
            try:
                cur.execute("""
                    INSERT INTO dokument_segmente 
                    (book_name, source_book, typ, ziel, lektion, seite_von, seite_bis, 
                     inhalt, source_pdf, source_page)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT DO NOTHING
                """, (
                    BOOK_NAME,
                    f'Lagune 2 {cd_label}',
                    'Transkription',
                    f'{cd_label} Track {parsed["track"]}' if parsed["track"] else cd_label,
                    None,  # lektion
                    page_num,
                    page_num,
                    parsed["content"],
                    pdf_file,
                    page_num,
                ))
                
                if cur.rowcount > 0:
                    total_inserted += 1
                    if total_inserted % 10 == 0:
                        print(f"  Inserted {total_inserted} transcriptions...")
            
            except Exception as e:
                print(f"  Error inserting page {page_num}: {e}")
                conn.rollback()
                continue
        
        conn.commit()
        print(f"  Completed {cd_label}: {total_inserted} total insertions")
    
    cur.close()
    return total_inserted


def ingest_vocabulary(conn):
    """Process and ingest vocabulary PDF."""
    pdf_path = BASE_DIR / VOCABULARY_PDF
    if not pdf_path.exists():
        print(f"WARNING: {pdf_path} not found, skipping vocabulary")
        return 0
    
    print(f"\n{'='*60}")
    print(f"Processing {VOCABULARY_PDF}")
    print(f"{'='*60}")
    
    # Convert to images
    images = pdf_to_images(pdf_path, 'vocabulary')
    
    # OCR all pages
    all_text = []
    for img_path in images:
        text = ocr_image(img_path)
        if text:
            all_text.append(text)
    
    if not all_text:
        print("  No text extracted from vocabulary PDF")
        return 0
    
    # Parse vocabulary
    full_text = '\n'.join(all_text)
    entries = parse_vocabulary_page(full_text)
    
    print(f"  Extracted {len(entries)} vocabulary entries")
    
    if not entries:
        return 0
    
    # Insert into vocabulario
    cur = conn.cursor()
    inserted = 0
    
    # Get curso_id for Lagune 2
    cur.execute("SELECT id FROM cursos WHERE nombre = 'Lagune 2'")
    row = cur.fetchone()
    if not row:
        print("  ERROR: curso_id for 'Lagune 2' not found")
        cur.close()
        return 0
    
    curso_id = row[0]
    
    for entry in entries:
        try:
            # Check if already exists
            cur.execute("""
                SELECT id FROM vocabulario 
                WHERE palabra = %s AND curso_id = %s
            """, (entry['palabra'], curso_id))
            
            if cur.fetchone():
                continue
            
            cur.execute("""
                INSERT INTO vocabulario 
                (palabra, artikel, plural, traduccion, wortart, english, curso_id, source_file)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                entry['palabra'],
                entry['artikel'],
                entry['plural'],
                entry['traduccion'],
                entry['wortart'],
                entry['english'],
                curso_id,
                VOCABULARY_PDF,
            ))
            
            if cur.rowcount > 0:
                inserted += 1
                if inserted % 50 == 0:
                    print(f"  Inserted {inserted} vocabulary entries...")
        
        except Exception as e:
            print(f"  Error inserting {entry['palabra']}: {e}")
            conn.rollback()
            continue
    
    conn.commit()
    cur.close()
    print(f"  Completed vocabulary: {inserted} entries inserted")
    return inserted


def main():
    """Main ingestion pipeline."""
    print("="*60)
    print("Lagune 2 Ingestion Pipeline")
    print("="*60)
    
    # Create work directory
    WORK_DIR.mkdir(parents=True, exist_ok=True)
    
    # Connect to database
    try:
        conn = psycopg2.connect(DB_DSN)
        print("Connected to database")
    except Exception as e:
        print(f"ERROR: Cannot connect to database: {e}")
        sys.exit(1)
    
    # Ingest transcriptions
    trans_count = ingest_transcriptions(conn)
    
    # Ingest vocabulary
    vocab_count = ingest_vocabulary(conn)
    
    # Summary
    print(f"\n{'='*60}")
    print("SUMMARY")
    print(f"{'='*60}")
    print(f"Transcriptions inserted: {trans_count}")
    print(f"Vocabulary entries inserted: {vocab_count}")
    print(f"{'='*60}")
    
    conn.close()
    print("Done!")


if __name__ == '__main__':
    main()
