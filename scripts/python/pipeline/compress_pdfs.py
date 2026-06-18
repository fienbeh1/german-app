#!/usr/bin/env python3
"""Convert all Delfin page PDFs to 100dpi JPEGs to save disk space."""
import os, subprocess, sys, glob, time
from pathlib import Path

DELFIN_DIR = "/home/f/deutsch-app/de/delfin"
PDF_DIR = os.path.join(DELFIN_DIR, "pdf")
JPEG_DIR = os.path.join(DELFIN_DIR, "jpg")

os.makedirs(JPEG_DIR, exist_ok=True)

pdf_files = sorted(glob.glob(os.path.join(PDF_DIR, "Delfin_*.pdf")))
print(f"Found {len(pdf_files)} PDF pages to convert")

total_in = 0
total_out = 0
converted = 0
skipped = 0

for i, pdf_path in enumerate(pdf_files):
    base = os.path.basename(pdf_path).replace(".pdf", "")
    jpg_path = os.path.join(JPEG_DIR, f"{base}.jpg")

    if os.path.exists(jpg_path) and os.path.getsize(jpg_path) > 1000:
        skipped += 1
        continue

    in_size = os.path.getsize(pdf_path)
    total_in += in_size

    cmd = [
        "/usr/bin/convert",
        "-density", "100",
        "-quality", "85",
        pdf_path,
        jpg_path
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"  FAIL [{i+1}/{len(pdf_files)}] {base}: {result.stderr.strip()}", flush=True)
        continue

    if os.path.exists(jpg_path):
        out_size = os.path.getsize(jpg_path)
        total_out += out_size
        ratio = in_size / out_size if out_size > 0 else 0
        converted += 1
        if (i+1) % 25 == 0 or i == 0:
            print(f"  [{i+1}/{len(pdf_files)}] {base}: {in_size//1024}K -> {out_size//1024}K ({ratio:.0f}:1)", flush=True)

print(f"\nDone: {converted} converted, {skipped} skipped")
print(f"Total input:  {total_in // 1024 // 1024} MB")
print(f"Total output: {total_out // 1024 // 1024} MB")
print(f"Saving:       {(total_in - total_out) // 1024 // 1024} MB")
print(f"Ratio:        {total_in/total_out:.1f}:1" if total_out > 0 else "N/A")
