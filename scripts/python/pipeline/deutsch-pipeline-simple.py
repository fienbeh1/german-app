#!/home/f/miniforge3/bin/python
"""
German Content Architect - Simple OCR Pipeline
Uses Tesseract (CPU) for reliability - EasyOCR has dependency issues with Python 3.13
"""

import os
import json
import sqlite3
import subprocess
from pathlib import Path
import tempfile
import re

# Configuration
BASE_DIR = "/home/f/deutsch-material/Deutsch als Fremdsprache"
OUTPUT_DIR = "/home/f/deutsch-app/ocr"
IMAGE_DIR = "/home/f/deutsch-app/images"
DB_PATH = "/home/f/deutsch-app/deutsch.db"

# Setup SQLite database
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
        elif "Arbeitsbuch" in part:
            type_ = "AB"
        elif "Lehrerhandbuch" in part:
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

def split_pdf_and_ocr(pdf_path):
    """Split PDF into images and OCR each page with Tesseract"""
    course, level, type_ = parse_filename(pdf_path)
    base_name = Path(pdf_path).stem
    
    # Create output directories
    course_dir = Path(OUTPUT_DIR) / course / level / type_
    img_course_dir = Path(IMAGE_DIR) / course / level / type_
    course_dir.mkdir(parents=True, exist_ok=True)
    img_course_dir.mkdir(parents=True, exist_ok=True)
    
    # Use pdftoppm to convert PDF to images
    with tempfile.TemporaryDirectory() as tmpdir:
        # Convert PDF pages to images at 300 DPI
        subprocess.run([
            'pdftoppm', '-r', '300', '-png',
            pdf_path, f"{tmpdir}/page"
        ], check=True)
        
        # Process each page image
        page_files = sorted(Path(tmpdir).glob('page-*.png'))
        
        for idx, img_file in enumerate(page_files, 1):
            std_name = f"{course}_{level}_{type_}_{idx:03d}"
            txt_path = course_dir / f"{std_name}.txt"
            img_path = img_course_dir / f"{std_name}.png"
            
            # Save image to final location (copy instead of rename to avoid cross-device error)
            import shutil
            shutil.copy2(img_file, img_path)
            
            # OCR with Tesseract
            result = subprocess.run([
                'tesseract', str(img_path), 'stdout',
                '-l', 'deu', '--psm', '3'
            ], capture_output=True, text=True)
            
            page_text = result.stdout
            
            # Save text
            with open(txt_path, 'w', encoding='utf-8') as f:
                f.write(f"=== {course} {level} {type_} Seite {idx} ===\n\n")
                f.write(page_text)
            
            # Extract audio references
            audio_refs = extract_audio_refs(page_text)
            
            # Save to database
            cursor.execute('''
            INSERT INTO pages (course, level, type, page_num, pdf_path, txt_path, img_path, audio_refs, raw_text)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (course, level, type_, idx, str(pdf_path), str(txt_path), str(img_path), audio_refs, page_text))
            
            print(f"Processed: {std_name}")
    
    conn.commit()

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

if __name__ == "__main__":
    print("Starting German Content Architect Pipeline (Tesseract)...")
    print(f"Base directory: {BASE_DIR}")
    
    # Find all split PDFs
    pdfs = find_pdfs(BASE_DIR)
    print(f"Found {len(pdfs)} split PDFs to process")
    
    # Process all PDFs
    for i, pdf_path in enumerate(pdfs, 1):
        print(f"\n[{i}/{len(pdfs)}] Processing: {pdf_path}")
        try:
            split_pdf_and_ocr(pdf_path)
        except Exception as e:
            print(f"Error processing {pdf_path}: {e}")
            continue
    
    print("\nPipeline complete!")
    conn.close()
