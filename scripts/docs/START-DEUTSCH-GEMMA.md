# 🇩🇪 Quick Start - deutsch-gemma3-ib

## 🎯 Setup Inicial

```bash
# 1. Verificar que Ollama esté corriendo
ollama serve  # En una terminal separada

# 2. Verificar que tengas el modelo
ollama list

# Deberías ver:
# deutsch-gemma3-ib:latest  ...
```

## ⚡ Test Rápido (5 minutos)

### Paso 1: Test de Detección de Audio (NUEVO)

```bash
# Test especializado para formatos de audio reales
python test-audio-detection.py
```

**Qué hace:**
- ✅ Test Lagune: formato `1|2` (CD 1, Track 2)
- ✅ Test Schritte: formato `1|25-27` (CD 1, Tracks 25-27)
- ✅ Test Tangram: "Hören Sie\n30" (Track 30)
- ✅ Test combinado: todos los formatos

**Output esperado:**
```
✅ CORRECTO: Detectó CD 1, Track 2 (Lagune)
✅ CORRECTO: Detectó CD 1, Tracks 25-27 (Schritte)
✅ CORRECTO: Detectó Track 30 (Tangram)
Total: 4/4 tests passed
```

### Paso 2: Suite de Tests del Modelo

```bash
python test-deutsch-gemma.py
```

**Qué hace:**
- ✅ Verifica que deutsch-gemma3-ib esté disponible
- ✅ Test 1: Detección de Inhaltsverzeichnis
- ✅ Test 2: Extracción de vocabulario
- ✅ Test 3: Detección de audio general

**Output esperado:**
```
🔍 Verificando modelo deutsch-gemma3-ib...

📦 Modelos disponibles en Ollama:
   ✅ deutsch-gemma3-ib:latest
      llama3.1:8b

✅ Modelo deutsch-gemma3-ib:latest disponible
   Tamaño: 5.12 GB
   Familia: gemma

TEST 1: Detección de Inhaltsverzeichnis
✅ CORRECTO: Distinguió Lektion 1 (número) de Seite 7 (página)

TEST 2: Extracción de Vocabulario
📚 Vocabulario extraído: 5 palabras

TEST 3: Detección de Audio
🎧 Referencias de audio: 2
✅ CORRECTO: Detectó ambos audios (Track 8 y 9)

📊 RESULTADOS:
   index          : ✅ PASS
   vocabulary     : ✅ PASS
   audio          : ✅ PASS

   Total: 3/3 tests passed

✅ El modelo deutsch-gemma3-ib está listo para usar
```

### Paso 2: Test con TU archivo real

```bash
python test-deutsch-gemma.py "/home/f/deutsch-app/de/Schritte International 1/txt/Schritte_International_1_Kursbuch-page-12.txt"
```

**Qué verás:**
- Contenido del archivo
- Respuesta completa del modelo
- JSON parseado
- Guardado en `test-deutsch-gemma-output.json`

## 🚀 Procesamiento Completo

### Opción 1: Un libro primero (recomendado)

```bash
# Procesar solo "Schritte International 1"
python process-deutsch-gemma.py --buch "Schritte International 1"
```

**Tiempo estimado:** 1-2 horas (dependiendo de GPU/CPU)

**Output:**
```
📚 Schritte International 1
   ℹ️  Niveau: A1, Typ: Kursbuch

   🔍 Buscando Inhaltsverzeichnis...
   📋 2 Index-Dateien gefunden
      → page-003.txt... ✅ (7 Lektionen)
      → page-004.txt... ✅ (0 Lektionen)
   ✅ Struktur gespeichert: 7 Einheiten

   📄 45 Seiten zu verarbeiten
   [1/45] page-001.txt... ✅
   [2/45] page-002.txt... ✅
   [3/45] page-005.txt... ✅
   ...
   ✅ Verarbeitet: 43, Übersprungen: 0, Fehler: 2
```

**Resultado:**
```
Schritte International 1/
├── txt/                    # Tus OCR originales
├── buchstruktur.json       # ✨ Estructura del libro
└── annotations/            # ✨ Análisis detallado
    ├── page-001.json
    ├── page-002.json
    └── ...
```

### Opción 2: Procesar TODO (~2300 archivos)

```bash
# Procesar todos los libros
python process-deutsch-gemma.py
```

**Confirmación:**
```
⚠️  Dies wird ALLE Bücher verarbeiten (~2300 Dateien)
📂 Basis: /home/f/deutsch-app/de
🤖 Modell: deutsch-gemma3-ib:latest

Fortfahren? (j/n):
```

**Tiempo estimado:**
- Con GPU: 3-5 horas
- Con CPU: 10-15 horas

**Puedes interrumpir (Ctrl+C) y reanudar** - Skip automático de archivos ya procesados ✅

## 📊 Estructura de Output

Cada página genera un JSON completo:

