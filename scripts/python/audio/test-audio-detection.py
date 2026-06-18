#!/usr/bin/env python3
"""
Test de detección de audio con ejemplos reales del usuario
"""

from audio_patterns import AudioDetector

# Ejemplos reales proporcionados por el usuario

# LAGUNE
lagune_example = """
Gruß und Kuss von deiner Anny."

1|2

b. Hören Sie die Nachricht auf dem Anrufbeantworter. Was sagt Anny? Ist es Text 1, 2 oder 3?
Nominativ
Akkusativ
"""

# SCHRITTE
schritte_example = """
n noch mehr üben?
Später ..
Schließlich ...
1|25-27
AUDIO-
VIDEO-
TRAINING
"""

# TANGRAM
tangram_example = """
Den finde ich langweilig.
Wir suchen
Hören Sie noch einmal und vergleichen Sie.
30
Lesen Sie
"""


def test_lagune():
    print("="*70)
    print("TEST 1: LAGUNE FORMAT (X|Y = CD X, Track Y)")
    print("="*70)

    results = AudioDetector.detect_lagune_format(lagune_example)

    print(f"Texto de prueba:")
    print(lagune_example)
    print(f"\nResultados: {len(results)} audio(s) detectado(s)")

    for i, r in enumerate(results, 1):
        print(f"\n{i}. CD {r['cd']}, Track {r['track']}")
        print(f"   Referencia completa: {r['full_reference']}")
        print(f"   Tipo: {r['type']}")
        print(f"   Contexto: ...{r['context']}")

    # Verificación
    if len(results) == 1 and results[0]['cd'] == '1' and results[0]['track'] == '2':
        print("\n✅ CORRECTO: Detectó CD 1, Track 2")
        return True
    else:
        print("\n❌ ERROR: No detectó correctamente")
        return False


def test_schritte():
    print("\n" + "="*70)
    print("TEST 2: SCHRITTE FORMAT (X|Y-Z = CD X, Tracks Y-Z)")
    print("="*70)

    results = AudioDetector.detect_schritte_format(schritte_example)

    print(f"Texto de prueba:")
    print(schritte_example)
    print(f"\nResultados: {len(results)} audio(s) detectado(s)")

    for i, r in enumerate(results, 1):
        print(f"\n{i}. CD {r['cd']}, Track(s) {r['track']}")
        print(f"   Referencia completa: {r['full_reference']}")
        print(f"   Tipo: {r['type']}")

    # Verificación
    if len(results) == 1 and results[0]['cd'] == '1' and results[0]['track'] == '25-27':
        print("\n✅ CORRECTO: Detectó CD 1, Tracks 25-27")
        if "AUDIO" in results[0]['type'].upper() or "VIDEO" in results[0]['type'].upper():
            print("✅ BONUS: Detectó tipo AUDIO/VIDEO-TRAINING")
        return True
    else:
        print("\n❌ ERROR: No detectó correctamente")
        return False


def test_tangram():
    print("\n" + "="*70)
    print("TEST 3: TANGRAM FORMAT (Hören Sie + número en línea siguiente)")
    print("="*70)

    results = AudioDetector.detect_tangram_format(tangram_example)

    print(f"Texto de prueba:")
    print(tangram_example)
    print(f"\nResultados: {len(results)} audio(s) detectado(s)")

    for i, r in enumerate(results, 1):
        print(f"\n{i}. Track {r['track']}")
        print(f"   Tipo: {r['type']}")
        print(f"   Instrucción: {r['context']}")

    # Verificación
    if len(results) >= 1:
        found_30 = any(r['track'] == '30' for r in results)
        if found_30:
            print("\n✅ CORRECTO: Detectó Track 30")
            return True
        else:
            print("\n⚠️  PARCIAL: Detectó audio pero no el correcto")
            return False
    else:
        print("\n❌ ERROR: No detectó ningún audio")
        return False


