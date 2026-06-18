# 🎧 Formatos de Audio en Libros DaF

## 📋 Resumen

Cada serie de libros usa su propio formato para referenciar audios. El sistema ahora detecta automáticamente estos formatos específicos.

## 📚 Formatos por Serie

### 1. LAGUNE

**Formato:** `X|Y` donde X = CD, Y = Track

**Ejemplos reales:**
```
Gruß und Kuss von deiner Anny."

1|2

b. Hören Sie die Nachricht auf dem Anrufbeantworter.
```

**Interpretación:**
- `1|2` = CD 1, Track 2

**Características:**
- El número aparece solo, generalmente después de "Hören Sie"
- Formato muy simple: número|número
- Puede tener espacios: `1 | 2`

---

### 2. SCHRITTE INTERNATIONAL

**Formato:** `X|Y` o `X|Y-Z` donde X = CD, Y(-Z) = Track(s)

**Ejemplos reales:**
```
n noch mehr üben?
Später ..
Schließlich ...
1|25-27
AUDIO-
VIDEO-
TRAINING
```

**Interpretación:**
- `1|25-27` = CD 1, Tracks 25-27

**Características:**
- Puede indicar rango de tracks: `25-27`
- A menudo acompañado de etiquetas:
  - `AUDIO-TRAINING`
  - `VIDEO-TRAINING`
- El formato puede tener espacios: `1 | 25-27`

**Variantes:**
- Track único: `1|25`
- Rango de tracks: `1|25-27`
- Con etiqueta: `AUDIO-TRAINING 1|12`

---

### 3. TANGRAM

**Formato:** "Hören Sie..." seguido de número en línea siguiente

**Ejemplos reales:**
```
Den finde ich langweilig.
Wir suchen
Hören Sie noch einmal und vergleichen Sie.
30
Lesen Sie
```

**Interpretación:**
- Track 30 (CD no especificado)

**Características:**
- Instrucción "Hören Sie" en una línea
- Número solo en la línea siguiente
- A veces en la misma línea: "Hören Sie. 30"
- Menos estructurado que Lagune/Schritte

**Variantes:**
- Multilinea: `Hören Sie...\n30`
- Inline: `Hören Sie den Dialog. 30`

---

## 🔍 Detección Automática

### Sistema de Detección

El módulo `audio_patterns.py` incluye:

```python
from audio_patterns import AudioDetector

# Detectar todos los formatos
results = AudioDetector.detect_all_formats(text, book_hint="lagune")

# O específicos
lagune_results = AudioDetector.detect_lagune_format(text)
schritte_results = AudioDetector.detect_schritte_format(text)
tangram_results = AudioDetector.detect_tangram_format(text)
```

### Output del Detector

```python
{
    "format": "lagune",           # Formato detectado
    "cd": "1",                    # Número de CD
    "track": "2",                 # Track o rango
    "full_reference": "1|2",      # Referencia completa
    "type": "Hörübung",           # Tipo de audio
    "context": "Hören Sie..."     # Contexto donde aparece
}
```

---

## 🧪 Testing

### Test Automático

```bash
python test-audio-detection.py
```

**Output esperado:**
```
TEST 1: LAGUNE FORMAT (X|Y = CD X, Track Y)
✅ CORRECTO: Detectó CD 1, Track 2

TEST 2: SCHRITTE FORMAT (X|Y-Z = CD X, Tracks Y-Z)
✅ CORRECTO: Detectó CD 1, Tracks 25-27
✅ BONUS: Detectó tipo AUDIO/VIDEO-TRAINING

TEST 3: TANGRAM FORMAT (Hören Sie + número)
✅ CORRECTO: Detectó Track 30

TEST 4: DETECCIÓN COMBINADA
✅ CORRECTO: Detectó múltiples formatos

Total: 4/4 tests passed
```

---

## 📊 Ejemplos de Output JSON

### Lagune
```json
{
  "audio": [
    {
      "anweisung": "Hören Sie die Nachricht auf dem Anrufbeantworter",
      "track": "2",
      "cd": "1",
      "typ": "Nachricht/Dialog",
      "beschreibung_es": "Escuche el mensaje en el contestador",
      "format_detected": "lagune",
      "full_reference": "1|2"
    }
  ]
}
```

