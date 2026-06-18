#!/usr/bin/env python3
import subprocess, json, re, sys

def clean_ansi(text):
    return re.sub(r'\x1b\[[0-9;]*[a-zA-Z]', '', text)

def extract_json(text):
    text = clean_ansi(text)
    text = re.sub(r'```(?:json)?', '', text).strip()
    start = text.find('{')
    end = text.rfind('}')
    if start >= 0 and end > start:
        return text[start:end+1]
    return None

prompt = """Generate ONE German grammar exercise for level A1 (Lagune 1).
Topic: articles der/die/das
Type: articles

Output ONLY a JSON object with these keys:
  numero: 1
  tipo: "articles"
  titulo: short German title (max 60 chars)
  texto: exercise in German with ___ for blanks and [options] in brackets
  instrucciones: German instructions (max 100 chars)

No markdown. Just the JSON object."""

print("Calling Mistral...")
result = subprocess.run(['ollama', 'run', 'mistral'],
    input=prompt.encode(), capture_output=True, timeout=60)
raw = result.stdout.decode('utf-8', errors='replace')
print(f"RAW ({len(raw)} chars): {repr(raw[:600])}")
js = extract_json(raw)
print(f"\nEXTRACTED: {js}")
if js:
    try:
        print(f"\nPARSED: {json.loads(js)}")
    except json.JSONDecodeError as e:
        print(f"JSON ERROR: {e}")
        try:
            print(f"PARSED (strict=False): {json.loads(js, strict=False)}")
        except Exception as e2:
            print(f"STRICT FALSE ERROR: {e2}")
