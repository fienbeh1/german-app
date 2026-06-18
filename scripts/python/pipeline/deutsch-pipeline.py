#!/home/f/miniforge3/bin/python
"""
German Content Architect - OCR Pipeline
Processes split PDFs (<5MB) to extract text via EasyOCR + generates split page images
"""

import os
import json
import re
import sqlite3
from pathlib import Path
from datetime import datetime
from PIL import Image
import fitz  # PyMuPDF
import easyocr

# Configuration
BASE_DIR = "/home/f/deutsch-material/Deutsch als Fremdsprache"
OUTPUT_DIR = "/home/f/deutsch-app/ocr"
IMAGE_DIR = "/home/f/deutsch-app/images"
DB_PATH = "/home/f/deutsch-app/deutsch.db"

# Initialize EasyOCR with GPU
print("Initializing EasyOCR with GPU...")
reader = easyocr.Reader(['de'], gpu=True)

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
    raw_text TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
    
    parts = rel_path.parts
    course = ""
    level = ""
    type_ = ""
    
    # Extract from path structure
    for part in parts:
        if "Lagune" in part:
            course = "Lagune"
            # Extract level from folder name
            match = re.search(r'Lagune\s+(\d+)', part)
            if match:
                level = f"A{match.group(1)}" if int(match.group(1)) <= 2 else f"B{match.group(1)-2}"
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

def split_pdf_and_ocr(pdf_path, output_dir, image_dir):
    """Split PDF into pages, OCR each page, save text and images"""
    course, level, type_ = parse_filename(pdf_path)
    base_name = Path(pdf_path).stem
    
    # Create output directories
    course_dir = Path(output_dir) / course / level / type_
    img_course_dir = Path(image_dir) / course / level / type_
    course_dir.mkdir(parents=True, exist_ok=True)
    img_course_dir.mkdir(parents=True, exist_ok=True)
    
    # Open PDF
    doc = fitz.open(pdf_path)
    all_text = []
    
    for page_num in range(len(doc)):
        page = doc[page_num]
        
        # Generate standardized filename
        std_name = f"{course}_{level}_{type_}_{page_num+1:03d}"
        
        # Render page to image (300 DPI)
        mat = fitz.Matrix(300/72, 300/72)  # 300 DPI
        pix = page.get_pixmap(matrix=mat)
        img_path = img_course_dir / f"{std_name}.png"
        pix.save(str(img_path))
        
        # OCR the image
        img = Image.open(img_path)
        result = reader.readtext(str(img_path), detail=0, paragraph=True)
        page_text = "\n".join(result)
        
        # Save page text
        txt_path = course_dir / f"{std_name}.txt"
        with open(txt_path, 'w', encoding='utf-8') as f:
            f.write(f"=== {course} {level} {type_} Seite {page_num+1} ===\n\n")
            f.write(page_text)
        
        # Extract audio references
        audio_refs = extract_audio_refs(page_text)
        
        # Save to database
        cursor.execute('''
        INSERT INTO pages (course, level, type, page_num, pdf_path, txt_path, img_path, audio_refs, raw_text)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (course, level, type_, page_num+1, str(pdf_path), str(txt_path), str(img_path), audio_refs, page_text))
        
        page_id = cursor.lastrowid
        all_text.append(page_text)
        
        print(f"Processed: {std_name}")
    
    doc.close()
    conn.commit()
    
    return page_id

def find_pdfs(base_dir):
    """Find all split PDFs (<5MB) recursively"""
    pdfs = []
    for root, dirs, files in os.walk(base_dir):
        for f in files:
            if f.endswith('.pdf'):
                full_path = os.path.join(root, f)
                size = os.path.getsize(full_path)
                if size < 5 * 1024 * 1024:  # <5MB
                    pdfs.append(full_path)
    return pdfs

if __name__ == "__main__":
    print("Starting German Content Architect Pipeline...")
    print(f"Base directory: {BASE_DIR}")
    
    # Find all split PDFs
    pdfs = find_pdfs(BASE_DIR)
    print(f"Found {len(pdfs)} split PDFs to process")
    
    # Process all PDFs
    for i, pdf_path in enumerate(pdfs, 1):
        print(f"\n[{i}/{len(pdfs)}] Processing: {pdf_path}")
        try:
            split_pdf_and_ocr(pdf_path, OUTPUT_DIR, IMAGE_DIR)
        except Exception as e:
            print(f"Error processing {pdf_path}: {e}")
            continue
    
    print("\nPipeline complete!")
    conn.close()
