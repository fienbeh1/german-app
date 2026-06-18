#!/usr/bin/env python3
"""
Test específico para el modelo deutsch-gemma3-ib
Verifica capacidades del modelo RAG alemán
"""

import json
import sys
from pathlib import Path
import requests
import re
from config import OLLAMA_MODEL, OLLAMA_BASE_URL, MODEL_CONFIG


def check_model_availability():
    """Verifica que deutsch-gemma3-ib esté disponible"""
    print("🔍 Verificando modelo deutsch-gemma3-ib...\n")

    try:
        resp = requests.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=5)
        models = resp.json().get("models", [])

        available_models = [m['name'] for m in models]
        print(f"📦 Modelos disponibles en Ollama:")
        for m in available_models:
            indicator = "✅" if m == OLLAMA_MODEL else "  "
            print(f"   {indicator} {m}")

        if OLLAMA_MODEL in available_models:
            print(f"\n✅ Modelo {OLLAMA_MODEL} disponible")

            # Mostrar info del modelo
            for m in models:
                if m['name'] == OLLAMA_MODEL:
                    size_gb = m.get('size', 0) / (1024**3)
                    print(f"   Tamaño: {size_gb:.2f} GB")
                    print(f"   Familia: {m.get('details', {}).get('family', 'unknown')}")

            return True
        else:
            print(f"\n❌ Modelo {OLLAMA_MODEL} NO encontrado")
            print(f"\n💡 Para instalarlo:")
            print(f"   ollama pull {OLLAMA_MODEL}")
            return False

    except Exception as e:
        print(f"❌ Error conectando a Ollama: {e}")
        print(f"\n💡 Asegúrate que Ollama esté corriendo:")
        print(f"   ollama serve")
        return False


def call_deutsch_gemma(prompt: str, verbose: bool = False) -> str:
    """Llama al modelo deutsch-gemma3-ib"""

    url = f"{OLLAMA_BASE_URL}/api/generate"

    payload = {
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "stream": False,
        "options": MODEL_CONFIG
    }

    try:
        if verbose:
            print(f"\n📤 Enviando request a {OLLAMA_MODEL}...")
            print(f"   Configuración: temp={MODEL_CONFIG['temperature']}, "
                  f"ctx={MODEL_CONFIG['num_ctx']}")

        response = requests.post(url, json=payload, timeout=180)
        response.raise_for_status()
        result = response.json()

        if verbose:
            tokens = result.get('eval_count', 0)
            duration = result.get('total_duration', 0) / 1e9  # ns a segundos
            print(f"   ✅ Respuesta: {tokens} tokens en {duration:.1f}s")

        return result.get("response", "")

    except Exception as e:
        print(f"❌ Error: {e}")
        return ""


def test_index_detection():
    """Test 1: Detección de estructura en Inhaltsverzeichnis"""

    print("\n" + "="*70)
    print("TEST 1: Detección de Inhaltsverzeichnis")
    print("="*70)

    # Texto simulado de índice
    test_index = """
Inhaltsverzeichnis

Lektion 1  Guten Tag! .................................. 7
    Begrüßung und Vorstellung .......................... 8
    Wortschatz ........................................ 10
    Grammatik: Verbkonjugation ........................ 12

Lektion 2  Familie und Freunde ......................... 15
    Dialog ............................................ 16
    Wortschatz ........................................ 18
    Grammatik: Possessivartikel ....................... 20

Lektion 3  Wohnung und Einrichtung .................... 23
    Hören: Track 5 .................................... 24
    Wortschatz ........................................ 26
    """

    # Prompt en alemán (el modelo debería entenderlo mejor)
    prompt = f"""Du bist Experte für deutsche Lehrbücher (DaF).

INHALT (Inhaltsverzeichnis):
{test_index}

AUFGABE:
Extrahiere die Struktur des Buches. WICHTIG: Unterscheide Lektionsnummer von Seitennummer!

Ausgabe als JSON:
{{
  "lektionen": [
    {{
      "nummer": "1",
      "titel": "Guten Tag!",
      "startseite": "7",
      "themen": ["Begrüßung", "Vorstellung"]
    }}
  ]
}}

NUR JSON:"""

    response = call_deutsch_gemma(prompt, verbose=True)

    print("\n📥 RESPUESTA:")
    print("─"*70)
    print(response[:500])
    print("─"*70)

    # Intentar parsear
    try:
        response_clean = response.strip()
        if response_clean.startswith('```'):
            response_clean = re.sub(r'^```json?\n', '', response_clean)
            response_clean = re.sub(r'\n```$', '', response_clean)

        data = json.loads(response_clean)

        print("\n✅ JSON parseado correctamente")
        print(json.dumps(data, ensure_ascii=False, indent=2))

        # Verificar que distinguió número de lección vs página
        if 'lektionen' in data and len(data['lektionen']) > 0:
            lek1 = data['lektionen'][0]
            if lek1.get('nummer') == '1' and lek1.get('startseite') == '7':
                print("\n✅ CORRECTO: Distinguió Lektion 1 (número) de Seite 7 (página)")
            else:
                print("\n⚠️  Verificar: números no coinciden como esperado")

        return True

    except json.JSONDecodeError:
        print("\n❌ No se pudo parsear JSON")
        return False


