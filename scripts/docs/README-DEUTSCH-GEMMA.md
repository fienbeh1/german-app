# 🇩🇪 Sistema Completo con deutsch-gemma3-ib

## 📦 Archivos del Sistema

### ⭐ EMPEZAR AQUÍ

1. **`START-DEUTSCH-GEMMA.md`** ← LEE ESTO PRIMERO
   - Quick start en 5 minutos
   - Test con tu modelo
   - Procesamiento paso a paso

### 🤖 Scripts Principales (deutsch-gemma3-ib)

2. **`test-deutsch-gemma.py`** - Test suite completo
   ```bash
   # Suite automática de tests
   python test-deutsch-gemma.py

   # Test con tu archivo
   python test-deutsch-gemma.py "/ruta/archivo.txt"
   ```

3. **`process-deutsch-gemma.py`** - Procesamiento principal
   ```bash
   # Un libro
   python process-deutsch-gemma.py --buch "Schritte International 1"

   # Todos los libros
   python process-deutsch-gemma.py
   ```

4. **`config.py`** - Configuración central
   - Modelo: `deutsch-gemma3-ib:latest`
   - Parámetros optimizados
   - Rutas base

### 📊 Sistema RAG

5. **`setup-rag.py`** - Indexación para búsqueda
6. **`search-rag.py`** - Búsqueda semántica
7. **`consolidate-annotations.py`** - Resúmenes por libro

### 🎨 Frontend React

8. **`src/app/App.tsx`** - Aplicación completa
   - Sidebar compacta
   - Visor PDF + Editor notas
   - Panel IA con vocabulario, audio
   - Navegación entre páginas

### 📚 Documentación

9. **`README-SISTEMA-COMPLETO.md`** - Overview completo
10. **`SETUP-OLLAMA.md`** - Guía detallada Ollama
11. **`QUICK-START.md`** - Guía general
12. **`README-PROCESAMIENTO.md`** - Guía original (Claude API)

### 📋 Templates

13. **`example-annotation-output.json`** - Ejemplo de output
14. **`metadata-template.json`** - Template metadata

### 🔧 Scripts Adicionales (Ollama genérico)

15. **`process-with-ollama.py`** - Versión genérica (llama, mistral, etc)
16. **`test-ollama-single.py`** - Test genérico

## 🎯 Flujo de Trabajo Recomendado

### Día 1: Setup y Test

```bash
# 1. Verificar Ollama
ollama serve
ollama list  # Debe mostrar deutsch-gemma3-ib:latest

# 2. Test suite automático
python test-deutsch-gemma.py

# Esperado: 3/3 tests PASS
```

### Día 2: Procesar 1 Libro de Prueba

```bash
# Procesar un libro completo
python process-deutsch-gemma.py --buch "Schritte International 1"

# Tiempo: 1-2 horas
# Verifica: Schritte International 1/annotations/
```

### Día 3: Verificar Calidad

```bash
# Abre algunos JSON generados
cat "Schritte International 1/annotations/page-012.json"

# Verifica:
# ✅ Detecta vocabulario correctamente?
# ✅ Identifica audios (Track, CD)?
# ✅ Extrae gramática?
# ✅ Distingue lección de página?
```

### Día 4-5: Procesar Todo

```bash
# Si la calidad es buena, procesar todo
python process-deutsch-gemma.py

# Déjalo correr de noche (10-15 horas en CPU, 3-5h en GPU)
# Puedes interrumpir y reanudar
```

### Día 6: Setup RAG

```bash
pip install sentence-transformers chromadb
python setup-rag.py

# Tiempo: 30-60 minutos
```

### Día 7: Probar Búsquedas

```bash
python search-rag.py "ejercicios Modalverben"
python search-rag.py "audio nivel A1"
```

## 📊 Comparación de Scripts

| Script | Modelo | Idioma Prompts | Uso |
|--------|--------|----------------|-----|
| `process-deutsch-gemma.py` | deutsch-gemma3-ib | Alemán/ES | **RECOMENDADO** para tu modelo |
| `process-with-ollama.py` | Configurable | Español | Genérico (llama, mistral) |
| `process-german-books.py` | Claude API | Español | Versión original (paga) |

## 🎯 Características de deutsch-gemma3-ib

### ✅ Optimizaciones Específicas

1. **Prompts en Alemán**
   - El RAG alemán entiende mejor alemán
   - Respuestas más precisas

2. **Detección de Índices**
   - Páginas 3-8 automáticamente
   - Distingue lección vs página
   - Usa estructura como contexto

3. **Audio Detection**
   - `Hören Sie`, `Wiederholen Sie`
   - Track numbers
   - CD numbers
   - Símbolos 🎧

4. **Vocabulario Completo**
   - Con artículo (der/die/das)
   - Plural
   - Traducción ES
   - Contexto de uso

5. **Gramática Estructurada**
   - Nombre técnico
   - Ejemplos del texto
   - Descripción

## 📁 Estructura de Output

```
/home/f/deutsch-app/de/
├── Schritte International 1/
│   ├── txt/                    # Tus OCR
│   ├── pdf/                    # Tus PDFs
│   ├── ai/                     # Tus análisis previos
│   │
│   ├── buchstruktur.json       # ✨ NUEVO
│   │   {
│   │     "buchstruktur": [
│   │       {
│   │         "nummer": "1",
│   │         "titel": "Guten Tag",
│   │         "startseite": "12"
│   │       }
│   │     ]
│   │   }
│   │
│   └── annotations/            # ✨ NUEVO
│       ├── page-001.json
│       ├── page-002.json
│       ├── ...
│       └── _CONSOLIDATED.json
│
├── B2/
│   ├── EM_Neu_AB/
│   │   └── EM_Neu_AB_B2/
│   │       ├── txt/
│   │       ├── buchstruktur.json    # ✨ NUEVO
│   │       └── annotations/         # ✨ NUEVO
│   └── ...
│
└── Lagune_1/
    └── ...
```

