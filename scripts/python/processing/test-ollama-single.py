#!/usr/bin/env python3
"""
Test rápido con un solo archivo usando Ollama
"""

import json
import sys
from pathlib import Path
import requests
import re
import os

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.1:8b")


def test_ollama_connection():
    """Verifica que Ollama esté funcionando"""
    try:
        resp = requests.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=5)
        models = resp.json().get("models", [])
        print(f"✅ Ollama funcionando")
        print(f"📦 Modelos disponibles:")
        for m in models:
            print(f"   - {m['name']}")
        return True
    except Exception as e:
        print(f"❌ Error conectando a Ollama: {e}")
        return False


def call_ollama_simple(prompt: str) -> str:
    """Llama a Ollama"""
    url = f"{OLLAMA_BASE_URL}/api/generate"

    payload = {
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "stream": False,
        "options": {
            "temperature": 0.1,
            "num_predict": 2000  # Limitar tokens
        }
    }

    try:
        print(f"\n📤 Enviando a Ollama ({OLLAMA_MODEL})...")
        response = requests.post(url, json=payload, timeout=180)
        response.raise_for_status()
        result = response.json()
        return result.get("response", "")
    except Exception as e:
        print(f"❌ Error: {e}")
        return ""


def test_single_file(file_path: str):
    """Prueba con un archivo"""
    txt_path = Path(file_path)

    if not txt_path.exists():
        print(f"❌ Archivo no encontrado: {file_path}")
        return

    print(f"\n📄 Archivo: {txt_path.name}")

    # Leer contenido
    content = txt_path.read_text(encoding='utf-8')
    print(f"📝 Tamaño: {len(content)} caracteres")
    print(f"\n📝 Primeras líneas:")
    print("─" * 60)
    print(content[:400])
    print("─" * 60)

    # Prompt simple para test
    prompt = f"""Du bist DaF-Experte. Analysiere diese Seite eines deutschen Lehrbuchs.

INHALT:
{content[:1500]}

AUFGABE: Extrahiere als JSON:
{{
  "page": "Seitennummer",
  "unit": "Lektion X",
  "topic_de": "Thema",
  "topic_es": "Tema en español",
  "has_audio": true/false,
  "audio_tracks": ["12", "13"],
  "vocabulary": [
    {{"word": "die Wohnung", "translation": "apartamento"}}
  ],
  "grammar": ["Modalverben", "Akkusativ"],
  "summary_es": "Resumen breve"
}}

NUR JSON ausgeben:"""

    # Llamar Ollama
    response = call_ollama_simple(prompt)

    if not response:
        print("\n❌ No se recibió respuesta")
        return

    print(f"\n📥 Respuesta recibida ({len(response)} caracteres)")

    # Intentar parsear JSON
    try:
        # Limpiar
        response_clean = response.strip()
        if response_clean.startswith('```'):
            response_clean = re.sub(r'^```json?\n', '', response_clean)
            response_clean = re.sub(r'\n```$', '', response_clean)

        data = json.loads(response_clean)

        print("\n✅ JSON parseado correctamente")
        print("\n" + "="*70)
        print("RESULTADO:")
        print("="*70)
        print(json.dumps(data, ensure_ascii=False, indent=2))
        print("="*70)

        # Resumen
        print("\n📊 RESUMEN:")
        print(f"   Página: {data.get('page', 'N/A')}")
        print(f"   Lección: {data.get('unit', 'N/A')}")
        print(f"   Tema: {data.get('topic_de', 'N/A')}")
        print(f"   Audio: {data.get('has_audio', False)}")
        if data.get('audio_tracks'):
            print(f"   Tracks: {', '.join(data['audio_tracks'])}")
        print(f"   Vocabulario: {len(data.get('vocabulary', []))} palabras")
        print(f"   Gramática: {', '.join(data.get('grammar', []))}")

        # Guardar
        output = Path("test-ollama-output.json")
        with open(output, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"\n💾 Guardado en: {output}")

    except json.JSONDecodeError as e:
        print(f"\n❌ Error parseando JSON: {e}")
        print("\nRespuesta raw:")
        print("─" * 70)
        print(response)
        print("─" * 70)


if __name__ == "__main__":
    if not test_ollama_connection():
        print("\n💡 Tip: Inicia Ollama con 'ollama serve'")
        sys.exit(1)

    if len(sys.argv) < 2:
        print("""
Uso:
    python test-ollama-single.py <archivo.txt>

Ejemplo:
    python test-ollama-single.py "/home/f/deutsch-app/de/Schritte International 1/txt/page-001.txt"

Variables de entorno:
    export OLLAMA_MODEL=llama3.1:8b
    export OLLAMA_BASE_URL=http://localhost:11434
        """)
        sys.exit(1)

    test_single_file(sys.argv[1])
