#!/home/f/miniforge3/bin/python
"""
German Content Architect - Fast OCR Pipeline
Simplified version that processes PDFs one by one with progress tracking
"""

import os
import json
import sqlite3
import subprocess
from pathlib import Path
import tempfile
import re
import time
from datetime import datetime

# Configuration
BASE_DIR = "/home/f/deutsch-material/Deutsch als Fremdsprache"
OUTPUT_DIR = "/home/f/deutsch-app/ocr"
IMAGE_DIR = "/home/f/deutsch-app/images"
DB_PATH = "/home/f/deutsch-app/deutsch.db"
PROGRESS_FILE = "/home/f/deutsch-app/pipeline_progress.txt"

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS pages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        course TEXT,
        level TEXT,
        type TEXT,
        page_num INTEGER,
        pdf_path TEXT,
        txt_path TEXT,
        img_path TEXT,
        audio_refs TEXT,
        raw_text TEXT
    )
    ''')
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS audio_links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        page_id INTEGER,
        audio_path TEXT,
        track_num INTEGER,
        FOREIGN KEY (page_id) REFERENCES pages(id)
    )
    ''')
    conn.commit()
    return conn, cursor

def parse_filename(pdf_path):
    path = Path(pdf_path)
    rel_path = path.relative_to(BASE_DIR)
    
    course = "Unknown"
    level = "Unknown"
    type_ = "Unknown"
    
    path_str = str(rel_path)
    
    if "Lagune 1" in path_str:
        course = "Lagune"
        level = "A1"
    elif "Lagune 2" in path_str:
        course = "Lagune"
        level = "A2"
    elif "Lagune 3" in path_str:
        course = "Lagune"
        level = "B1"
    elif "Tangram" in path_str:
        course = "Tangram"
    elif "B2" in path_str:
        course = "B2"
    elif "Deutsch V" in path_str:
        course = "Deutsch V"
    
    if "Kursbuch" in path_str:
        type_ = "KB"
    elif "Arbeitsbuch" in path_str or "Arbeitsbuch" in path_str:
        type_ = "AB"
    elif "Lehrerhandbuch" in path_str:
        type_ = "LH"
    
    return course, level, type_

def process_pdf(pdf_path, cursor, conn):
    course, level, type_ = parse_filename(pdf_path)
    base_name = Path(pdf_path).stem
    
    course_dir = Path(OUTPUT_DIR) / course / level / type_
    img_course_dir = Path(IMAGE_DIR) / course / level / type_
    course_dir.mkdir(parents=True, exist_ok=True)
    img_course_dir.mkdir(parents=True, exist_ok=True)
    
    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            # Convert PDF to images
            subprocess.run([
                'pdftoppm', '-r', '300', '-png',
                pdf_path, f"{tmpdir}/page"
            ], check=True, capture_output=True)
            
            import shutil
            
            page_files = sorted(Path(tmpdir).glob('page-*.png'))
            
            for idx, img_file in enumerate(page_files, 1):
                std_name = f"{course}_{level}_{type_}_{idx:03d}"
                txt_path = str(course_dir / f"{std_name}.txt")
                img_path = str(img_course_dir / f"{std_name}.png")
                
                shutil.copy2(img_file, img_path)
                
                # OCR with Tesseract
                result = subprocess.run([
                    'tesseract', img_path, 'stdout',
                    '-l', 'deu', '--psm', '3'
                ], capture_output=True, text=True)
                
                page_text = result.stdout
                
                with open(txt_path, 'w', encoding='utf-8') as f:
                    f.write(f"=== {course} {level} {type_} Seite {idx} ===\n\n")
                    f.write(page_text)
                
                # Extract audio references
                audio_refs = []
                patterns = [r'Audio\s*CD', r'CD\s*\d+', r'Track\s*\d+', r'Hörverstehen']
                for pattern in patterns:
                    if re.search(pattern, page_text, re.IGNORECASE):
                        audio_refs.append(pattern)
                
                cursor.execute('''
                INSERT INTO pages (course, level, type, page_num, pdf_path, txt_path, img_path, audio_refs, raw_text)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (course, level, type_, idx, str(pdf_path), txt_path, img_path, 
                      json.dumps(audio_refs), page_text))
            
            conn.commit()
            return len(page_files)
    
    except Exception as e:
        print(f"Error: {e}")
        return 0

def main():
    print(f"[{datetime.now()}] Starting German Content Architect Pipeline...")
    
    conn, cursor = init_db()
    
    # Get list of PDFs
    pdfs = []
    for root, dirs, files in os.walk(BASE_DIR):
        for f in files:
            if f.endswith('.pdf'):
                full_path = os.path.join(root, f)
                try:
                    size = os.path.getsize(full_path)
                    if size < 5 * 1024 * 1024:  # <5MB
                        pdfs.append(full_path)
                except:
                    pass
    
    total = len(pdfs)
    print(f"Found {total} split PDFs to process")
    
    # Check progress
    processed = set()
    if os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE, 'r') as f:
            processed = set(line.strip() for line in f)
    
    count = 0
    for i, pdf_path in enumerate(pdfs, 1):
        if str(pdf_path) in processed:
            continue
        
        print(f"[{i}/{total}] Processing: {Path(pdf_path).name}...")
        pages = process_pdf(pdf_path, cursor, conn)
        count += pages
        
        with open(PROGRESS_FILE, 'a') as f:
            f.write(str(pdf_path) + '\n')
        
        if i % 10 == 0:
            print(f"  -> Total pages processed: {count}")
    
    print(f"\nPipeline complete! Total pages: {count}")
    conn.close()

if __name__ == "__main__":
    main()
