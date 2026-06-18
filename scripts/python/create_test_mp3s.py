#!/mnt/storage/venv/bin/python
"""
Generate artificial test MP3s from Delfin transcriptions using gTTS.
Picks 3 MP3s per book directory, generates TTS audio.
"""
import os, sys, re
import json

DELFIN = '/home/f/deutsch-app/delfin'
OUTPUT_DIR = '/home/f/deutsch-app/test-mp3'
MP3S_PER_BOOK = 3

def find_books():
    """Find all book directories under delfin that contain CD dirs with transcriptions."""
    books = []
    for entry in sorted(os.listdir(DELFIN)):
        book_path = os.path.join(DELFIN, entry)
        if not os.path.isdir(book_path) or entry.startswith('.'):
            continue
        # Resolve symlinks: find inner content dirs
        # Look for transcription dirs
        cd_dirs = []
        for root, dirs, files in os.walk(book_path):
            if 'transcriptions_de' in dirs:
                cd_dir = os.path.dirname(os.path.join(root, 'transcriptions_de'))
                cd_dirs.append(cd_dir)
        if cd_dirs:
            books.append({
                'name': entry,
                'path': book_path,
                'cd_dirs': cd_dirs,
            })
    return books

def pick_mp3s(book, n=MP3S_PER_BOOK):
    """Pick up to n MP3 files from a book's CD dirs that have matching transcriptions."""
    candidates = []
    for cd_dir in book['cd_dirs']:
        trans_dir = os.path.join(cd_dir, 'transcriptions_de')
        if not os.path.isdir(trans_dir):
            continue
        for f in sorted(os.listdir(cd_dir)):
            if not f.endswith('.mp3'):
                continue
            # Find matching transcription
            txt_name = f.replace('.mp3', '.txt')
            # Try exact match and various space patterns
            txt_path = None
            for p in [os.path.join(trans_dir, txt_name)]:
                if os.path.exists(p):
                    txt_path = p
                    break
            if not txt_path:
                # Try fuzzy match: same digits
                digits = re.search(r'(\d+)', f)
                if digits:
                    d = digits.group(1)
                    for tf in os.listdir(trans_dir):
                        if d in tf and tf.endswith('.txt'):
                            txt_path = os.path.join(trans_dir, tf)
                            break
            if txt_path:
                candidates.append({
                    'mp3_path': os.path.join(cd_dir, f),
                    'mp3_name': f,
                    'txt_path': txt_path,
                    'cd': os.path.basename(cd_dir),
                })
    # Pick evenly spaced tracks (beginning, middle, end)
    if len(candidates) <= n:
        return candidates
    indices = sorted([0, len(candidates)//2, len(candidates)-1])[:n]
    return [candidates[i] for i in indices]

def read_german_text(txt_path):
    """Read the German text from a transcription file (before ---ENGLISH---)."""
    with open(txt_path, 'r', encoding='utf-8') as f:
        content = f.read()
    # Extract German part before ---ENGLISH---
    m = re.split(r'---ENGLISH---', content, maxsplit=1)
    german = m[0].strip()
    # Remove leading non-text lines (copyright, etc.)
    lines = german.split('\n')
    # Filter out lines that are just copyright/numbers
    clean_lines = []
    for line in lines:
        stripped = line.strip()
        if stripped and not stripped.startswith('Copyright') and not stripped.startswith('WDR') and not stripped.startswith('www.') and not re.match(r'^\d+$', stripped):
            clean_lines.append(stripped)
    text = ' '.join(clean_lines)
    # Remove extra whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def generate_mp3(text, output_path):
    """Generate MP3 from text using gTTS."""
    try:
        from gtts import gTTS
        tts = gTTS(text[:500], lang='de', slow=False)  # Limit to 500 chars for speed
        tts.save(output_path)
        return True
    except Exception as e:
        print(f"  gTTS error: {e}")
        return False

def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    books = find_books()
    print(f"Found {len(books)} books with audio")
    
    total_generated = 0
    manifest = []
    
    for book in books:
        print(f"\n{'='*60}")
        print(f"Book: {book['name']}")
        print(f"CD dirs: {len(book['cd_dirs'])}")
        
        picks = pick_mp3s(book, MP3S_PER_BOOK)
        print(f"Selected {len(picks)} tracks")
        
        for i, pick in enumerate(picks):
            txt_path = pick['txt_path']
            text = read_german_text(txt_path)
            if not text:
                print(f"  [{i+1}] SKIP: No text in {txt_path}")
                continue
            
            # Create output name: Book_CD_Desc.mp3
            book_slug = re.sub(r'[^A-Za-z0-9]', '_', book['name']).strip('_')
            cd_slug = re.sub(r'[^A-Za-z0-9]', '_', pick['cd']).strip('_')
            desc_slug = re.sub(r'[^A-Za-z0-9]', '_', pick['mp3_name'].replace('.mp3', '')).strip('_')
            out_name = f"{book_slug}_{cd_slug}_{desc_slug}.mp3"
            out_path = os.path.join(OUTPUT_DIR, out_name)
            
            # Truncate text for TTS - use first 300 chars
            tts_text = text[:300]
            print(f"  [{i+1}] Generating: {out_name}")
            print(f"       Text: {tts_text[:80]}...")
            
            if generate_mp3(tts_text, out_path):
                total_generated += 1
                manifest.append({
                    'file': out_name,
                    'book': book['name'],
                    'cd': pick['cd'],
                    'track': pick['mp3_name'],
                    'original_text': text,
                    'tts_text': tts_text,
                    'transcription_file': os.path.relpath(txt_path, DELFIN),
                })
                print(f"       -> {out_name} ({os.path.getsize(out_path)} bytes)")
            else:
                print(f"       FAILED")
    
    # Write manifest
    manifest_path = os.path.join(OUTPUT_DIR, 'manifest.json')
    with open(manifest_path, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    
    print(f"\n{'='*60}")
    print(f"Generated {total_generated} test MP3s")
    print(f"Manifest: {manifest_path}")

if __name__ == '__main__':
    main()