### Schritte
```json
{
  "audio": [
    {
      "anweisung": "AUDIO-TRAINING",
      "track": "25-27",
      "cd": "1",
      "typ": "Audio-Training",
      "beschreibung_es": "Audio detectado: schritte",
      "format_detected": "schritte",
      "full_reference": "1|25-27"
    }
  ]
}
```

### Tangram
```json
{
  "audio": [
    {
      "anweisung": "Hören Sie noch einmal und vergleichen Sie",
      "track": "30",
      "cd": null,
      "typ": "Hörübung",
      "beschreibung_es": "Audio detectado: tangram",
      "format_detected": "tangram",
      "full_reference": "30"
    }
  ]
}
```

---

## 🎯 Uso en el Sistema

### Procesamiento Automático

El script `process-deutsch-gemma.py` ahora:

1. **El modelo analiza** el texto y detecta audios
2. **AudioDetector verifica** con regex especializados
3. **Se combinan** ambos resultados para máxima precisión

**Ventaja:** Doble capa de detección
- Modelo: Comprensión contextual
- Regex: Patrones específicos garantizados

### Frontend - Mostrar Audios

En tu frontend React, los audios se muestran así:

```tsx
// Del JSON anotado
{audio.map((a, i) => (
  <div key={i} className="audio-reference">
    <span className="track-badge">
      {a.cd ? `CD ${a.cd} - ` : ''}Track {a.track}
    </span>
    <p className="instruction">{a.anweisung}</p>
    {a.format_detected && (
      <span className="format-tag">{a.format_detected}</span>
    )}
  </div>
))}
```

---

## 📈 Estadísticas Esperadas

Para tu colección (~2300 archivos):

| Serie | Formato | Audios Esperados |
|-------|---------|------------------|
| Lagune | `X\|Y` | ~300-400 |
| Schritte | `X\|Y-Z` | ~400-600 |
| Tangram | Hören + número | ~100-200 |
| **Total** | - | **~800-1200** |

---

## 🔧 Casos Especiales

### Múltiples audios en una página

```
Übung 1: Hören Sie. 1|5
Übung 2: Hören Sie noch einmal. 1|6
```

**Resultado:** 2 audios detectados (CD 1, Tracks 5 y 6)

### Audio con espacios

```
1 | 25-27
```

**Resultado:** Detectado correctamente (regex flexible)

### Tangram inline

```
Hören Sie den Dialog. 25
```

**Resultado:** Detectado (patrón inline también buscado)

---

## 💡 Tips para Añadir Nuevos Formatos

Si encuentras un nuevo formato de audio:

1. **Identifica el patrón:**
   - ¿Cómo se marca? (números, símbolos, texto)
   - ¿Dónde aparece? (línea propia, inline, etc)

2. **Añade método al AudioDetector:**
   ```python
   @staticmethod
   def detect_nuevo_formato(text: str) -> List[Dict]:
       pattern = r'...'  # Tu regex
       # ... implementación
   ```

3. **Actualiza `detect_all_formats()`:**
   ```python
   nuevo_results = AudioDetector.detect_nuevo_formato(text)
   all_results.extend(nuevo_results)
   ```

4. **Añade test:**
   ```python
   def test_nuevo_formato():
       # ... tu test
   ```

---

## ✅ Checklist de Verificación

Cuando proceses tus libros, verifica:

- [ ] Lagune: ¿Detecta formato `1|2`?
- [ ] Schritte: ¿Detecta formato `1|25-27`?
- [ ] Tangram: ¿Detecta "Hören Sie\n30"?
- [ ] Múltiples audios por página?
- [ ] Tipos de audio (Dialog, Training, etc)?
- [ ] Referencias CD correctas?

**Comando de verificación:**
```bash
# Procesar un libro de cada serie
python process-deutsch-gemma.py --buch "Lagune_1"
python process-deutsch-gemma.py --buch "Schritte International 1"
python process-deutsch-gemma.py --buch "Tangram_1"

# Revisar JSONs generados
cat Lagune_1/annotations/page-013.json | grep -A5 "audio"
```

---

## 🎓 Conclusión

El sistema ahora tiene **detección especializada** para los 3 formatos principales de audio en tus libros DaF:

✅ **Lagune** - `X|Y`  
✅ **Schritte** - `X|Y-Z` con etiquetas  
✅ **Tangram** - Hören + número  

Esto garantiza que **todos los audios** sean detectados correctamente y mapeados a sus páginas correspondientes. 🎧