def test_vocabulary_extraction():
    """Test 2: Extracción de vocabulario"""

    print("\n" + "="*70)
    print("TEST 2: Extracción de Vocabulario")
    print("="*70)

    test_content = """
Lektion 2: Im Restaurant
Seite 12

Wortschatz:
der Kellner - camarero
die Speisekarte - menú, carta
bestellen - pedir, ordenar
das Trinkgeld - propina
zahlen - pagar

Beispieldialog:
A: Guten Tag! Was möchten Sie bestellen?
B: Ich hätte gern ein Schnitzel mit Pommes.
A: Möchten Sie auch etwas trinken?
B: Ja, ein Bier bitte.
"""

    prompt = f"""Analysiere diese Buchseite und extrahiere Vokabular.

INHALT:
{test_content}

Ausgabe als JSON:
{{
  "seite": "12",
  "lektion": "2",
  "thema": "Im Restaurant",
  "vokabular": [
    {{
      "wort": "der Kellner",
      "artikel": "der",
      "übersetzung_es": "camarero",
      "typ": "Substantiv"
    }}
  ]
}}

NUR JSON:"""

    response = call_deutsch_gemma(prompt, verbose=True)

    print("\n📥 RESPUESTA:")
    print("─"*70)
    print(response[:600])
    print("─"*70)

    try:
        response_clean = response.strip()
        if response_clean.startswith('```'):
            response_clean = re.sub(r'^```json?\n', '', response_clean)
            response_clean = re.sub(r'\n```$', '', response_clean)

        data = json.loads(response_clean)

        print("\n✅ JSON parseado correctamente")

        vocab_count = len(data.get('vokabular', []))
        print(f"\n📚 Vocabulario extraído: {vocab_count} palabras")

        if vocab_count > 0:
            print("\nPrimeras 3 palabras:")
            for v in data['vokabular'][:3]:
                print(f"   • {v.get('wort', '?')} → {v.get('übersetzung_es', '?')}")

        return True

    except json.JSONDecodeError:
        print("\n❌ No se pudo parsear JSON")
        return False


def test_audio_detection():
    """Test 3: Detección de referencias de audio"""

    print("\n" + "="*70)
    print("TEST 3: Detección de Audio")
    print("="*70)

    test_content = """
Lektion 3: Wohnungssuche
Seite 18

Übung 1: Hören Sie das Gespräch (CD 1, Track 8) und kreuzen Sie an.

Dialog:
A: Guten Tag, ich suche eine Wohnung.
B: Wie groß soll die Wohnung sein?
A: Zwei Zimmer, Küche und Bad.

Übung 2: Wiederholen Sie zusammen mit dem Band (Track 9).

Aussprache: [ʃ] wie in "Schule", "schön"
"""

    prompt = f"""Analysiere diese Seite und finde ALLE Audio-Referenzen.

INHALT:
{test_content}

Suche nach:
- "Hören Sie"
- Track-Nummern
- CD-Nummern
- "Wiederholen"

Ausgabe als JSON:
{{
  "seite": "18",
  "audio": [
    {{
      "anweisung": "Hören Sie das Gespräch",
      "track": "8",
      "cd": "1",
      "typ": "Dialog"
    }}
  ]
}}

NUR JSON:"""

    response = call_deutsch_gemma(prompt, verbose=True)

    print("\n📥 RESPUESTA:")
    print("─"*70)
    print(response[:500])
    print("─"*70)

    try:
        response_clean = response.strip()
        if response_clean.startswith('```'):
            response_clean = re.sub(r'^```json?\n', '', response_clean)
            response_clean = re.sub(r'\n```$', '', response_clean)

        data = json.loads(response_clean)

        print("\n✅ JSON parseado correctamente")

        audio_count = len(data.get('audio', []))
        print(f"\n🎧 Referencias de audio: {audio_count}")

        if audio_count >= 2:
            print("✅ CORRECTO: Detectó ambos audios (Track 8 y 9)")
        elif audio_count == 1:
            print("⚠️  PARCIAL: Detectó solo 1 audio (deberían ser 2)")
        else:
            print("❌ ERROR: No detectó los audios")

        for audio in data.get('audio', []):
            print(f"   • Track {audio.get('track', '?')} - {audio.get('typ', '?')}")

        return audio_count >= 2

    except json.JSONDecodeError:
        print("\n❌ No se pudo parsear JSON")
        return False


