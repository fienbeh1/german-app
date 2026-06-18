#!/usr/bin/env python3
"""
Procesamiento optimizado para deutsch-gemma3-ib (RAG alemán)
Usa prompts en alemán para mejor precisión
"""

import os
import json
import re
from pathlib import Path
from typing import Optional, Dict, List
import requests
from datetime import datetime
from config import OLLAMA_MODEL, OLLAMA_BASE_URL, MODEL_CONFIG, BASE_DIR
from audio_patterns import AudioDetector


def call_deutsch_gemma(prompt: str) -> str:
    """Llama al modelo deutsch-gemma3-ib"""
    url = f"{OLLAMA_BASE_URL}/api/generate"

    payload = {
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "stream": False,
        "options": MODEL_CONFIG
    }

    try:
        response = requests.post(url, json=payload, timeout=180)
        response.raise_for_status()
        result = response.json()
        return result.get("response", "")
    except Exception as e:
        print(f" Error: {str(e)[:50]}")
        return ""


def generate_index_prompt_german(text_content: str, book_name: str) -> str:
    """
    Prompt en ALEMÁN para extraer Inhaltsverzeichnis
    El modelo RAG alemán debería entenderlo mejor
    """

    prompt = f"""Du bist Experte für deutsche Lehrbücher (DaF - Deutsch als Fremdsprache).

BUCH: {book_name}

INHALT (Inhaltsverzeichnis):
{text_content}

AUFGABE:
Analysiere dieses Inhaltsverzeichnis und extrahiere die Buchstruktur.

⚠️ SEHR WICHTIG - Unterscheide klar:
- Lektionsnummer (z.B. "Lektion 3", "Einheit 5", "Kapitel 2")
- Seitennummer (normalerweise am Zeilenende mit Punkten: "....... 45")

Die Lektionsnummer ist NICHT die Seitennummer!

BEISPIEL:
"Lektion 3  Im Restaurant ............ 45"
→ Lektion-Nummer: 3
→ Startseite: 45

AUSGABE-FORMAT (NUR JSON, keine Erklärungen):
{{
  "buchstruktur": [
    {{
      "nummer": "3",
      "name": "Lektion 3",
      "titel": "Im Restaurant",
      "startseite": "45",
      "themen": ["Essen bestellen", "Zahlen"],
      "abschnitte": [
        {{"name": "Wortschatz", "seite": "46"}},
        {{"name": "Grammatik: Modalverben", "seite": "48"}}
      ]
    }}
  ]
}}

Extrahiere ALLE Lektionen/Einheiten aus dem Inhaltsverzeichnis.

NUR JSON:"""

    return prompt


