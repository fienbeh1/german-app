#!/usr/bin/env python3
"""Scan merged TXT files with local model to extract audio/transcription/answer references."""
import os, sys, json, glob, requests, re, time, traceback
from pathlib import Path

OLLAMA_URL = "http://localhost:11434"
MODEL = "qwen2.5-coder:7b"
COURSES_DIR = "/home/f/deutsch-app/de"
OUTPUT_FILE = "/tmp/audio_refs_scan.json"

PROMPT = """You are a scanner. Read this German textbook OCR text and extract structured data. Return JSON ONLY.

Rules:
1. Find audio exercise references: patterns like "1|2" (CD 1 Track 2), "CD 1 Track 5", "Hören Sie", "Wiederholen", "Hörverstehen", "Hörtext" with nearby CD/track numbers
2. Find transcription sections: text labeled "Transkription", "Hörtext", "Transcript"
3. Find answer sections: text labeled "Lösungen", "Antworten", "Lösungsschlüssel", "Answers"
4. Extract page numbers from "START PAGE NNN" headers

Return this exact JSON structure:
{
  "book_name": "path/to/book",
  "pages_scanned": [
    {
      "page": 123,
      "audio_refs": [{"cd": 1, "track": 2, "exercise_text": "first few words of exercise"}],
      "has_transcription": false,
      "has_answers": false,
      "transcription_preview": "",
      "section_type": "lesson"
    }
  ]
}

section_type is one of: lesson, transcription, answers, vocabulary, grammar, cover, other

Text to scan:
---
{TEXT}
---
"""

def extract_book_name(filepath):
    """Extract book name from file path relative to COURSES_DIR."""
    rel = os.path.relpath(filepath, COURSES_DIR)
    parts = rel.split('/')
    try:
        txt_idx = parts.index('txt')
        return '/'.join(parts[:txt_idx])
    except ValueError:
        return '/'.join(parts[:-2])

def extract_pages(text):
    """Split merged text into individual pages."""
    pages = []
    pattern = r'========================= START PAGE (\d+) ========================='
    matches = list(re.finditer(pattern, text))
    
    for i, match in enumerate(matches):
        page_num = int(match.group(1))
        start = match.end()
        end = matches[i+1].start() if i+1 < len(matches) else len(text)
        page_text = text[start:end].strip()
        pages.append((page_num, page_text))
    
    return pages

def scan_with_model(text, book_name):
    """Send text to Ollama model and get structured response."""
    try:
        resp = requests.post(
            f"{OLLAMA_URL}/api/generate",
            json={
                "model": MODEL,
                "prompt": PROMPT.replace("{TEXT}", text[:8000]),
                "stream": False,
                "options": {"temperature": 0.1, "num_predict": 2000}
            },
            timeout=120
        )
        result = resp.json().get("response", "")
        
        # Extract JSON from response
        start = result.find("{")
        end = result.rfind("}") + 1
        if start >= 0 and end > start:
            return json.loads(result[start:end])
    except Exception as e:
        return {"error": str(e)}
    
    return None

def scan_regex_only(text, book_name):
    """Fast regex-based scanning as fallback."""
    pages = extract_pages(text)
    results = []
    
    for page_num, page_text in pages:
        audio_refs = []
        
        # Find CD|Track patterns like "1|2", "1|3"
        for m in re.finditer(r'(\d+)\|(\d+)', page_text):
            cd = int(m.group(1))
            track = int(m.group(2))
            # Get exercise text (next 50 chars after the pattern)
            exercise_text = page_text[m.end():m.end()+50].strip().split('\n')[0][:40]
            audio_refs.append({"cd": cd, "track": track, "exercise_text": exercise_text})
        
        # Find "CD X Track Y" patterns
        for m in re.finditer(r'CD\s*(\d+)\s*Track\s*(\d+)', page_text, re.IGNORECASE):
            cd = int(m.group(1))
            track = int(m.group(2))
            exercise_text = page_text[m.end():m.end()+50].strip().split('\n')[0][:40]
            audio_refs.append({"cd": cd, "track": track, "exercise_text": exercise_text})
        
        # Check for audio keywords
        lower = page_text.lower()
        has_audio_keywords = any(kw in lower for kw in ['hören sie', 'wiederholen', 'hörverstehen', 'hörtext'])
        
        has_transcription = any(kw in lower for kw in ['transkript', 'transcription'])
        has_answers = any(kw in lower for kw in ['lösung', 'antwort', 'answer'])
        
        # Determine section type
        if has_transcription:
            section_type = "transcription"
        elif has_answers:
            section_type = "answers"
        elif audio_refs or has_audio_keywords:
            section_type = "lesson"
        else:
            section_type = "other"
        
        if audio_refs or has_transcription or has_answers or has_audio_keywords:
            results.append({
                "page": page_num,
                "audio_refs": audio_refs,
                "has_transcription": has_transcription,
                "has_answers": has_answers,
                "section_type": section_type
            })
    
    return {"book_name": book_name, "pages_scanned": results}

def main():
    merged_files = sorted(glob.glob(f"{COURSES_DIR}/**/txt/merged/batch_*.txt", recursive=True))
    print(f"Found {len(merged_files)} merged batch files to scan")
    
    all_results = []
    errors = []
    
    for i, filepath in enumerate(merged_files):
        book_name = extract_book_name(filepath)
        
        try:
            with open(filepath, 'r', errors='ignore') as f:
                text = f.read()
        except Exception as e:
            errors.append({"file": filepath, "error": str(e)})
            continue
        
        # Quick pre-filter with regex
        lower = text.lower()
        has_relevant = any(kw in lower for kw in [
            'hören', 'wiederholen', 'hörtext', 'hörverstehen',
            'transkript', 'transcription',
            'lösung', 'antwort', 'answer',
            'cd ', 'track'
        ])
        
        if not has_relevant:
            continue
        
        # Try regex scan first (fast)
        result = scan_regex_only(text, book_name)
        
        if result and result.get("pages_scanned"):
            all_results.append(result)
        
        if (i + 1) % 100 == 0:
            print(f"Scanned {i+1}/{len(merged_files)} files, found {len(all_results)} with relevant content")
            # Save intermediate
            with open(OUTPUT_FILE, 'w') as f:
                json.dump({"results": all_results, "errors": errors}, f, indent=2)
    
    # Final save
    with open(OUTPUT_FILE, 'w') as f:
        json.dump({"results": all_results, "errors": errors}, f, indent=2)
    
    print(f"\nDone. Found {len(all_results)} books with audio/transcription/answer references.")
    print(f"Results saved to {OUTPUT_FILE}")
    
    # Summary
    total_pages = sum(len(r["pages_scanned"]) for r in all_results)
    total_audio_refs = sum(len(p["audio_refs"]) for r in all_results for p in r["pages_scanned"])
    total_trans = sum(1 for r in all_results for p in r["pages_scanned"] if p["has_transcription"])
    total_ans = sum(1 for r in all_results for p in r["pages_scanned"] if p["has_answers"])
    
    print(f"Total pages with relevant content: {total_pages}")
    print(f"Total audio references found: {total_audio_refs}")
    print(f"Pages with transcriptions: {total_trans}")
    print(f"Pages with answers: {total_ans}")

if __name__ == "__main__":
    main()
