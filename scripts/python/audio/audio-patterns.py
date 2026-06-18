"""
Patrones de audio específicos por serie de libros DaF
Basado en ejemplos reales del usuario
"""

import re
from typing import List, Dict, Optional


class AudioDetector:
    """Detecta referencias de audio en diferentes formatos de libros DaF"""

    @staticmethod
    def detect_lagune_format(text: str) -> List[Dict]:
        """
        Lagune usa formato: X|Y donde X=CD, Y=Track
        Ejemplo: "1|2" = CD 1, Track 2
        """
        results = []

        # Patrón: número|número (puede tener espacios alrededor)
        pattern = r'(\d+)\s*\|\s*(\d+)'
        matches = re.finditer(pattern, text)

        for match in matches:
            cd_num = match.group(1)
            track_num = match.group(2)

            # Buscar contexto (texto antes del número)
            start = max(0, match.start() - 100)
            context = text[start:match.start()].strip()

            # Determinar tipo de audio
            audio_type = "Audio"
            if "Hören Sie" in context or "hören" in context.lower():
                audio_type = "Hörübung"
            elif "Nachricht" in context:
                audio_type = "Nachricht/Dialog"

            results.append({
                "format": "lagune",
                "cd": cd_num,
                "track": track_num,
                "full_reference": f"{cd_num}|{track_num}",
                "type": audio_type,
                "context": context[-50:] if len(context) > 50 else context
            })

        return results

    @staticmethod
    def detect_schritte_format(text: str) -> List[Dict]:
        """
        Schritte usa formato: X|Y o X|Y-Z
        Ejemplos:
        - "1|25" = CD 1, Track 25
        - "1|25-27" = CD 1, Tracks 25-27
        Con etiquetas: AUDIO-TRAINING, VIDEO-TRAINING
        """
        results = []

        # Patrón: número|número o número|número-número
        pattern = r'(\d+)\s*\|\s*(\d+)(?:\s*-\s*(\d+))?'
        matches = re.finditer(pattern, text)

        for match in matches:
            cd_num = match.group(1)
            track_start = match.group(2)
            track_end = match.group(3)  # Puede ser None

            # Buscar contexto
            start = max(0, match.start() - 150)
            end = min(len(text), match.end() + 50)
            context = text[start:end].strip()

            # Determinar tipo
            audio_type = "Audio"
            if "VIDEO" in context.upper():
                audio_type = "Video-Training"
            elif "AUDIO" in context.upper():
                audio_type = "Audio-Training"
            elif "Hören" in context:
                audio_type = "Hörübung"

            # Track range o único
            if track_end:
                track_ref = f"{track_start}-{track_end}"
                full_ref = f"{cd_num}|{track_start}-{track_end}"
            else:
                track_ref = track_start
                full_ref = f"{cd_num}|{track_start}"

            results.append({
                "format": "schritte",
                "cd": cd_num,
                "track": track_ref,
                "full_reference": full_ref,
                "type": audio_type,
                "context": context[:80] if len(context) > 80 else context
            })

        return results

    @staticmethod
    def detect_tangram_format(text: str) -> List[Dict]:
        """
        Tangram: "Hören Sie" seguido de número en línea siguiente
        Ejemplo:
        "Hören Sie noch einmal und vergleichen Sie.
        30"
        = Track 30
        """
        results = []

        # Buscar "Hören" seguido de salto de línea y número
        # Patrón más flexible: Hören + hasta 100 caracteres + salto + número
        lines = text.split('\n')

        for i in range(len(lines) - 1):
            line = lines[i]

            # Si la línea contiene "Hören"
            if re.search(r'hören|Hören', line, re.IGNORECASE):
                # Mirar la siguiente línea
                next_line = lines[i + 1].strip()

                # Si la siguiente línea es solo un número (o números)
                number_match = re.match(r'^(\d+)$', next_line)
                if number_match:
                    track_num = number_match.group(1)

                    results.append({
                        "format": "tangram",
                        "cd": None,  # Tangram no suele especificar CD
                        "track": track_num,
                        "full_reference": track_num,
                        "type": "Hörübung",
                        "context": line.strip()
                    })

        # También buscar patrón en misma línea: "Hören Sie... 30"
        pattern = r'(Hören Sie[^.]*)\s+(\d+)\s*$'
        matches = re.finditer(pattern, text, re.MULTILINE | re.IGNORECASE)

        for match in matches:
            instruction = match.group(1)
            track_num = match.group(2)

            results.append({
                "format": "tangram_inline",
                "cd": None,
                "track": track_num,
                "full_reference": track_num,
                "type": "Hörübung",
                "context": instruction.strip()
            })

        return results

    @staticmethod
    def detect_all_formats(text: str, book_hint: Optional[str] = None) -> List[Dict]:
        """
        Detecta todos los formatos de audio en el texto
        book_hint puede ser "lagune", "schritte", "tangram" para priorizar
        """
        all_results = []

        # Detectar todos los formatos
        lagune_results = AudioDetector.detect_lagune_format(text)
        schritte_results = AudioDetector.detect_schritte_format(text)
        tangram_results = AudioDetector.detect_tangram_format(text)

        # Si se da hint del libro, priorizar ese formato
        if book_hint:
            book_hint_lower = book_hint.lower()

            if "lagune" in book_hint_lower:
                all_results.extend(lagune_results)
            elif "schritte" in book_hint_lower:
                all_results.extend(schritte_results)
            elif "tangram" in book_hint_lower:
                all_results.extend(tangram_results)
            else:
                # No hay hint claro, usar todos
                all_results.extend(lagune_results)
                all_results.extend(schritte_results)
                all_results.extend(tangram_results)
        else:
            # Sin hint, usar todos
            all_results.extend(lagune_results)
            all_results.extend(schritte_results)
            all_results.extend(tangram_results)

        # Eliminar duplicados (mismo track detectado por múltiples métodos)
        seen = set()
        unique_results = []

        for result in all_results:
            key = (result.get('cd'), result.get('track'))
            if key not in seen:
                seen.add(key)
                unique_results.append(result)

        return unique_results


