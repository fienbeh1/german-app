#!/usr/bin/env python3
"""
Script para procesar libros de alemán DaF con estructura existente
Recorre carpetas txt/ y genera anotaciones con IA
"""

import os
import json
import re
from pathlib import Path
from typing import Optional, Dict, List
import anthropic
from datetime import datetime

# Configuración
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "tu-api-key")
BASE_DIR = Path("/home/f/deutsch-app/de")
client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)


def generate_daf_analysis_prompt(file_path: str, text_content: str, context: dict) -> str:
    """
    Prompt especializado para libros DaF (Deutsch als Fremdsprache)

    Args:
        file_path: Ruta del archivo siendo analizado
        text_content: Contenido OCR del PDF
        context: Información del libro/carpeta (nombre, nivel, etc)
    """

    prompt = f"""Eres un experto en análisis de materiales didácticos de alemán DaF (Deutsch als Fremdsprache).

📍 CONTEXTO DEL ARCHIVO:
- Libro/Serie: {context.get('book_name', 'Unknown')}
- Nivel estimado: {context.get('level', 'Unknown')}
- Archivo: {file_path}
- Tipo de material: {context.get('material_type', 'Unknown')}

📄 CONTENIDO OCR:
{text_content}

🎯 TU TAREA:

Analiza este contenido y genera un JSON estructurado que identifique:

1. **IDENTIFICACIÓN DE ESTRUCTURA**
   - ¿Qué unidad/lección/capítulo es? (Lektion X, Einheit Y, Kapitel Z)
   - ¿Qué número de página? (busca números al inicio/final del texto)
   - ¿Es del Kursbuch o Arbeitsbuch?
   - ¿Qué sección? (Introducción, Gramática, Übungen, Hörverständnis, etc)

2. **DETECCIÓN DE AUDIO/MULTIMEDIA**
   - ¿Hay instrucciones de audio? Busca frases como:
     * "Hören Sie" / "Hör mal"
     * "CD X, Track Y" / "Track X"
     * "Gespräch" / "Dialog"
     * "Wiederholen Sie"
     * "Hörtext"
   - ¿Qué número de pista/track menciona?
   - ¿Qué tipo de audio? (Dialog, Übung, Aussprache, etc)

3. **TIPO DE CONTENIDO**
   Clasifica la página como uno o varios de:
   - "grammar_explanation" (explicación gramatical)
   - "vocabulary_list" (lista de vocabulario)
   - "exercise_fill_blanks" (Lückentext)
   - "exercise_matching" (Zuordnung)
   - "exercise_transformation" (Umformung)
   - "dialog" (diálogo/conversación)
   - "reading_comprehension" (Leseverstehen)
   - "listening_comprehension" (Hörverstehen)
   - "writing_exercise" (Schreiben)
   - "pronunciation" (Aussprache)
   - "cultural_info" (Landeskunde)

4. **TEMA PRINCIPAL**
   - ¿Cuál es el tema de esta página? (Ej: "Wohnungssuche", "Im Restaurant", "Reisen")

5. **GRAMÁTICA**
   - ¿Qué puntos gramaticales se tratan?
   - Extrae estructuras/reglas mencionadas
   - Da ejemplos concretos del texto

6. **VOCABULARIO CLAVE**
   - Extrae las 10-20 palabras/expresiones más importantes
   - Para cada una: palabra alemana, artículo (si aplica), traducción al español/inglés
   - Prioriza vocabulario nuevo o técnico

7. **EJERCICIOS**
   - ¿Cuántos ejercicios hay?
   - Tipo de cada ejercicio
   - Instrucciones en español

8. **TRADUCCIONES Y AYUDAS**
   - Traduce instrucciones complejas al español
   - Identifica expresiones idiomáticas
   - Notas culturales relevantes

📋 FORMATO DE SALIDA JSON:

{{
  "metadata": {{
    "file_path": "{file_path}",
    "processed_date": "{datetime.now().isoformat()}",
    "book_series": "{context.get('book_name', '')}",
    "estimated_level": "A1/A2/B1/B2/C1/C2"
  }},

  "structure": {{
    "unit": "Lektion X / Einheit Y / Kapitel Z",
    "page_number": "XX",
    "material_type": "Kursbuch / Arbeitsbuch / Lehrerhandbuch",
    "section_name": "Nombre de la sección"
  }},

  "audio_references": [
    {{
      "instruction": "Texto exacto de la instrucción en alemán",
      "track_number": "12",
      "cd_number": "1",
      "audio_type": "Dialog / Übung / Hörtext",
      "description": "Breve descripción en español"
    }}
  ],

  "content_classification": [
    "grammar_explanation",
    "listening_comprehension"
  ],

  "main_topic": "Tema principal en alemán",
  "main_topic_es": "Tema principal en español",

  "grammar_points": [
    {{
      "name": "Nombre del punto gramatical",
      "description": "Explicación breve",
      "examples": [
        "Ich kann Deutsch sprechen.",
        "Er muss heute arbeiten."
      ]
    }}
  ],

  "vocabulary": [
    {{
      "word": "die Wohnung",
      "article": "die",
      "plural": "die Wohnungen",
      "translation_es": "apartamento, vivienda",
      "translation_en": "apartment",
      "word_type": "Substantiv",
      "context": "Oración o frase donde aparece"
    }},
    {{
      "word": "mieten",
      "translation_es": "alquilar",
      "translation_en": "to rent",
      "word_type": "Verb",
      "conjugation_notes": "regelmäßig / unregelmäßig / trennbar",
      "context": "Ejemplo de uso"
    }}
  ],

  "exercises": [
    {{
      "number": "1",
      "type": "Lückentext",
      "instruction_de": "Ergänzen Sie die Modalverben.",
      "instruction_es": "Complete con los verbos modales.",
      "has_answer_key": true/false,
      "difficulty": "leicht / mittel / schwer"
    }}
  ],

  "translations": {{
    "instructions": [
      {{
        "german": "Hören Sie das Gespräch und beantworten Sie die Fragen.",
        "spanish": "Escuche la conversación y responda las preguntas.",
        "english": "Listen to the conversation and answer the questions."
      }}
    ],
    "idioms": [
      {{
        "expression": "Es tut mir leid",
        "literal": "Me hace dolor",
        "meaning": "Lo siento"
      }}
    ]
  }},

  "cultural_notes": [
    "Nota cultural 1 en español",
    "Nota cultural 2 en español"
  ],

  "study_tips": [
    "Consejo 1 para estudiar este contenido",
    "Consejo 2"
  ],

  "summary_es": "Resumen completo de la página en español (3-5 oraciones que expliquen qué se trata y qué se aprende)"
}}

⚠️ REGLAS IMPORTANTES:

1. **Detecta TODOS los audio references**: Busca cuidadosamente cualquier mención de:
   - Números de track/pista
   - Instrucciones de escuchar
   - Símbolos de audio (🎧, CD, etc)

2. **Vocabulario completo**: No te limites, extrae todo el vocabulario importante
   - Prioriza palabras nuevas o técnicas
   - Incluye expresiones idiomáticas
   - Separa sustantivos, verbos, adjetivos, etc.

3. **Gramática precisa**: Identifica TODAS las estructuras gramaticales
   - Nombres técnicos correctos (Perfekt, Modalverben, Wechselpräpositionen)
   - Ejemplos concretos del texto

4. **Contexto educativo**: Piensa como profesor
   - ¿Qué necesita saber el estudiante?
   - ¿Qué es lo más importante de esta página?
   - ¿Qué dificultades puede tener?

5. **OCR imperfecto**: El texto puede tener errores de OCR
   - Corrige errores obvios
   - Interpreta contexto
   - Marca si algo es confuso

6. **Página vacía o sin contenido relevante**: Si la página solo tiene imágenes, título, o muy poco texto:
   {{
     "content_classification": ["image_page", "title_page"],
     "summary_es": "Página con poco contenido textual, principalmente imágenes/título"
   }}

DEVUELVE SOLO EL JSON, SIN MARKDOWN, SIN EXPLICACIONES ADICIONALES.
"""

    return prompt


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

    # Detectar tipo de material
    if 'Kursbuch' in path_str or 'KB' in path_str:
        context['material_type'] = 'Kursbuch'
    elif 'Arbeitsbuch' in path_str or 'AB' in path_str:
        context['material_type'] = 'Arbeitsbuch'
    elif 'Lehrerhandbuch' in path_str or 'LHB' in path_str:
        context['material_type'] = 'Lehrerhandbuch'

    # Detectar serie de libro
    series = ['Schritte', 'Lagune', 'Tangram', 'Menschen', 'Studio', 'EM Neu']
    for s in series:
        if s in path_str:
            context['book_series'] = s
            break

    return context


