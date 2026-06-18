#!/home/f/miniforge3/bin/python
"""
German Content Architect - Parallel OCR Pipeline
Processes split PDFs using multiple CPU cores
"""

import os
import json
import sqlite3
import subprocess
from pathlib import Path
import tempfile
import re
from concurrent.futures import ProcessPoolExecutor, as_completed
from functools import partial

# Configuration
BASE_DIR = "/home/f/deutsch-material/Deutsch als Fremdsprache"
OUTPUT_DIR = "/home/f/deutsch-app/ocr"
IMAGE_DIR = "/home/f/deutsch-app/images"
DB_PATH = "/home/f/deutsch-app/deutsch.db"
MAX_WORKERS = 4  # Adjust based on CPU cores

def init_db():
    """Initialize SQLite database"""
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
    """Parse PDF path to extract course metadata"""
    path = Path(pdf_path)
    rel_path = path.relative_to(BASE_DIR)
    
    course = "Unknown"
    level = "Unknown"
    type_ = "Unknown"
    
    for part in rel_path.parts:
        if "Lagune" in part:
            course = "Lagune"
            match = re.search(r'Lagune\s+(\d+)', part)
            if match:
                n = int(match.group(1))
                level = f"A{n}" if n <= 2 else f"B{n-2}"
        elif "Tangram" in part:
            course = "Tangram"
        elif "B2" in part:
            course = "B2"
        elif "Deutsch V" in part:
            course = "Deutsch V"
        
        if "Kursbuch" in part:
            type_ = "KB"
        elif "Arbeitsbuch" in part or "Arbeitsbuch" in str(rel_path):
            type_ = "AB"
        elif "Lehrerhandbuch" in part or "Lehrerhandbuch" in str(rel_path):
            type_ = "LH"
    
    return course, level, type_

def extract_audio_refs(text):
    """Extract audio track references from OCR text"""
    patterns = [
        r'Audio\s*CD\s*(\d+)',
        r'CD\s*(\d+)',
        r'Track\s*(\d+)',
        r'(\d+)\s*Track',
        r'Hörverstehen',
        r'Übung\s*(\d+)'
    ]
    
    refs = []
    for pattern in patterns:
        matches = re.finditer(pattern, text, re.IGNORECASE)
        for m in matches:
            refs.append(m.group())
    
    return json.dumps(refs)

def process_pdf(pdf_path):
    """Process a single PDF: split into images and OCR"""
    course, level, type_ = parse_filename(pdf_path)
    base_name = Path(pdf_path).stem
    
    # Create output directories
    course_dir = Path(OUTPUT_DIR) / course / level / type_
    img_course_dir = Path(IMAGE_DIR) / course / level / type_
    course_dir.mkdir(parents=True, exist_ok=True)
    img_course_dir.mkdir(parents=True, exist_ok=True)
    
    results = []
    
    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            # Convert PDF pages to images at 300 DPI
            subprocess.run([
                'pdftoppm', '-r', '300', '-png',
                pdf_path, f"{tmpdir}/page"
            ], check=True, capture_output=True)
            
            # Process each page image
            page_files = sorted(Path(tmpdir).glob('page-*.png'))
            
            import shutil
            
            for idx, img_file in enumerate(page_files, 1):
                std_name = f"{course}_{level}_{type_}_{idx:03d}"
                txt_path = str(course_dir / f"{std_name}.txt")
                img_path = str(img_course_dir / f"{std_name}.png")
                
                # Save image to final location
                shutil.copy2(img_file, img_path)
                
                # OCR with Tesseract
                result = subprocess.run([
                    'tesseract', img_path, 'stdout',
                    '-l', 'deu', '--psm', '3'
                ], capture_output=True, text=True)
                
                page_text = result.stdout
                
                # Save text
                with open(txt_path, 'w', encoding='utf-8') as f:
                    f.write(f"=== {course} {level} {type_} Seite {idx} ===\n\n")
                    f.write(page_text)
                
                # Extract audio references
                audio_refs = extract_audio_refs(page_text)
                
                results.append({
                    'course': course,
                    'level': level,
                    'type': type_,
                    'page_num': idx,
                    'pdf_path': str(pdf_path),
                    'txt_path': txt_path,
                    'img_path': img_path,
                    'audio_refs': audio_refs,
                    'raw_text': page_text
                })
                
        return results, None
    
    except Exception as e:
        return [], str(e)

def find_pdfs(base_dir):
    """Find all split PDFs (<5MB) recursively"""
    pdfs = []
    for root, dirs, files in os.walk(base_dir):
        for f in files:
            if f.endswith('.pdf'):
                full_path = os.path.join(root, f)
                try:
                    size = os.path.getsize(full_path)
                    if size < 5 * 1024 * 1024:  # <5MB
                        pdfs.append(full_path)
                except:
                    pass
    return pdfs

def main():
    print("Starting German Content Architect Pipeline (Parallel)...")
    print(f"Base directory: {BASE_DIR}")
    
    # Initialize database
    conn, cursor = init_db()
    
    # Find all split PDFs
    pdfs = find_pdfs(BASE_DIR)
    print(f"Found {len(pdfs)} split PDFs to process")
    
    # Process PDFs in parallel
    with ProcessPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {executor.submit(process_pdf, pdf): pdf for pdf in pdfs}
        
        for i, future in enumerate(as_completed(futures), 1):
            pdf_path = futures[future]
            try:
                results, error = future.result()
                
                if error:
                    print(f"[{i}/{len(pdfs)}] Error processing {pdf_path}: {error}")
                    continue
                
                # Insert results into database
                for r in results:
                    cursor.execute('''
                    INSERT INTO pages (course, level, type, page_num, pdf_path, txt_path, img_path, audio_refs, raw_text)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ''', (r['course'], r['level'], r['type'], r['page_num'], 
                         r['pdf_path'], r['txt_path'], r['img_path'], 
                         r['audio_refs'], r['raw_text']))
                
                conn.commit()
                print(f"[{i}/{len(pdfs)}] Processed: {Path(pdf_path).name} ({len(results)} pages)")
                
            except Exception as e:
                print(f"[{i}/{len(pdfs)}] Error processing {pdf_path}: {e}")
    
    print("\nPipeline complete!")
    conn.close()

if __name__ == "__main__":
    main()