## ⚙️ Configuración Avanzada

### Ajustar Parámetros del Modelo

Edita `config.py`:

```python
MODEL_CONFIG = {
    "temperature": 0.1,      # 0.0-1.0, menor = más determinista
    "top_p": 0.9,            # Nucleus sampling
    "top_k": 40,             # Top-k sampling
    "num_ctx": 4096,         # Contexto (tokens)
    "num_predict": 2500,     # Respuesta máxima (tokens)
}
```

**Para mejorar velocidad (menos preciso):**
```python
MODEL_CONFIG = {
    "temperature": 0.2,
    "num_ctx": 2048,         # Menos contexto
    "num_predict": 1500,     # Respuesta más corta
}
```

**Para mejorar precisión (más lento):**
```python
MODEL_CONFIG = {
    "temperature": 0.05,     # Más determinista
    "num_ctx": 8192,         # Más contexto
    "num_predict": 3000,     # Respuesta más larga
}
```

### Procesamiento Paralelo (múltiples GPUs)

Si tienes 2+ GPUs:

```bash
# Terminal 1 (GPU 0)
CUDA_VISIBLE_DEVICES=0 python process-deutsch-gemma.py --buch "Libro1"

# Terminal 2 (GPU 1)
CUDA_VISIBLE_DEVICES=1 python process-deutsch-gemma.py --buch "Libro2"
```

### Logging Verbose

```bash
export VERBOSE=true
python process-deutsch-gemma.py --buch "Test"
```

## 🐛 Troubleshooting

### 1. Tests fallan

**Síntoma:**
```
❌ FAIL: index detection
```

**Causa:** El modelo no está parseando bien el índice

**Solución:**
```bash
# Ver respuesta raw
python test-deutsch-gemma.py > test-output.txt

# Revisar manualmente la respuesta
# Ajustar prompt en process-deutsch-gemma.py si es necesario
```

### 2. Muchos errores JSON

**Síntoma:**
```
[45/100] page-045.txt... ❌
[46/100] page-046.txt... ❌
```

**Causa:** El modelo genera texto extra antes/después del JSON

**Solución:**
```python
# Ya implementado en el script - limpieza automática
# Si persiste, reducir num_predict en config.py
MODEL_CONFIG["num_predict"] = 1500
```

### 3. No detecta audios

**Síntoma:** `audio: []` en JSON

**Causa:** El texto OCR tiene errores o formato diferente

**Solución:**
```bash
# Ver contenido del TXT
cat "ruta/al/archivo.txt"

# Buscar manualmente "Track", "Hören", etc
# Ajustar prompt si formato es diferente
```

### 4. GPU no se usa

**Síntoma:** Muy lento, `nvidia-smi` muestra 0% uso

**Solución:**
```bash
# Reiniciar Ollama
pkill ollama
CUDA_VISIBLE_DEVICES=0 ollama serve

# Verificar
nvidia-smi
```

## 📈 Monitoreo de Progreso

### Ver archivos procesados

```bash
# Cuántos JSON generados
find /home/f/deutsch-app/de -name "*.json" -path "*/annotations/*" | wc -l

# Libros con annotations
find /home/f/deutsch-app/de -type d -name "annotations"
```

### Ver estadísticas

```bash
# Vocabulario total extraído
python << EOF
import json
from pathlib import Path

vocab_count = 0
for f in Path("/home/f/deutsch-app/de").rglob("annotations/*.json"):
    if f.name.startswith("_"):
        continue
    data = json.load(open(f))
    vocab_count += len(data.get("vokabular", []))

print(f"Vocabulario total: {vocab_count} palabras")
EOF
```

## 💡 Tips de Optimización

1. **Procesa en orden de prioridad**: Empieza con los libros más usados
2. **Verifica calidad temprano**: No proceses todo si los primeros fallan
3. **Usa GPU**: Vale la pena si tienes una
4. **Déjalo de noche**: Para procesamiento masivo
5. **Backups**: Haz backup de `annotations/` periódicamente

## 🎓 Valor del Sistema

Con deutsch-gemma3-ib procesando tus ~2300 archivos, obtienes:

✅ **~8,000-12,000 palabras** de vocabulario con traducciones  
✅ **~800-1,200 referencias de audio** indexadas  
✅ **~300-500 puntos gramaticales** con ejemplos  
✅ **Búsqueda semántica** de todo el contenido  
✅ **Frontend moderno** ya implementado  
✅ **100% gratis** con modelo local del gobierno alemán  

## 🚀 Próximos Pasos

1. ✅ **Test el modelo**: `python test-deutsch-gemma.py`
2. ✅ **Procesa 1 libro**: `--buch "Schritte International 1"`
3. ✅ **Verifica calidad**: Revisa JSON generados
4. ✅ **Procesa todo**: Déjalo correr de noche
5. ✅ **Setup RAG**: `python setup-rag.py`
6. ✅ **Prueba búsquedas**: `python search-rag.py`
7. ✅ **Integra frontend**: Conecta con API

## 📞 Soporte

- **`START-DEUTSCH-GEMMA.md`** - Guía de inicio
- **`README-SISTEMA-COMPLETO.md`** - Documentación completa
- **`SETUP-OLLAMA.md`** - Troubleshooting Ollama

¡Éxito con tu proyecto! 🇩🇪 📚