def test_with_real_file(file_path: str):
    """Test 4: Con un archivo real del usuario"""

    print("\n" + "="*70)
    print("TEST 4: Archivo Real del Usuario")
    print("="*70)

    txt_path = Path(file_path)

    if not txt_path.exists():
        print(f"❌ Archivo no encontrado: {file_path}")
        return False

    print(f"📄 Archivo: {txt_path.name}")

    content = txt_path.read_text(encoding='utf-8')
    print(f"📝 Tamaño: {len(content)} caracteres")

    prompt = f"""Analysiere diese Buchseite eines deutschen Lehrbuchs.

INHALT:
{content[:2000]}

Extrahiere als JSON:
{{
  "seite": "Seitennummer",
  "lektion": "Lektion X",
  "thema": "Hauptthema",
  "hat_audio": true/false,
  "vokabular": [
    {{"wort": "...", "übersetzung_es": "..."}}
  ],
  "grammatik": ["..."],
  "zusammenfassung_es": "Kurze Zusammenfassung auf Spanisch"
}}

NUR JSON:"""

    response = call_deutsch_gemma(prompt, verbose=True)

    print("\n📥 RESPUESTA:")
    print("─"*70)
    print(response)
    print("─"*70)

    try:
        response_clean = response.strip()
        if response_clean.startswith('```'):
            response_clean = re.sub(r'^```json?\n', '', response_clean)
            response_clean = re.sub(r'\n```$', '', response_clean)

        data = json.loads(response_clean)

        print("\n✅ JSON parseado correctamente")
        print(json.dumps(data, ensure_ascii=False, indent=2))

        # Guardar resultado
        output = Path("test-deutsch-gemma-output.json")
        with open(output, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        print(f"\n💾 Guardado en: {output}")

        return True

    except json.JSONDecodeError:
        print("\n❌ No se pudo parsear JSON")
        print("\nRespuesta raw guardada en: test-deutsch-gemma-error.txt")
        with open("test-deutsch-gemma-error.txt", 'w', encoding='utf-8') as f:
            f.write(response)
        return False


def run_all_tests():
    """Ejecuta todos los tests"""

    print("\n🧪 TEST SUITE: deutsch-gemma3-ib")
    print("="*70)

    if not check_model_availability():
        return

    results = {
        "index": test_index_detection(),
        "vocabulary": test_vocabulary_extraction(),
        "audio": test_audio_detection()
    }

    print("\n" + "="*70)
    print("📊 RESULTADOS:")
    print("="*70)

    for test_name, passed in results.items():
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"   {test_name.ljust(15)}: {status}")

    total_pass = sum(results.values())
    total_tests = len(results)

    print(f"\n   Total: {total_pass}/{total_tests} tests passed")

    if total_pass == total_tests:
        print("\n✅ El modelo deutsch-gemma3-ib está listo para usar")
        print("\n💡 Siguiente paso:")
        print("   python test-deutsch-gemma.py <ruta-archivo-real.txt>")
    else:
        print("\n⚠️  Algunos tests fallaron")
        print("   Puede que necesites ajustar los prompts")


if __name__ == "__main__":
    if len(sys.argv) > 1:
        # Test con archivo real
        test_with_real_file(sys.argv[1])
    else:
        # Suite completa de tests
        run_all_tests()