def generate_page_prompt_german(
    text_content: str,
    context: dict,
    index_data: Optional[dict] = None
) -> str:
    """
    Prompt en ALEMÁN para análisis de páginas
    Optimizado para RAG alemán
    """

    # Contexto del índice si existe
    index_context = ""
    if index_data and 'buchstruktur' in index_data:
        units = index_data['buchstruktur']
        index_context = f"""
BEKANNTE BUCHSTRUKTUR (aus Inhaltsverzeichnis):
{json.dumps(units, ensure_ascii=False, indent=2)}
"""

    prompt = f"""Du bist Experte für deutsche Lehrbücher (DaF - Deutsch als Fremdsprache).

BUCH: {context.get('book_name', 'Unbekannt')}
NIVEAU: {context.get('level', 'Unbekannt')}
TYP: {context.get('material_type', 'Unbekannt')}

{index_context}

SEITENINHALT:
{text_content[:2500]}

AUFGABE - Analysiere diese Seite und extrahiere:

1. STRUKTUR
   - Seitennummer (suche im Text)
   - Zu welcher Lektion/Einheit gehört sie?
   - Abschnitt (z.B. "Grammatik", "Wortschatz", "Übungen")

2. AUDIO-REFERENZEN (sehr wichtig!)
   Suche nach ALLEN Erwähnungen von Audio. WICHTIGE FORMATE:

   **LAGUNE-FORMAT:**
   - Notation: X|Y = CD X, Track Y
   - Beispiel: "1|2" = CD 1, Track 2
   - Oft nach "Hören Sie die Nachricht..."

   **SCHRITTE-FORMAT:**
   - Notation: X|Y oder X|Y-Z = CD X, Track(s) Y(-Z)
   - Beispiel: "1|25-27" = CD 1, Tracks 25-27
   - Mit Labels: "AUDIO-TRAINING", "VIDEO-TRAINING"

   **TANGRAM-FORMAT:**
   - "Hören Sie..." gefolgt von Zahl auf nächster Zeile
   - Beispiel: "Hören Sie noch einmal.\n30" = Track 30

   **ALLGEMEIN:**
   - "Hören Sie" / "Hör mal"
   - "CD 1", "CD 2"
   - "Track X"
   - "Wiederholen Sie" / "Sprechen Sie nach"
   - Symbole: 🎧

3. INHALTSTYP
   Klassifiziere die Seite:
   - dialog, grammatikerklärung, wortschatzliste
   - übung_lückentext, übung_zuordnung
   - hörverstehen, leseverstehen
   - aussprache, landeskunde

4. THEMA
   - Hauptthema auf Deutsch
   - Hauptthema auf Spanisch

5. GRAMMATIK
   - Welche grammatischen Strukturen?
   - Beispiele aus dem Text

6. VOKABULAR (die 10-15 wichtigsten Wörter)
   - Wort mit Artikel (der/die/das)
   - Plural (wenn Substantiv)
   - Übersetzung Spanisch
   - Wortart (Substantiv/Verb/Adjektiv/etc)

7. ÜBUNGEN
   - Typ der Übung
   - Anweisung (Deutsch + Spanisch)

AUSGABE-FORMAT (NUR JSON):
{{
  "struktur": {{
    "seite": "12",
    "lektion": "Lektion 2",
    "abschnitt": "Hörverstehen"
  }},

  "audio": [
    {{
      "anweisung": "Hören Sie das Gespräch",
      "track": "12",
      "cd": "1",
      "typ": "Dialog",
      "beschreibung_es": "Escuche la conversación"
    }}
  ],

  "inhaltstyp": ["dialog", "hörverstehen"],

  "thema": {{
    "de": "Im Restaurant",
    "es": "En el restaurante"
  }},

  "grammatik": [
    {{
      "name": "Modalverben",
      "beschreibung": "können, müssen, dürfen",
      "beispiele": ["Ich kann Deutsch sprechen.", "Er muss arbeiten."]
    }}
  ],

  "vokabular": [
    {{
      "wort": "die Wohnung",
      "artikel": "die",
      "plural": "die Wohnungen",
      "übersetzung_es": "apartamento, vivienda",
      "wortart": "Substantiv",
      "kontext": "Ich suche eine Wohnung."
    }},
    {{
      "wort": "bestellen",
      "übersetzung_es": "pedir, ordenar",
      "wortart": "Verb",
      "konjugationshinweise": "regelmäßig",
      "kontext": "Was möchten Sie bestellen?"
    }}
  ],

  "übungen": [
    {{
      "typ": "Lückentext",
      "anweisung_de": "Ergänzen Sie die Modalverben.",
      "anweisung_es": "Complete con los verbos modales.",
      "schwierigkeit": "mittel"
    }}
  ],

  "zusammenfassung_es": "Esta página trata sobre... (máximo 3 oraciones)"
}}

WICHTIG:
- Finde ALLE Audio-Referenzen
- Extrahiere ALLE wichtigen Vokabeln mit korrektem Artikel
- Bei Grammatik: konkrete Beispiele aus dem Text
- Wenn die Seite wenig Inhalt hat (nur Bilder/Titel): inhaltstyp: ["bildseite"]

NUR JSON ausgeben, keine Erklärungen:"""

    return prompt


def detect_index_pages(book_folder: Path) -> List[Path]:
    """Detecta páginas de Inhaltsverzeichnis"""
    txt_dir = book_folder / "txt"
    if not txt_dir.exists():
        return []

    index_files = []

    for txt_file in sorted(txt_dir.glob("*.txt")):
        name_lower = txt_file.name.lower()

        # Método 1: Nombre contiene "inhalt" o "index"
        if "inhalt" in name_lower or "index" in name_lower:
            index_files.append(txt_file)
            continue

        # Método 2: Páginas 3-8
        page_match = re.search(r'page[-_]?(\d+)', name_lower)
        if page_match:
            page_num = int(page_match.group(1))
            if 3 <= page_num <= 8:
                content = txt_file.read_text(encoding='utf-8').lower()
                # Verificar que parece un índice
                keywords = ["lektion", "einheit", "kapitel"]
                dots = content.count(".")

                if any(kw in content for kw in keywords) and dots > 10:
                    index_files.append(txt_file)

    return index_files


