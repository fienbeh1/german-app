#!/usr/bin/env python3
"""
Script para analizar contenido de lecciones de alemán y generar metadata con IA
"""

import os
import json
from pathlib import Path

# Configuración
CONTENT_DIR = "/home/f/deutsch-app/backend/content"
AI_MODEL = "claude-3-5-sonnet-20241022"  # o tu modelo preferido

def generate_analysis_prompt(lesson_path: Path, page_number: int, text_content: str) -> str:
    """
    Genera el prompt para que la IA analice el contenido de una página
    """

    prompt = f"""Eres un experto en enseñanza de alemán (DaF - Deutsch als Fremdsprache).

CONTEXTO:
- Lección: {lesson_path.parent.name} / {lesson_path.name}
- Página: {page_number}

CONTENIDO DE LA PÁGINA:
{text_content}

TAREA:
Analiza este contenido y devuelve un JSON con la siguiente estructura:

{{
  "page_number": {page_number},
  "topics": ["tema1", "tema2"],  // Temas principales tratados
  "grammar_points": [
    {{
      "name": "Nombre gramatical",
      "description": "Explicación breve",
      "examples": ["ejemplo1", "ejemplo2"]
    }}
  ],
  "vocabulary": [
    {{
      "word": "palabra alemana",
      "article": "der/die/das (si aplica)",
      "translation": "traducción",
      "type": "Substantiv/Verb/Adjektiv/etc",
      "context": "ejemplo de uso en la página"
    }}
  ],
  "exercises": [
    {{
      "type": "Lückentext/Dialog/Grammatik/etc",
      "description": "Qué hay que hacer",
      "has_answers": true/false
    }}
  ],
  "cultural_notes": ["nota cultural 1", "nota cultural 2"],
  "difficulty_level": "A1/A2/B1/B2/C1/C2",
  "page_type": "explanation/exercise/dialog/reading/listening/grammar_table",
  "references_audio": true/false,  // Si menciona pista de audio
  "audio_track": "número o nombre de pista si existe",
  "summary": "Resumen breve en español de qué trata esta página"
}}

IMPORTANTE:
- Identifica TODO el vocabulario nuevo importante
- Detecta TODAS las estructuras gramaticales explicadas o practicadas
- Si hay referencias a audio ("Hören Sie Track 12"), márcalo
- Clasifica el tipo de página correctamente
- El resumen debe ser conciso pero informativo (2-3 oraciones máximo)

Devuelve SOLO el JSON, sin texto adicional.
"""

    return prompt


def generate_lesson_summary_prompt(lesson_name: str, all_pages_data: list) -> str:
    """
    Genera el prompt para crear un resumen completo de la lección
    """

    pages_summary = "\n".join([
        f"Página {p['page_number']}: {p.get('summary', 'N/A')}"
        for p in all_pages_data
    ])

    prompt = f"""Eres un experto en enseñanza de alemán (DaF).

LECCIÓN: {lesson_name}

CONTENIDO DE TODAS LAS PÁGINAS:
{pages_summary}

TAREA:
Genera un resumen completo de la lección en JSON:

{{
  "lesson_name": "{lesson_name}",
  "total_pages": {len(all_pages_data)},
  "main_topics": ["tema principal 1", "tema principal 2"],
  "grammar_summary": [
    {{
      "topic": "Nombre del tema gramatical",
      "pages": [1, 2, 5],  // En qué páginas aparece
      "importance": "high/medium/low"
    }}
  ],
  "vocabulary_count": 0,  // Total de palabras nuevas
  "key_vocabulary": [
    {{
      "word": "palabra importante",
      "reason": "por qué es clave en esta lección"
    }}
  ],
  "learning_objectives": [
    "Al final de esta lección, el estudiante podrá..."
  ],
  "recommended_study_order": [
    {{
      "step": 1,
      "pages": [1, 2, 3],
      "description": "Introducción y vocabulario básico",
      "estimated_time_minutes": 30
    }}
  ],
  "exercises_distribution": {{
    "listening": 2,
    "reading": 3,
    "grammar": 5,
    "speaking": 1,
    "writing": 2
  }},
  "audio_files_needed": ["track-12.mp3", "dialog-1.mp3"],
  "difficulty_level": "A1/A2/B1/B2",
  "prerequisites": ["temas que el estudiante debe saber antes"],
  "study_tips": ["consejo 1", "consejo 2"]
}}

Devuelve SOLO el JSON.
"""

    return prompt