def test_combined():
    print("\n" + "="*70)
    print("TEST 4: DETECCIÓN COMBINADA (todos los formatos)")
    print("="*70)

    # Texto combinado
    combined_text = lagune_example + "\n\n" + schritte_example + "\n\n" + tangram_example

    # Test con hint de Lagune
    print("\nTest con hint='lagune':")
    lagune_results = AudioDetector.detect_all_formats(combined_text, book_hint="lagune")
    print(f"   Detectados: {len(lagune_results)} audios")
    for r in lagune_results[:3]:  # Mostrar primeros 3
        print(f"   - {r['format']}: CD {r.get('cd', 'N/A')}, Track {r['track']}")

    # Test con hint de Schritte
    print("\nTest con hint='schritte':")
    schritte_results = AudioDetector.detect_all_formats(combined_text, book_hint="schritte")
    print(f"   Detectados: {len(schritte_results)} audios")
    for r in schritte_results[:3]:
        print(f"   - {r['format']}: CD {r.get('cd', 'N/A')}, Track {r['track']}")

    # Test sin hint (detecta todo)
    print("\nTest sin hint (detecta todos los formatos):")
    all_results = AudioDetector.detect_all_formats(combined_text)
    print(f"   Detectados: {len(all_results)} audios")
    for r in all_results:
        print(f"   - {r['format']}: CD {r.get('cd', 'N/A')}, Track {r['track']}")

    if len(all_results) >= 3:
        print("\n✅ CORRECTO: Detectó múltiples formatos")
        return True
    else:
        print("\n⚠️  Detectó menos audios de lo esperado")
        return False


def test_edge_cases():
    print("\n" + "="*70)
    print("TEST 5: CASOS ESPECIALES")
    print("="*70)

    # Caso 1: Múltiples audios Lagune
    multi_lagune = """
    Übung 1: Hören Sie. 1|5
    Übung 2: Hören Sie noch einmal. 1|6
    Übung 3: Dialog. 2|3
    """

    results = AudioDetector.detect_lagune_format(multi_lagune)
    print(f"\nCaso 1: Múltiples audios Lagune")
    print(f"   Detectados: {len(results)} (esperado: 3)")
    if len(results) == 3:
        print("   ✅ CORRECTO")
    else:
        print("   ❌ ERROR")

    # Caso 2: Schritte con espacio
    spaced_schritte = "Hören Sie CD 1, Track 15-18. 1 | 15-18"
    results = AudioDetector.detect_schritte_format(spaced_schritte)
    print(f"\nCaso 2: Schritte con espacios '1 | 15-18'")
    print(f"   Detectados: {len(results)} (esperado: 1)")
    if len(results) == 1 and results[0]['track'] == '15-18':
        print("   ✅ CORRECTO")
    else:
        print("   ❌ ERROR")

    # Caso 3: Tangram inline (en misma línea)
    inline_tangram = "Hören Sie den Dialog. 25"
    results = AudioDetector.detect_tangram_format(inline_tangram)
    print(f"\nCaso 3: Tangram inline 'Hören Sie den Dialog. 25'")
    print(f"   Detectados: {len(results)} (esperado: 1)")
    if len(results) >= 1:
        print("   ✅ CORRECTO")
    else:
        print("   ❌ ERROR")


def main():
    print("\n🎧 TEST DE DETECCIÓN DE AUDIO - FORMATOS REALES")
    print("="*70)
    print("\nBasado en ejemplos reales de:")
    print("  - Lagune: formato X|Y")
    print("  - Schritte: formato X|Y-Z con etiquetas")
    print("  - Tangram: Hören + número en línea siguiente")
    print()

    results = {
        "lagune": test_lagune(),
        "schritte": test_schritte(),
        "tangram": test_tangram(),
        "combined": test_combined()
    }

    test_edge_cases()

    # Resumen
    print("\n" + "="*70)
    print("📊 RESUMEN DE RESULTADOS:")
    print("="*70)

    for test_name, passed in results.items():
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"   {test_name.ljust(15)}: {status}")

    total_pass = sum(results.values())
    total_tests = len(results)

    print(f"\n   Total: {total_pass}/{total_tests} tests passed")

    if total_pass == total_tests:
        print("\n✅ Todos los tests pasaron!")
        print("\n💡 El detector está listo para usar con:")
        print("   python process-deutsch-gemma.py")
    else:
        print("\n⚠️  Algunos tests fallaron")
        print("   Revisa el código en audio-patterns.py")

    return total_pass == total_tests


if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
