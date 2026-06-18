#!/usr/bin/env python3
"""
Sistema de procesamiento con Ollama (modelos locales)
Optimizado para ~2300 archivos TXT de libros DaF

FASE 1: Procesar Inhaltsverzeichnis (índices) primero
FASE 2: Procesar páginas usando estructura del índice
"""

import os
import json
import re
from pathlib import Path
from typing import Optional, Dict, List
import requests
from datetime import datetime


# Configuración Ollama
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.1:8b")  # O el modelo que tengas
BASE_DIR = Path("/home/f/deutsch-app/de")


def call_ollama(prompt: str, model: str = None) -> str:
    """
    Llama a Ollama API
    """
    if model is None:
        model = OLLAMA_MODEL

    url = f"{OLLAMA_BASE_URL}/api/generate"

    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "options": {
            "temperature": 0.1,  # Más determinista para análisis
            "top_p": 0.9
        }
    }

    try:
        response = requests.post(url, json=payload, timeout=120)
        response.raise_for_status()
        result = response.json()
        return result.get("response", "")
    except Exception as e:
        print(f"❌ Error llamando a Ollama: {e}")
        return ""


def generate_index_parsing_prompt(text_content: str, book_name: str) -> str:
    """
    Prompt especializado para extraer estructura del Inhaltsverzeichnis
    """

    prompt = f"""Du bist ein Experte für deutsche Lehrbücher (DaF).

BUCH: {book_name}

INHALT (Inhaltsverzeichnis):
{text_content}

AUFGABE:
Analysiere dieses Inhaltsverzeichnis und extrahiere die Struktur des Buches.

WICHTIG - UNTERSCHEIDE:
- Lektionsnummer (z.B. "Lektion 3", "Einheit 5")
- Seitennummer (normalerweise am Ende der Zeile, z.B. "....... 45")

FORMAT DER AUSGABE (NUR JSON):
{{
  "book_structure": [
    {{
      "unit_number": "3",
      "unit_name": "Lektion 3",
      "title": "Im Restaurant",
      "start_page": "45",
      "topics": ["Essen bestellen", "Zahlen"],
      "sections": [
        {{"name": "Wortschatz", "page": "46"}},
        {{"name": "Grammatik: Modalverben", "page": "48"}},
        {{"name": "Hören und Sprechen", "page": "50"}}
      ]
    }}
  ]
}}

REGELN:
1. Lektionsnummer ≠ Seitennummer
2. Seitennummern sind normalerweise am Zeilenende
3. Extrahiere alle Lektionen/Einheiten
4. Wenn möglich, extrahiere auch Subsektionen
5. NUR JSON ausgeben, keine Erklärungen

JSON:"""

    return prompt


def generate_page_analysis_prompt_ollama(
    text_content: str,
    context: dict,
    index_data: Optional[dict] = None
) -> str:
    """
    Prompt optimizado para modelos locales (más conciso, menos tokens)
    """

    # Contexto del índice si está disponible
    index_context = ""
    if index_data:
        index_context = f"""
BEKANNTE STRUKTUR (aus Inhaltsverzeichnis):
{json.dumps(index_data, ensure_ascii=False, indent=2)}
"""

    prompt = f"""Du bist DaF-Experte. Analysiere diese Buchseite.

BUCH: {context.get('book_name', 'Unknown')}
NIVEAU: {context.get('level', 'Unknown')}
TYP: {context.get('material_type', 'Unknown')}

{index_context}

INHALT:
{text_content[:2000]}

AUFGABE - Extrahiere als JSON:

{{
  "structure": {{
    "page": "Seitennummer",
    "unit": "Lektion/Einheit Nummer",
    "section": "Abschnitt"
  }},

  "audio": [
    {{
      "instruction": "Hören Sie...",
      "track": "12",
      "cd": "1",
      "type": "Dialog/Übung"
    }}
  ],

  "content_type": ["dialog", "grammar", "exercise", "vocabulary"],

  "topic": {{
    "de": "Thema auf Deutsch",
    "es": "Tema en español"
  }},

  "grammar": [
    {{
      "name": "Modalverben",
      "examples": ["Ich kann...", "Er muss..."]
    }}
  ],

  "vocabulary": [
    {{
      "word": "die Wohnung",
      "article": "die",
      "translation_es": "apartamento",
      "type": "Substantiv"
    }}
  ],

  "exercises": [
    {{
      "type": "Lückentext",
      "instruction_de": "...",
      "instruction_es": "..."
    }}
  ],

  "summary_es": "Resumen breve en español (máx 2 oraciones)"
}}

WICHTIG:
- Audio: Suche nach "Hören", "Track", "CD", "Wiederholen"
- Vokabular: Mit Artikel, Plural, Übersetzung
- Grammatik: Struktur + Beispiele
- Kurz und präzise

NUR JSON:"""

    return prompt