```json
{
  "struktur": {
    "seite": "12",
    "lektion": "Lektion 2",
    "abschnitt": "Hörverstehen"
  },

  "audio": [
    {
      "anweisung": "Hören Sie das Gespräch",
      "track": "12",
      "cd": "1",
      "typ": "Dialog",
      "beschreibung_es": "Escuche la conversación"
    }
  ],

  "thema": {
    "de": "Im Café",
    "es": "En la cafetería"
  },

  "vokabular": [
    {
      "wort": "der Kaffee",
      "artikel": "der",
      "plural": "die Kaffees",
      "übersetzung_es": "café",
      "wortart": "Substantiv"
    }
  ],

  "grammatik": [
    {
      "name": "Modalverben",
      "beispiele": ["Ich möchte...", "Können Sie..."]
    }
  ],

  "zusammenfassung_es": "Esta página presenta un diálogo en una cafetería..."
}
```

## 🎯 Características Especiales de deutsch-gemma3-ib

### ✅ Prompts en Alemán
- El modelo entiende MEJOR prompts en alemán
- Los scripts usan prompts bilingües DE/ES

### ✅ Detección Inteligente de Índices
- Busca páginas 3-8 con contenido tipo índice
- Distingue "Lektion 3" (número) de "Seite 45" (página)
- Usa estructura del índice como contexto

### ✅ Detección Exhaustiva de Audio
Busca automáticamente:
- `"Hören Sie"`, `"Hör mal"`
- `"Track 5"`, `"Track: 12"`
- `"CD 1"`, `"CD 2"`
- `"Wiederholen Sie"`
- Símbolos: 🎧

## ⚙️ Configuración

Edita `config.py` para ajustar:

```python
# Modelo
OLLAMA_MODEL = "deutsch-gemma3-ib:latest"

# Directorio base
BASE_DIR = Path("/home/f/deutsch-app/de")

# Parámetros del modelo
MODEL_CONFIG = {
    "temperature": 0.1,    # Más bajo = más determinista
    "num_ctx": 4096,       # Contexto
    "num_predict": 2500,   # Tokens de respuesta
}
```

## 🔧 Troubleshooting

### Modelo no encontrado

```bash
❌ Modell deutsch-gemma3-ib nicht gefunden
   Installiere mit: ollama pull deutsch-gemma3-ib:latest
```

**Solución:**
```bash
ollama pull deutsch-gemma3-ib:latest
```

### Ollama no responde

```bash
❌ Ollama nicht erreichbar
   Starte mit: ollama serve
```

**Solución:**
```bash
# En otra terminal
ollama serve
```

### JSON mal formado

Si algunos archivos generan JSON inválido:
- Es normal que 1-2% fallen
- El script continúa con los demás
- Puedes re-procesar manualmente los que fallaron

### Muy lento

```bash
# Ver uso de GPU
nvidia-smi

# Si no usa GPU, verificar instalación de CUDA
ollama run deutsch-gemma3-ib:latest  # Test manual
```

## 📈 Próximos Pasos

### 1. Consolidar por libro

```bash
python consolidate-annotations.py "Schritte International 1"
```

Genera: `annotations/_CONSOLIDATED.json` con:
- Vocabulario completo del libro
- Índice de audios
- Mapa de gramática

### 2. Setup RAG (búsqueda semántica)

```bash
pip install sentence-transformers chromadb
python setup-rag.py
```

### 3. Búsquedas

```bash
python search-rag.py "Modalverben Übungen"
python search-rag.py "Audio Track nivel A2"
```

## 📊 Estadísticas Esperadas

Para ~2300 archivos TXT:

| Métrica | Valor Esperado |
|---------|----------------|
| Archivos procesados | ~2200-2250 |
| Errores (JSON inválido) | ~50-100 (2-4%) |
| Vocabulario total | ~8000-12000 palabras |
| Referencias de audio | ~800-1200 |
| Puntos gramaticales | ~300-500 |

## 💡 Tips

1. **Empieza pequeño**: Procesa 1 libro primero, verifica calidad
2. **Usa GPU**: 5-10x más rápido que CPU
3. **Déjalo de noche**: Para procesar todo
4. **Revisa manualmente**: Abre algunos JSON y verifica
5. **Ajusta prompts**: Si algo no se detecta bien, edita `process-deutsch-gemma.py`

## 🎓 Ventajas de deutsch-gemma3-ib

✅ **Modelo RAG especializado** en alemán del gobierno alemán  
✅ **Mejor comprensión** del contenido DaF  
✅ **100% gratis** - modelos locales  
✅ **Sin límites** - procesa cuanto quieras  
✅ **Privacidad total** - todo local  

## 📞 Siguiente

¿Todo funcionó? Continúa con:
- **`README-SISTEMA-COMPLETO.md`** - Overview del sistema completo
- **`SETUP-OLLAMA.md`** - Guía detallada de Ollama
- **`QUICK-START.md`** - Guía general rápida