def generate_vocabulary_extraction_prompt(text_content: str, context: str) -> str:
    """
    Prompt específico para extracción exhaustiva de vocabulario
    """

    prompt = f"""Eres un experto lexicógrafo especializado en alemán como lengua extranjera.

CONTEXTO: {context}

TEXTO:
{text_content}

TAREA:
Extrae TODO el vocabulario alemán del texto. Incluye:
- Sustantivos (con artículo)
- Verbos (infinitivo y formas conjugadas importantes)
- Adjetivos y adverbios
- Expresiones idiomáticas
- Frases útiles

Devuelve JSON:

{{
  "nouns": [
    {{
      "word": "die Wohnung",
      "plural": "die Wohnungen",
      "translation": "apartamento",
      "example": "Ich suche eine Wohnung."
    }}
  ],
  "verbs": [
    {{
      "infinitive": "mieten",
      "translation": "alquilar",
      "conjugation_notes": "regular",
      "example": "Ich miete eine Wohnung.",
      "separable": false
    }}
  ],
  "adjectives": [
    {{
      "word": "gemütlich",
      "translation": "acogedor, cómodo",
      "example": "Die Wohnung ist sehr gemütlich."
    }}
  ],
  "expressions": [
    {{
      "phrase": "Es tut mir leid",
      "translation": "Lo siento",
      "usage": "Disculparse"
    }}
  ],
  "other": [
    {{
      "word": "außerdem",
      "type": "Adverb",
      "translation": "además",
      "example": "Außerdem ist die Wohnung sehr günstig."
    }}
  ]
}}

NO incluyas:
- Artículos sueltos (der, die, das sin sustantivo)
- Pronombres básicos (ich, du, er)
- Preposiciones comunes solas (in, an, auf)

Devuelve SOLO el JSON.
"""

    return prompt


def generate_file_structure_documentation_prompt() -> str:
    """
    Prompt para que la IA documente la estructura de archivos actual
    """

    prompt = """Eres un arquitecto de sistemas especializando en organización de contenido educativo.

TAREA:
Analiza la siguiente estructura de directorios y archivos, y genera documentación detallada.

ESTRUCTURA ACTUAL:
{file_tree}

Genera un documento JSON que describa:

{{
  "structure_analysis": {{
    "total_courses": 0,
    "total_lessons": 0,
    "total_pdfs": 0,
    "total_text_files": 0,
    "total_audio_files": 0,
    "total_video_files": 0
  }},
  "courses": [
    {{
      "name": "B2",
      "path": "B2/",
      "lessons_count": 0,
      "lessons": [
        {{
          "name": "Lektion-1",
          "path": "B2/Lektion-1/",
          "pdf_pages": 12,
          "has_text": true,
          "has_audio": true,
          "has_video": false,
          "has_annotations": false,
          "missing_files": ["audio file expected but not found"],
          "completeness": "100%"
        }}
      ]
    }}
  ],
  "naming_conventions": {{
    "pdfs": "page-XXX.pdf (zero-padded, 3 digits)",
    "text": "page-XXX.txt (matches PDF naming)",
    "audio": "lektion-X-full.mp3 or track-XX.mp3",
    "notes": "notes.txt in lesson root"
  }},
  "issues_found": [
    {{
      "type": "missing_text_file",
      "location": "B2/Lektion-1/text/page-005.txt",
      "severity": "medium",
      "suggestion": "Run OCR on page-005.pdf"
    }}
  ],
  "recommendations": [
    "Create metadata.json for each lesson",
    "Standardize audio file naming",
    "Add video/ subfolder where needed"
  ]
}}

Sé exhaustivo y preciso.
"""

    return prompt


# Ejemplo de uso del script
if __name__ == "__main__":
    print("""
EJEMPLOS DE PROMPTS GENERADOS:

1. Para analizar una página individual:
   - Lee el archivo .txt
   - Envía el contenido a la IA con el prompt de análisis
   - Guarda el resultado en annotations/page-XXX.json

2. Para generar resumen de lección completa:
   - Recopila todos los análisis de páginas
   - Genera resumen global
   - Guarda en annotations/ai-summary.json

3. Para extracción de vocabulario:
   - Procesa todos los .txt de la lección
   - Extrae y consolida vocabulario
   - Guarda en annotations/vocabulary.json

COMANDOS RECOMENDADOS:

# Analizar una lección completa
python analyze-content.py analyze-lesson B2/Lektion-1

# Generar vocabulario de todo un curso
python analyze-content.py extract-vocabulary B2/

# Documentar estructura de archivos
python analyze-content.py document-structure

# Verificar integridad (PDFs sin TXT, etc)
python analyze-content.py check-integrity
""")

    # Mostrar ejemplo de prompt
    example_text = """Lektion 1: Wohnungssuche

Dialog 1 (Track 12)
A: Guten Tag! Ich suche eine Wohnung.
B: Wie groß soll die Wohnung sein?
A: Zwei Zimmer, Küche und Bad.

Grammatik: Modalverben
können - ich kann, du kannst, er/sie/es kann
müssen - ich muss, du musst, er/sie/es muss"""

    print("\n" + "="*80)
    print("EJEMPLO DE PROMPT GENERADO:")
    print("="*80)
    print(generate_analysis_prompt(
        Path("B2/Lektion-1"),
        1,
        example_text
    ))
