#!/usr/bin/env python3
"""Process remaining Arbeitsbuch pages (482-504) through Ollama AI analysis."""
import os, json, sys, urllib.request, time

DELFIN_DIR = "/home/f/deutsch-app/de/delfin"
TXT_DIR = os.path.join(DELFIN_DIR, "txt")
AI_DIR = os.path.join(DELFIN_DIR, "ai")
OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL = "mistral:latest"

os.makedirs(AI_DIR, exist_ok=True)

files = sorted(os.listdir(TXT_DIR))
remaining = []
for f in files:
    if not f.endswith(".txt"):
        continue
    ai_path = os.path.join(AI_DIR, f.replace(".txt", ".txt").replace("Delfin_", "AI_Delfin_"))
    if os.path.exists(ai_path) and os.path.getsize(ai_path) > 20:
        continue
    remaining.append((os.path.join(TXT_DIR, f), ai_path))

print(f"Remaining pages to analyze: {len(remaining)}")
if not remaining:
    print("All done!")
    sys.exit(0)

SYSTEM = "You are a German linguistic expert. Summarize the text in English, provide a German→English vocabulary list of key terms, and note any grammar points. Output in this format:\n\nSUMMARY: <English summary>\n\nVOCABULARY:\n- <German word>: <English translation>\n\nGRAMMAR: <notes>"

for i, (txt_path, ai_path) in enumerate(remaining):
    try:
        with open(txt_path, "r", errors="replace") as f:
            content = f.read().strip()
        if len(content) < 10:
            with open(ai_path, "w") as f:
                f.write(f"(Empty page)")
            print(f"  [{i+1}/{len(remaining)}] {os.path.basename(txt_path)}: empty, skipped", flush=True)
            continue
    except Exception as e:
        print(f"  [{i+1}/{len(remaining)}] Error reading: {e}", flush=True)
        continue

    prompt = f"{SYSTEM}\n\nTEXT:\n{content[:3000]}"
    payload = json.dumps({
        "model": MODEL, "prompt": prompt, "stream": False,
        "options": {"temperature": 0.3, "num_predict": 2000}
    })
    req = urllib.request.Request(OLLAMA_URL, data=payload.encode(),
                                 headers={"Content-Type": "application/json"})
    for attempt in range(3):
        try:
            resp = urllib.request.urlopen(req, timeout=300)
            text = json.loads(resp.read()).get("response", "")
            if text:
                with open(ai_path, "w") as f:
                    f.write(text)
                print(f"  [{i+1}/{len(remaining)}] {os.path.basename(txt_path)}: {len(text)} chars", flush=True)
                break
        except Exception as e:
            if attempt < 2:
                print(f"  Retry {attempt+1}: {e}", flush=True)
                time.sleep(5)
            else:
                print(f"  FAIL [{i+1}/{len(remaining)}] {os.path.basename(txt_path)}: {e}", flush=True)
                with open(ai_path, "w") as f:
                    f.write(f"(Error: {e})")
    time.sleep(0.5)

print(f"\nDone! Total AI files: {len(os.listdir(AI_DIR))}")