def process_txt_file(txt_path: Path, context: dict) -> Optional[dict]:
    """
    Procesa un archivo TXT con Claude
    """
    try:
        # Leer contenido
        with open(txt_path, 'r', encoding='utf-8') as f:
            content = f.read()

        # Si está vacío o muy corto, skip
        if len(content.strip()) < 50:
            print(f"    ⚠️  Muy poco contenido, saltando...")
            return None

        # Generar prompt
        prompt = generate_daf_analysis_prompt(
            str(txt_path),
            content,
            context
        )

        # Llamar a Claude
        message = client.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=4000,
            temperature=0,
            messages=[{"role": "user", "content": prompt}]
        )

        # Parsear respuesta
        response_text = message.content[0].text.strip()

        # Remover markdown si existe
        if response_text.startswith('```'):
            response_text = re.sub(r'^```json?\n', '', response_text)
            response_text = re.sub(r'\n```$', '', response_text)

        result = json.loads(response_text)

        return result

    except Exception as e:
        print(f"    ❌ Error: {str(e)}")
        return None


def process_all_txt_folders(base_dir: Path, dry_run: bool = False):
    """
    Recorre todas las carpetas y procesa archivos txt/
    """
    stats = {
        'folders_found': 0,
        'files_processed': 0,
        'files_skipped': 0,
        'files_error': 0
    }

    print(f"🔍 Buscando carpetas 'txt/' en {base_dir}\n")

    for root, dirs, files in os.walk(base_dir):
        root_path = Path(root)

        # Solo procesar si estamos en una carpeta llamada 'txt'
        if root_path.name == 'txt':
            stats['folders_found'] += 1

            # Extraer contexto del libro
            book_folder = root_path.parent
            context = extract_book_context(book_folder)

            print(f"\n📚 {book_folder.name}")
            print(f"   📂 {root_path}")
            print(f"   ℹ️  Nivel: {context['level']}, Tipo: {context['material_type']}")

            # Crear carpeta de anotaciones
            annotations_dir = book_folder / 'annotations'
            if not dry_run:
                annotations_dir.mkdir(exist_ok=True)

            # Procesar cada archivo .txt
            txt_files = sorted([f for f in Path(root).glob('*.txt')])

            for i, txt_file in enumerate(txt_files, 1):
                print(f"   [{i}/{len(txt_files)}] {txt_file.name}...", end=" ", flush=True)

                # Verificar si ya fue procesado
                annotation_file = annotations_dir / f"{txt_file.stem}.json"

                if annotation_file.exists():
                    print("✅ (ya procesado)")
                    stats['files_skipped'] += 1
                    continue

                if dry_run:
                    print("🔍 (dry-run)")
                    stats['files_processed'] += 1
                    continue

                # Procesar con IA
                result = process_txt_file(txt_file, context)

                if result:
                    # Guardar anotación
                    with open(annotation_file, 'w', encoding='utf-8') as f:
                        json.dump(result, f, ensure_ascii=False, indent=2)

                    print("✅")
                    stats['files_processed'] += 1
                else:
                    print("❌")
                    stats['files_error'] += 1

    # Resumen final
    print("\n" + "="*60)
    print("📊 RESUMEN:")
    print(f"   Carpetas txt/ encontradas: {stats['folders_found']}")
    print(f"   Archivos procesados: {stats['files_processed']}")
    print(f"   Archivos ya existentes: {stats['files_skipped']}")
    print(f"   Errores: {stats['files_error']}")
    print("="*60)


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1:
        if sys.argv[1] == '--dry-run':
            print("🔍 MODO DRY-RUN (no se procesará nada, solo se mostrará qué haría)\n")
            process_all_txt_folders(BASE_DIR, dry_run=True)
        elif sys.argv[1] == '--help':
            print("""
Uso:
    python process-german-books.py                 # Procesar todo
    python process-german-books.py --dry-run       # Ver qué haría sin procesar
    python process-german-books.py --help          # Esta ayuda

El script:
1. Recorre /home/f/deutsch-app/de/ con os.walk()
2. Encuentra todas las carpetas llamadas 'txt/'
3. Procesa cada archivo .txt con Claude AI
4. Guarda anotaciones en carpeta 'annotations/' al lado de 'txt/'
5. Detecta: nivel, unidad, ejercicios, audio, vocabulario, gramática

Output:
- Crea: carpeta/annotations/archivo.json por cada txt
- Skip archivos ya procesados (para reanudar si se interrumpe)
""")
        else:
            print(f"❌ Argumento desconocido: {sys.argv[1]}")
            print("Usa --help para ver opciones")
    else:
        # Confirmar antes de procesar
        print("⚠️  Esto procesará TODOS los archivos .txt encontrados")
        print(f"📂 Directorio base: {BASE_DIR}")
        print("\n¿Continuar? (s/n): ", end="")

        response = input().strip().lower()

        if response in ['s', 'si', 'y', 'yes']:
            process_all_txt_folders(BASE_DIR)
        else:
            print("❌ Cancelado")
