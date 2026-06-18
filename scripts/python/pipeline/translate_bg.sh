#!/bin/bash
source ~/parler_env/bin/activate

python3 << 'PYEOF'
import os
import sys
import time
from deep_translator import GoogleTranslator

# Track total files processed globally for the progress indicator
TOTAL_FILES = 5862
files_processed = 0

# Initialize translators
en_translator = GoogleTranslator(source='de', target='en')
fr_translator = GoogleTranslator(source='de', target='fr')

list_file = '/tmp/all_transcription_dirs.txt'
if not os.path.exists(list_file):
    print(f"Error: {list_file} not found. Please regenerate your folder list first.", flush=True)
    sys.exit(1)

with open(list_file, 'r', encoding='utf-8') as f:
    directories = [line.strip() for line in f if line.strip()]

print(f"Starting translation pipeline for {len(directories)} directories...", flush=True)

for target_dir in directories:
    if not os.path.isdir(target_dir):
        continue
        
    # Process every .txt file in the current directory
    for root, _, files in os.walk(target_dir):
        for file in files:
            # Only translate original raw text files, skip already translated ones
            if file.endswith('.txt') and not file.endswith('_translated.txt'):
                file_path = os.path.join(root, file)
                output_path = os.path.join(root, file.replace('.txt', '_translated.txt'))
                
                # Resumable: Skip if translation output already exists
                if os.path.exists(output_path):
                    files_processed += 1
                    continue
                
                # Read the German lines
                with open(file_path, 'r', encoding='utf-8') as f_in:
                    lines = [line.strip() for line in f_in if line.strip()]
                
                translated_lines = []
                for line in lines:
                    # Strip out audio source tags like if present for cleaner translation
                    clean_line = line
                    tag = ""
                    if line.startswith('') + 1
                        tag = line[:split_idx] + " "
                        clean_line = line[split_idx:].strip()
                    
                    try:
                        e = en_translator.translate(clean_line) if clean_line else ""
                        f = fr_translator.translate(clean_line) if clean_line else ""
                        translated_lines.append((tag + clean_line, e, f))
                    except Exception as err:
                        translated_lines.append((line, "[Error]", "[Error]"))
                    time.sleep(0.05) # Tiny sleep to play nice with the API rate limits
                
                # Save the side-by-side translation
                with open(output_path, 'w', encoding='utf-8') as f_out:
                    f_out.write("GERMAN | ENGLISH | FRENCH\n")
                    f_out.write("="*60 + "\n")
                    for de, eng, fre in translated_lines:
                        f_out.write(f"DE: {de}\n")
                        f_out.write(f"EN: {eng}\n")
                        f_out.write(f"FR: {fre}\n")
                        f_out.write("-" * 40 + "\n")
                
                files_processed += 1
                pct = round((files_processed / TOTAL_FILES) * 100, 2)
                print(f"Progress: {files_processed}/{TOTAL_FILES} files ({pct}%) | Last processed: {file}", flush=True)

print("Pipeline complete! All translations generated and saved side-by-side.", flush=True)
PYEOF