def process_index_pages(book_folder: Path) -> Optional[dict]:
    """FASE 1: Procesar Inhaltsverzeichnis"""
    print(f"   🔍 Buscando Inhaltsverzeichnis...")

    index_files = detect_index_pages(book_folder)

    if not index_files:
        print(f"   ⚠️  Kein Inhaltsverzeichnis gefunden")
        return None

    print(f"   📋 {len(index_files)} Index-Dateien gefunden")

    all_structure = []

    for idx_file in index_files:
        print(f"      → {idx_file.name}...", end=" ")

        content = idx_file.read_text(encoding='utf-8')

        if len(content.strip()) < 50:
            print("⚠️")
            continue

        prompt = generate_index_prompt_german(content, book_folder.name)
        response = call_deutsch_gemma(prompt)

        try:
            # Limpiar respuesta
            response = response.strip()
            if response.startswith('```'):
                response = re.sub(r'^```json?\n', '', response)
                response = re.sub(r'\n```$', '', response)

            data = json.loads(response)

            if "buchstruktur" in data:
                all_structure.extend(data["buchstruktur"])
                print(f"✅ ({len(data['buchstruktur'])} Lektionen)")
            else:
                print("⚠️")

        except json.JSONDecodeError:
            print("❌")
            continue

    if all_structure:
        structure = {
            "buch": book_folder.name,
            "generiert": datetime.now().isoformat(),
            "buchstruktur": all_structure,
            "anzahl_einheiten": len(all_structure)
        }

        # Guardar
        output_file = book_folder / "buchstruktur.json"
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(structure, f, ensure_ascii=False, indent=2)

        print(f"   ✅ Struktur gespeichert: {len(all_structure)} Einheiten")
        return structure

    return None


def process_page_deutsch_gemma(
    txt_path: Path,
    context: dict,
    index_data: Optional[dict] = None
) -> Optional[dict]:
    """Procesa una página con deutsch-gemma3-ib"""
    try:
        content = txt_path.read_text(encoding='utf-8')

        if len(content.strip()) < 50:
            return None

        prompt = generate_page_prompt_german(content, context, index_data)
        response = call_deutsch_gemma(prompt)

        # Limpiar y parsear
        response = response.strip()
        if response.startswith('```'):
            response = re.sub(r'^```json?\n', '', response)
            response = re.sub(r'\n```$', '', response)

        result = json.loads(response)

        # ✨ DETECCIÓN ADICIONAL DE AUDIO con AudioDetector
        # Combinar lo que detectó el modelo con nuestra detección especializada
        book_name = context.get('book_name', '').lower()
        detected_audio = AudioDetector.detect_all_formats(content, book_hint=book_name)

        # Si AudioDetector encontró audios que el modelo no detectó, agregarlos
        model_audio = result.get('audio', [])
        model_tracks = set()

        # Extraer tracks que el modelo ya detectó
        for audio in model_audio:
            track = audio.get('track', '')
            cd = audio.get('cd', '')
            model_tracks.add((cd, track))

        # Agregar audios detectados por AudioDetector que no estén
        for detected in detected_audio:
            cd = detected.get('cd') or ''
            track = detected.get('track') or ''

            if (cd, track) not in model_tracks:
                # Convertir formato AudioDetector a formato esperado
                audio_entry = {
                    "anweisung": detected.get('context', 'Audio detectado'),
                    "track": track,
                    "cd": cd,
                    "typ": detected.get('type', 'Audio'),
                    "beschreibung_es": f"Audio detectado: {detected.get('format', 'auto')}",
                    "format_detected": detected.get('format'),  # Extra info
                    "full_reference": detected.get('full_reference')
                }
                model_audio.append(audio_entry)

        result['audio'] = model_audio

        # Añadir metadata
        result["metadata"] = {
            "datei": str(txt_path),
            "verarbeitet": datetime.now().isoformat(),
            "buch": context.get('book_name', ''),
            "modell": OLLAMA_MODEL,
            "audio_detector_used": len(detected_audio) > 0
        }

        return result

    except Exception as e:
        print(f" Fehler: {str(e)[:50]}")
        return None


def extract_book_context(folder_path: Path) -> dict:
    """Extrae contexto del libro"""
    path_str = str(folder_path)

    context = {
        'book_name': folder_path.name,
        'level': 'Unbekannt',
        'material_type': 'Unbekannt'
    }

    # Nivel
    levels = {
        'A1': r'A1[-_\s]',
        'A2': r'A2[-_\s]',
        'B1': r'B1[-_\s]',
        'B2': r'B2[-_\s]',
        'C1': r'C1[-_\s]',
        'C2': r'C2[-_\s]'
    }

    for level, pattern in levels.items():
        if re.search(pattern, path_str, re.IGNORECASE):
            context['level'] = level
            break

    # Tipo
    if 'Kursbuch' in path_str or 'KB' in path_str:
        context['material_type'] = 'Kursbuch'
    elif 'Arbeitsbuch' in path_str or 'AB' in path_str:
        context['material_type'] = 'Arbeitsbuch'

    return context


