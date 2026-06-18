#!/usr/bin/env python3
"""
Script para probar el procesamiento de UN SOLO archivo
Útil para verificar el prompt y ajustar antes de procesar todo
"""

import json
import sys
from pathlib import Path
import anthropic
import os

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "tu-api-key")

# Importar la función del script principal
from process_german_books import generate_daf_analysis_prompt, extract_book_context

client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)


def test_single_file(txt_file_path: str):
    """
    Procesa un solo archivo y muestra el resultado
    """
    txt_path = Path(txt_file_path)

    if not txt_path.exists():
        print(f"❌ Archivo no encontrado: {txt_file_path}")
        return

    print(f"📄 Archivo: {txt_path.name}")
    print(f"📂 Carpeta: {txt_path.parent}\n")

    # Leer contenido
    with open(txt_path, 'r', encoding='utf-8') as f:
        content = f.read()

    print(f"📝 Contenido: {len(content)} caracteres")
    print(f"📝 Primeras líneas:\n")
    print("─" * 60)
    print(content[:500])
    print("─" * 60)
    print()

    # Extraer contexto
    book_folder = txt_path.parent.parent  # Subir desde txt/ al libro
    context = extract_book_context(book_folder)

    print(f"🔍 Contexto detectado:")
    print(f"   Libro: {context.get('book_name', 'Unknown')}")
    print(f"   Nivel: {context.get('level', 'Unknown')}")
    print(f"   Tipo: {context.get('material_type', 'Unknown')}\n")

    # Generar prompt
    prompt = generate_daf_analysis_prompt(str(txt_path), content, context)

    print(f"📤 Enviando a Claude AI...")
    print(f"   Modelo: claude-3-5-sonnet-20241022")
    print(f"   Tokens máximos: 4000\n")

    # Llamar a Claude
    try:
        message = client.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=4000,
            temperature=0,
            messages=[{"role": "user", "content": prompt}]
        )

        response_text = message.content[0].text.strip()

        # Limpiar markdown si existe
        import re
        if response_text.startswith('```'):
            response_text = re.sub(r'^```json?\n', '', response_text)
            response_text = re.sub(r'\n```$', '', response_text)

        # Parsear JSON
        result = json.loads(response_text)

        print("✅ Respuesta recibida y parseada correctamente\n")
        print("=" * 70)
        print("RESULTADO:")
        print("=" * 70)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        print("=" * 70)

        # Guardar resultado
        output_file = txt_path.parent.parent / 'test-output.json'
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(result, f, ensure_ascii=False, indent=2)

        print(f"\n💾 Guardado en: {output_file}")

        # Resumen rápido
        print("\n📊 RESUMEN RÁPIDO:")
        print(f"   Página: {result.get('structure', {}).get('page_number', 'N/A')}")
        print(f"   Unidad: {result.get('structure', {}).get('unit', 'N/A')}")
        print(f"   Tema: {result.get('main_topic', 'N/A')}")
        print(f"   Vocabulario: {len(result.get('vocabulary', []))} palabras")
        print(f"   Gramática: {len(result.get('grammar_points', []))} puntos")
        print(f"   Audio: {len(result.get('audio_references', []))} referencias")
        print(f"   Ejercicios: {len(result.get('exercises', []))}")

        # Mostrar audio si existe
        if result.get('audio_references'):
            print(f"\n🎧 AUDIO DETECTADO:")
            for audio in result['audio_references']:
                print(f"   Track {audio.get('track_number', '?')}: {audio.get('description', '')}")

        # Mostrar primeras palabras de vocabulario
        if result.get('vocabulary'):
            print(f"\n📚 VOCABULARIO (primeras 5):")
            for vocab in result['vocabulary'][:5]:
                word = vocab.get('word', '')
                trans = vocab.get('translation_es', vocab.get('translation_en', ''))
                print(f"   {word} → {trans}")

    except json.JSONDecodeError as e:
        print(f"❌ Error al parsear JSON: {e}")
        print(f"\nRespuesta raw:")
        print("─" * 70)
        print(response_text)
        print("─" * 70)

    except Exception as e:
        print(f"❌ Error: {e}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("""
Uso:
    python test-single-file.py <ruta-al-archivo.txt>

Ejemplo:
    python test-single-file.py "/home/f/deutsch-app/de/Schritte International 1/txt/page-001.txt"

Este script:
1. Lee el archivo .txt especificado
2. Detecta el contexto (libro, nivel, tipo)
3. Genera el prompt
4. Llama a Claude AI
5. Muestra el resultado completo
6. Guarda en test-output.json

Útil para:
- Verificar que el prompt funciona correctamente
- Ver un ejemplo de salida antes de procesar todo
- Ajustar el prompt si algo no se detecta bien
        """)
        sys.exit(1)

    test_single_file(sys.argv[1])
