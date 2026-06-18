#!/usr/bin/env python3
"""
Script ejecutable para procesar lecciones de alemán con IA
Requiere: pip install anthropic
"""

import os
import json
from pathlib import Path
from typing import List, Dict
import anthropic

# Configuración
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "your-api-key-here")
CONTENT_DIR = Path("/home/f/deutsch-app/backend/content")

client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)


def analyze_page(lesson_path: Path, page_num: int, text_content: str) -> dict:
    """
    Analiza una página individual con Claude
    """

    prompt = f"""Analiza esta página de una lección de alemán y extrae información estructurada.

Lección: {lesson_path.name}
Página: {page_num}

CONTENIDO:
{text_content}

Devuelve un JSON con:
- topics: Lista de temas principales
- vocabulary: Lista de {{word, article, translation, type, context}}
- grammar_points: Lista de puntos gramaticales con ejemplos
- exercises: Tipo y descripción de ejercicios
- references_audio: true si menciona audio/tracks
- audio_track: número de pista si existe
- page_type: explanation/exercise/dialog/reading/listening
- summary: Resumen breve en español

SOLO JSON, sin markdown."""

    message = client.messages.create(
        model="claude-3-5-sonnet-20241022",
        max_tokens=2000,
        messages=[
            {"role": "user", "content": prompt}
        ]
    )

    try:
        return json.loads(message.content[0].text)
    except:
        return {"error": "Failed to parse JSON", "raw": message.content[0].text}


def process_lesson(lesson_path: Path):
    """
    Procesa todas las páginas de una lección
    """

    text_dir = lesson_path / "text"
    annotations_dir = lesson_path / "annotations"
    annotations_dir.mkdir(exist_ok=True)

    if not text_dir.exists():
        print(f"❌ No text directory found: {text_dir}")
        return

    text_files = sorted(text_dir.glob("*.txt"))
    print(f"📄 Processing {len(text_files)} pages in {lesson_path.name}")

    all_results = []

    for i, txt_file in enumerate(text_files, 1):
        print(f"  [{i}/{len(text_files)}] Analyzing {txt_file.name}...", end=" ")

        content = txt_file.read_text(encoding='utf-8')

        result = analyze_page(lesson_path, i, content)
        all_results.append(result)

        # Guardar resultado individual
        output_file = annotations_dir / f"page-{i:03d}.json"
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(result, f, ensure_ascii=False, indent=2)

        print("✅")

    # Generar resumen de lección
    print(f"  📊 Generating lesson summary...")
    summary = generate_lesson_summary(lesson_path.name, all_results)

    with open(annotations_dir / "lesson-summary.json", 'w', encoding='utf-8') as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    # Consolidar vocabulario
    print(f"  📚 Consolidating vocabulary...")
    vocab = consolidate_vocabulary(all_results)

    with open(annotations_dir / "vocabulary.json", 'w', encoding='utf-8') as f:
        json.dump(vocab, f, ensure_ascii=False, indent=2)

    print(f"✅ Lesson processed: {lesson_path.name}\n")


def generate_lesson_summary(lesson_name: str, pages_data: List[dict]) -> dict:
    """
    Genera resumen completo de la lección
    """

    # Recopilar información
    all_topics = set()
    all_grammar = []
    vocab_count = 0

    for page in pages_data:
        all_topics.update(page.get('topics', []))
        all_grammar.extend(page.get('grammar_points', []))
        vocab_count += len(page.get('vocabulary', []))

    return {
        "lesson_name": lesson_name,
        "total_pages": len(pages_data),
        "main_topics": list(all_topics),
        "grammar_points_count": len(all_grammar),
        "vocabulary_count": vocab_count,
        "pages_summary": [
            {
                "page": i+1,
                "type": p.get('page_type', 'unknown'),
                "topics": p.get('topics', []),
                "summary": p.get('summary', '')
            }
            for i, p in enumerate(pages_data)
        ]
    }


def consolidate_vocabulary(pages_data: List[dict]) -> dict:
    """
    Consolida todo el vocabulario de la lección
    """

    vocab_dict = {}

    for page_num, page in enumerate(pages_data, 1):
        for word_data in page.get('vocabulary', []):
            word = word_data.get('word', '')
            if word and word not in vocab_dict:
                vocab_dict[word] = {
                    **word_data,
                    "first_appearance": page_num,
                    "occurrences": [page_num]
                }
            elif word:
                vocab_dict[word]['occurrences'].append(page_num)

    return {
        "total_words": len(vocab_dict),
        "vocabulary": list(vocab_dict.values())
    }


def scan_content_structure(base_path: Path) -> dict:
    """
    Escanea la estructura de archivos del contenido
    """

    structure = {
        "courses": [],
        "statistics": {
            "total_courses": 0,
            "total_lessons": 0,
            "total_pdfs": 0,
            "total_texts": 0,
            "total_audio": 0
        }
    }

    for course_dir in sorted(base_path.iterdir()):
        if not course_dir.is_dir():
            continue

        course_data = {
            "name": course_dir.name,
            "path": str(course_dir),
            "lessons": []
        }

        for lesson_dir in sorted(course_dir.iterdir()):
            if not lesson_dir.is_dir():
                continue

            pdf_count = len(list((lesson_dir / "pdfs").glob("*.pdf"))) if (lesson_dir / "pdfs").exists() else 0
            text_count = len(list((lesson_dir / "text").glob("*.txt"))) if (lesson_dir / "text").exists() else 0
            audio_files = list((lesson_dir / "audio").glob("*")) if (lesson_dir / "audio").exists() else []

            lesson_data = {
                "name": lesson_dir.name,
                "path": str(lesson_dir),
                "pdf_count": pdf_count,
                "text_count": text_count,
                "audio_count": len(audio_files),
                "has_annotations": (lesson_dir / "annotations").exists(),
                "completeness": f"{(text_count / pdf_count * 100) if pdf_count > 0 else 0:.0f}%"
            }

            course_data["lessons"].append(lesson_data)

            structure["statistics"]["total_lessons"] += 1
            structure["statistics"]["total_pdfs"] += pdf_count
            structure["statistics"]["total_texts"] += text_count
            structure["statistics"]["total_audio"] += len(audio_files)

        structure["statistics"]["total_courses"] += 1
        structure["courses"].append(course_data)

    return structure


if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("""
Uso:
    python process-lessons.py scan                     # Escanear estructura
    python process-lessons.py process B2/Lektion-1     # Procesar una lección
    python process-lessons.py process-all B2/          # Procesar todas las lecciones de un curso
        """)
        sys.exit(1)

    command = sys.argv[1]

    if command == "scan":
        print("🔍 Escaneando estructura de archivos...\n")
        structure = scan_content_structure(CONTENT_DIR)

        print(json.dumps(structure, indent=2, ensure_ascii=False))

        # Guardar
        with open("content-structure.json", 'w', encoding='utf-8') as f:
            json.dump(structure, f, ensure_ascii=False, indent=2)

        print(f"\n✅ Guardado en content-structure.json")

    elif command == "process" and len(sys.argv) > 2:
        lesson_path = CONTENT_DIR / sys.argv[2]
        process_lesson(lesson_path)

    elif command == "process-all" and len(sys.argv) > 2:
        course_path = CONTENT_DIR / sys.argv[2]

        for lesson_dir in sorted(course_path.iterdir()):
            if lesson_dir.is_dir():
                process_lesson(lesson_dir)

    else:
        print("❌ Comando no reconocido")