def process_book(book_folder: Path, skip_existing: bool = True):
    """Procesa un libro completo"""
    print(f"\n📚 {book_folder.name}")

    txt_dir = book_folder / "txt"
    if not txt_dir.exists():
        print(f"   ❌ Keine txt/ Ordner")
        return

    annotations_dir = book_folder / "annotations"
    annotations_dir.mkdir(exist_ok=True)

    context = extract_book_context(book_folder)
    print(f"   ℹ️  Niveau: {context['level']}, Typ: {context['material_type']}")

    # FASE 1: Índice
    structure_file = book_folder / "buchstruktur.json"
    index_data = None

    if structure_file.exists():
        print(f"   ✅ Struktur existiert bereits")
        with open(structure_file, 'r', encoding='utf-8') as f:
            index_data = json.load(f)
    else:
        index_data = process_index_pages(book_folder)

    # FASE 2: Páginas
    txt_files = sorted(txt_dir.glob("*.txt"))
    index_file_names = [f.name for f in detect_index_pages(book_folder)]
    regular_files = [f for f in txt_files if f.name not in index_file_names]

    print(f"   📄 {len(regular_files)} Seiten zu verarbeiten")

    processed = 0
    skipped = 0
    errors = 0

    for i, txt_file in enumerate(regular_files, 1):
        annotation_file = annotations_dir / f"{txt_file.stem}.json"

        if skip_existing and annotation_file.exists():
            skipped += 1
            if i % 10 == 0:
                print(f"   [{i}/{len(regular_files)}] ...", end="\r")
            continue

        print(f"   [{i}/{len(regular_files)}] {txt_file.name[:40]}...", end=" ")

        result = process_page_deutsch_gemma(txt_file, context, index_data)

        if result:
            with open(annotation_file, 'w', encoding='utf-8') as f:
                json.dump(result, f, ensure_ascii=False, indent=2)
            print("✅")
            processed += 1
        else:
            print("❌")
            errors += 1

    print(f"   ✅ Verarbeitet: {processed}, Übersprungen: {skipped}, Fehler: {errors}")


def process_all(skip_existing: bool = True):
    """Procesa todos los libros"""
    print(f"🔍 Suche Bücher in {BASE_DIR}\n")
    print(f"🤖 Modell: {OLLAMA_MODEL}\n")

    stats = {'books': 0, 'processed': 0}

    for root, dirs, files in os.walk(BASE_DIR):
        root_path = Path(root)

        if root_path.name == 'txt' and any(f.endswith('.txt') for f in files):
            book_folder = root_path.parent
            stats['books'] += 1

            process_book(book_folder, skip_existing)
            stats['processed'] += 1

    print("\n" + "="*70)
    print("📊 ZUSAMMENFASSUNG:")
    print(f"   Bücher gefunden: {stats['books']}")
    print(f"   Bücher verarbeitet: {stats['processed']}")
    print("="*70)


if __name__ == "__main__":
    import sys

    # Verificar modelo
    print("🔧 Überprüfe deutsch-gemma3-ib...")
    try:
        resp = requests.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=5)
        models = [m['name'] for m in resp.json().get("models", [])]

        if OLLAMA_MODEL in models:
            print(f"✅ Modell verfügbar: {OLLAMA_MODEL}\n")
        else:
            print(f"❌ Modell {OLLAMA_MODEL} nicht gefunden")
            print(f"   Installiere mit: ollama pull {OLLAMA_MODEL}")
            sys.exit(1)
    except:
        print(f"❌ Ollama nicht erreichbar")
        print(f"   Starte mit: ollama serve")
        sys.exit(1)

    if len(sys.argv) > 1:
        if sys.argv[1] == '--buch' and len(sys.argv) > 2:
            book_path = BASE_DIR / sys.argv[2]
            if book_path.exists():
                process_book(book_path)
            else:
                print(f"❌ Nicht gefunden: {book_path}")
        else:
            process_all()
    else:
        print("\n⚠️  Dies wird ALLE Bücher verarbeiten (~2300 Dateien)")
        print(f"📂 Basis: {BASE_DIR}")
        print(f"🤖 Modell: {OLLAMA_MODEL}")
        print("\nFortfahren? (j/n): ", end="")

        if input().strip().lower() in ['j', 'ja', 'y', 'yes', 's', 'si']:
            process_all()
        else:
            print("❌ Abgebrochen")