def detect_index_pages(book_folder: Path) -> List[Path]:
    """
    Detecta páginas de Inhaltsverzeichnis (normalmente páginas 3-8)
    """
    txt_dir = book_folder / "txt"
    if not txt_dir.exists():
        return []

    index_files = []

    for txt_file in sorted(txt_dir.glob("*.txt")):
        # Buscar patrones de índice en el nombre
        name_lower = txt_file.name.lower()

        # Método 1: Nombre contiene "inhalt"
        if "inhalt" in name_lower or "index" in name_lower:
            index_files.append(txt_file)
            continue

        # Método 2: Páginas 3-8 probablemente
        page_match = re.search(r'page[-_]?(\d+)', name_lower)
        if page_match:
            page_num = int(page_match.group(1))
            if 3 <= page_num <= 8:
                # Verificar contenido para confirmar
                content = txt_file.read_text(encoding='utf-8').lower()
                if "lektion" in content or "einheit" in content or "kapitel" in content:
                    if content.count(".") > 10:  # Probablemente puntos guía "....."
                        index_files.append(txt_file)

    return index_files


def process_index_pages(book_folder: Path) -> Optional[dict]:
    """
    FASE 1: Procesar Inhaltsverzeichnis para obtener estructura
    """
    print(f"   🔍 Buscando Inhaltsverzeichnis...")

    index_files = detect_index_pages(book_folder)

    if not index_files:
        print(f"   ⚠️  No se encontró Inhaltsverzeichnis")
        return None

    print(f"   📋 Encontrados {len(index_files)} archivos de índice")

    all_structure = []

    for idx_file in index_files:
        print(f"      → Procesando {idx_file.name}...", end=" ")

        content = idx_file.read_text(encoding='utf-8')

        if len(content.strip()) < 50:
            print("⚠️  (muy corto)")
            continue

        prompt = generate_index_parsing_prompt(content, book_folder.name)
        response = call_ollama(prompt)

        try:
            # Limpiar respuesta
            response = response.strip()
            if response.startswith('```'):
                response = re.sub(r'^```json?\n', '', response)
                response = re.sub(r'\n```$', '', response)

            data = json.loads(response)

            if "book_structure" in data:
                all_structure.extend(data["book_structure"])
                print(f"✅ ({len(data['book_structure'])} lecciones)")
            else:
                print("⚠️  (formato incorrecto)")

        except json.JSONDecodeError:
            print("❌ (error JSON)")
            continue

    if all_structure:
        structure = {
            "book_name": book_folder.name,
            "generated": datetime.now().isoformat(),
            "units": all_structure,
            "total_units": len(all_structure)
        }

        # Guardar estructura
        output_file = book_folder / "book-structure.json"
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(structure, f, ensure_ascii=False, indent=2)

        print(f"   ✅ Estructura guardada: {len(all_structure)} unidades")
        return structure

    return None


def process_txt_file_ollama(
    txt_path: Path,
    context: dict,
    index_data: Optional[dict] = None
) -> Optional[dict]:
    """
    Procesa un archivo TXT con Ollama
    """
    try:
        content = txt_path.read_text(encoding='utf-8')

        if len(content.strip()) < 50:
            return None

        # Generar prompt
        prompt = generate_page_analysis_prompt_ollama(content, context, index_data)

        # Llamar a Ollama
        response = call_ollama(prompt)

        # Limpiar y parsear
        response = response.strip()
        if response.startswith('```'):
            response = re.sub(r'^```json?\n', '', response)
            response = re.sub(r'\n```$', '', response)

        result = json.loads(response)

        # Añadir metadata
        result["metadata"] = {
            "file_path": str(txt_path),
            "processed_date": datetime.now().isoformat(),
            "book": context.get('book_name', ''),
            "model": OLLAMA_MODEL
        }

        return result

    except Exception as e:
        print(f" Error: {str(e)[:50]}")
        return None


def extract_book_context(folder_path: Path) -> dict:
    """
    Extrae contexto del libro basándose en el nombre de la carpeta
    """
    path_str = str(folder_path)

    context = {
        'book_name': folder_path.name,
        'level': 'Unknown',
        'material_type': 'Unknown'
    }

    # Detectar nivel
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

    # Detectar tipo
    if 'Kursbuch' in path_str or 'KB' in path_str:
        context['material_type'] = 'Kursbuch'
    elif 'Arbeitsbuch' in path_str or 'AB' in path_str:
        context['material_type'] = 'Arbeitsbuch'
    elif 'Lehrerhandbuch' in path_str:
        context['material_type'] = 'Lehrerhandbuch'

    return context