# Ejemplos de uso y tests
if __name__ == "__main__":

    # Test Lagune
    lagune_text = """
    Gruß und Kuss von deiner Anny."

    1|2

    b. Hören Sie die Nachricht auf dem Anrufbeantworter. Was sagt Anny? Ist es Text 1, 2 oder 3?
    Nominativ
    Akkusativ
    """

    print("TEST LAGUNE:")
    print("="*70)
    results = AudioDetector.detect_lagune_format(lagune_text)
    for r in results:
        print(f"CD {r['cd']}, Track {r['track']} - {r['type']}")
        print(f"   Contexto: {r['context']}")
    print()

    # Test Schritte
    schritte_text = """
    n noch mehr üben?
    Später ..
    Schließlich ...
    1|25-27
    AUDIO-
    VIDEO-
    TRAINING
    """

    print("TEST SCHRITTE:")
    print("="*70)
    results = AudioDetector.detect_schritte_format(schritte_text)
    for r in results:
        print(f"CD {r['cd']}, Track {r['track']} - {r['type']}")
        print(f"   Referencia: {r['full_reference']}")
    print()

    # Test Tangram
    tangram_text = """
    Den finde ich langweilig.
    Wir suchen
    Hören Sie noch einmal und vergleichen Sie.
    30
    Lesen Sie
    """

    print("TEST TANGRAM:")
    print("="*70)
    results = AudioDetector.detect_tangram_format(tangram_text)
    for r in results:
        print(f"Track {r['track']} - {r['type']}")
        print(f"   Instrucción: {r['context']}")
    print()

    # Test detección combinada
    print("TEST COMBINADO:")
    print("="*70)
    all_results = AudioDetector.detect_all_formats(
        lagune_text + schritte_text + tangram_text,
        book_hint="mixed"
    )
    print(f"Total referencias detectadas: {len(all_results)}")
    for r in all_results:
        print(f"  - {r['format']}: CD {r.get('cd', 'N/A')}, Track {r['track']}")