def process_book_complete(book_folder: Path, skip_existing: bool = True):
    """
    Procesa un libro completo:
    1. Primero el Inhaltsverzeichnis
    2. Luego las páginas normales
    """
    print(f"\n📚 {book_folder.name}")

    txt_dir = book_folder / "txt"
    if not txt_dir.exists():
        print(f"   ❌ No hay carpeta txt/")
        return

    annotations_dir = book_folder / "annotations"
    annotations_dir.mkdir(exist_ok=True)

    # Contexto
    context = extract_book_context(book_folder)
    print(f"   ℹ️  Nivel: {context['level']}, Tipo: {context['material_type']}")

    # FASE 1: Procesar índice
    structure_file = book_folder / "book-structure.json"
    index_data = None

    if structure_file.exists():
        print(f"   ✅ Estructura ya existe")
        with open(structure_file, 'r', encoding='utf-8') as f:
            index_data = json.load(f)
    else:
        index_data = process_index_pages(book_folder)

    # FASE 2: Procesar páginas
    txt_files = sorted(txt_dir.glob("*.txt"))
    index_file_names = [f.name for f in detect_index_pages(book_folder)]

    # Filtrar archivos de índice
    regular_files = [f for f in txt_files if f.name not in index_file_names]

    print(f"   📄 {len(regular_files)} páginas para procesar")

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

        result = process_txt_file_ollama(txt_file, context, index_data)

        if result:
            with open(annotation_file, 'w', encoding='utf-8') as f:
                json.dump(result, f, ensure_ascii=False, indent=2)
            print("✅")
            processed += 1
        else:
            print("❌")
            errors += 1

    print(f"   ✅ Procesados: {processed}, Omitidos: {skipped}, Errores: {errors}")


def process_all_books(base_dir: Path, skip_existing: bool = True):
    """
    Procesa todos los libros encontrados
    """
    stats = {
        'books_found': 0,
        'books_processed': 0,
        'total_pages': 0
    }

    print(f"🔍 Buscando libros en {base_dir}\n")

    for root, dirs, files in os.walk(base_dir):
        root_path = Path(root)

        if root_path.name == 'txt' and any(f.endswith('.txt') for f in files):
            book_folder = root_path.parent
            stats['books_found'] += 1

            process_book_complete(book_folder, skip_existing)
            stats['books_processed'] += 1

    print("\n" + "="*70)
    print("📊 RESUMEN FINAL:")
    print(f"   Libros encontrados: {stats['books_found']}")
    print(f"   Libros procesados: {stats['books_processed']}")
    print("="*70)


if __name__ == "__main__":
    import sys

    # Verificar Ollama
    print("🔧 Verificando Ollama...")
    try:
        resp = requests.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=5)
        models = resp.json().get("models", [])
        print(f"✅ Ollama disponible, modelos: {[m['name'] for m in models]}")

        if OLLAMA_MODEL not in [m['name'] for m in models]:
            print(f"⚠️  Modelo {OLLAMA_MODEL} no encontrado")
            print(f"   Modelos disponibles: {[m['name'] for m in models]}")
            if models:
                print(f"   Usando: {models[0]['name']}")
                OLLAMA_MODEL = models[0]['name']

    except Exception as e:
        print(f"❌ Error conectando a Ollama: {e}")
        print(f"   Asegúrate que Ollama esté corriendo: ollama serve")
        sys.exit(1)

    if len(sys.argv) > 1:
        if sys.argv[1] == '--help':
            print("""
Uso:
    python process-with-ollama.py                    # Procesar todo
    python process-with-ollama.py --book "Nombre"    # Solo un libro

Variables de entorno:
    OLLAMA_BASE_URL=http://localhost:11434           # URL de Ollama
    OLLAMA_MODEL=llama3.1:8b                          # Modelo a usar
            """)
        elif sys.argv[1] == '--book' and len(sys.argv) > 2:
            book_name = sys.argv[2]
            book_path = BASE_DIR / book_name
            if book_path.exists():
                process_book_complete(book_path)
            else:
                print(f"❌ No se encuentra: {book_path}")
        else:
            process_all_books(BASE_DIR)
    else:
        print("\n⚠️  Esto procesará TODOS los libros (~2300 archivos)")
        print(f"📂 Base: {BASE_DIR}")
        print(f"🤖 Modelo: {OLLAMA_MODEL}")
        print("\n¿Continuar? (s/n): ", end="")

        if input().strip().lower() in ['s', 'si', 'y', 'yes']:
            process_all_books(BASE_DIR)
        else:
            print("❌ Cancelado")
