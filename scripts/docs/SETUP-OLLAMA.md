# 🚀 Setup con Ollama - Modelos Locales

## 📋 Resumen

Sistema optimizado para procesar **~2300 archivos TXT** con modelos locales del gobierno alemán vía Ollama.

**Ventajas:**
- ✅ **100% gratis** - No consume APIs pagas
- ✅ **Privacidad total** - Todo local
- ✅ **Sin límites** - Procesa cuanto quieras
- ✅ **Rápido** - Con GPU, ~2-5 segundos por página
- ✅ **Optimizado para DaF** - Modelos especializados en alemán

## 📦 Requisitos

### 1. Ollama Instalado

```bash
# Linux
curl -fsSL https://ollama.com/install.sh | sh

# Verificar instalación
ollama --version
```

### 2. Modelo Recomendado

**Para alemán, recomiendo:**

```bash
# Opción 1: Llama 3.1 8B (general, muy bueno)
ollama pull llama3.1:8b

# Opción 2: Mistral (excelente en alemán)
ollama pull mistral:7b

# Opción 3: Gemma 2 (de Google, multilingüe)
ollama pull gemma2:9b

# Opción 4: Si tienes acceso al modelo del gobierno alemán
# (reemplaza con el nombre real)
ollama pull nombre-modelo-gobierno
```

**Especificaciones:**
- `8b` = 8 mil millones de parámetros (~5GB RAM)
- `7b` = 7 mil millones (~4.5GB RAM)
- Con GPU: ~2-5 seg/página
- Sin GPU (CPU): ~10-30 seg/página

### 3. Iniciar Ollama

```bash
# Iniciar servidor
ollama serve

# En otra terminal, verificar
ollama list
```

## 🎯 Workflow Optimizado

### **FASE 1: Procesar Inhaltsverzeichnis (Índices)**

El sistema PRIMERO busca y procesa los índices (páginas 3-8 típicamente) para extraer:
- Estructura del libro (Lektion 1, 2, 3...)
- Número de página donde empieza cada lección
- Temas de cada lección

**Por qué esto es importante:**
- El índice dice "Lektion 3 ... 45" → significa que Lektion 3 empieza en página 45
- Sin esto, el modelo podría confundir el número de lección con el número de página

```python
# El script detecta automáticamente:
# - Archivos con "inhalt" en el nombre
# - Páginas 3-8 con contenido tipo índice
# - Presencia de puntos guía "......"

Result:
{
  "unit_number": "3",      # ← Lección 3
  "start_page": "45",      # ← Empieza en página 45
  "title": "Im Restaurant"
}
```

### **FASE 2: Procesar Páginas Normales**

Con la estructura del índice como contexto, procesa cada página:

```python
# El modelo recibe:
# 1. Contenido de la página
# 2. Contexto del libro (nivel, tipo)
# 3. Estructura conocida del índice ← CLAVE

# Puede inferir:
# "Esta página 47 pertenece a Lektion 3 (que va de 45-60)"
```

## 🔧 Uso Paso a Paso

### 1️⃣ Test con un archivo

```bash
# Configurar modelo
export OLLAMA_MODEL=llama3.1:8b

# Test rápido
python test-ollama-single.py "/home/f/deutsch-app/de/Schritte International 1/txt/page-012.txt"
```

**Output esperado:**
```
✅ Ollama funcionando
📦 Modelos disponibles:
   - llama3.1:8b
   - mistral:7b

📄 Archivo: page-012.txt
📝 Tamaño: 1842 caracteres

📤 Enviando a Ollama (llama3.1:8b)...
📥 Respuesta recibida (456 caracteres)

✅ JSON parseado correctamente

📊 RESUMEN:
   Página: 12
   Lección: Lektion 2
   Tema: Im Café bestellen
   Audio: True
   Tracks: 12, 13
   Vocabulario: 8 palabras
   Gramática: Modalverben, Akkusativ
```

### 2️⃣ Procesar un libro completo

```bash
python process-with-ollama.py --book "Schritte International 1"
```

**Qué hace:**
1. Detecta carpeta `txt/`
2. Busca Inhaltsverzeichnis (páginas 3-8)
3. Extrae estructura → `book-structure.json`
4. Procesa cada página con contexto
5. Guarda en `annotations/`

**Output:**
```
📚 Schritte International 1
   ℹ️  Nivel: A1, Tipo: Kursbuch

   🔍 Buscando Inhaltsverzeichnis...
   📋 Encontrados 2 archivos de índice
      → Procesando page-003.txt... ✅ (7 lecciones)
      → Procesando page-004.txt... ✅ (0 lecciones)
   ✅ Estructura guardada: 7 unidades

   📄 45 páginas para procesar
   [1/45] page-001.txt... ✅
   [2/45] page-002.txt... ✅
   ...
   ✅ Procesados: 43, Omitidos: 2, Errores: 0
```

### 3️⃣ Procesar TODO (~2300 archivos)

```bash
python process-with-ollama.py
```

**Estimación de tiempo:**
- Con GPU (RTX 3060+): ~2-3 horas
- CPU (8 cores): ~6-10 horas
- Puedes interrumpir (Ctrl+C) y reanudar después ✅

## 📊 Estructura Generada

Para cada libro:

```
Schritte International 1/
├── txt/
│   ├── page-001.txt
│   ├── page-002.txt
│   └── ...
│
├── book-structure.json      # ✨ NUEVO - Estructura extraída del índice
│   {
│     "units": [
│       {
│         "unit_number": "1",
│         "title": "Guten Tag",
│         "start_page": "12",
│         "sections": [...]
│       }
│     ]
│   }
│
└── annotations/              # ✨ NUEVO - Análisis de cada página
    ├── page-001.json
    ├── page-002.json
    ├── ...
    └── _CONSOLIDATED.json    # Resumen completo (vocabulario, audio, etc)
```

## ⚙️ Configuración

### Variables de Entorno

```bash
# Modelo a usar
export OLLAMA_MODEL=llama3.1:8b

# URL de Ollama (si corre en otro servidor)
export OLLAMA_BASE_URL=http://localhost:11434

# Para servidor remoto con GPU
export OLLAMA_BASE_URL=http://192.168.1.100:11434
```

### Ajustar Prompts

Si el modelo no detecta bien algo, edita `process-with-ollama.py`:

```python
# Línea ~140 - Prompt para índices
def generate_index_parsing_prompt(text_content: str, book_name: str):
    # Ajusta aquí para mejorar detección de índices

# Línea ~190 - Prompt para páginas
def generate_page_analysis_prompt_ollama(...):
    # Ajusta aquí para mejorar análisis de contenido
```

## 🎓 Modelos Especializados

### Si tienes acceso al modelo del gobierno alemán:

1. **Cargar el modelo:**
```bash
# Método 1: Si está en HuggingFace
ollama pull hf.co/nombre-organizacion/modelo-daf

# Método 2: Si tienes el archivo GGUF local
ollama create modelo-gobierno -f Modelfile
```

2. **Modelfile ejemplo:**
```dockerfile
FROM /ruta/al/modelo.gguf

PARAMETER temperature 0.1
PARAMETER top_p 0.9
PARAMETER num_ctx 4096

SYSTEM """
Du bist ein Experte für Deutsch als Fremdsprache (DaF).
Du analysierst deutsche Lehrbücher und extrahierst strukturierte Informationen.
"""
```

3. **Usar en el script:**
```bash
export OLLAMA_MODEL=modelo-gobierno
python process-with-ollama.py
```

## 🚀 Optimizaciones

### Para procesar más rápido:

**1. Usar GPU:**
```bash
# Ollama detecta GPU automáticamente
# Verifica con:
nvidia-smi

# Si no detecta:
CUDA_VISIBLE_DEVICES=0 ollama serve
```

**2. Procesamiento paralelo:**

```bash
# Si tienes múltiples GPUs, procesa libros en paralelo

# Terminal 1:
CUDA_VISIBLE_DEVICES=0 OLLAMA_MODEL=llama3.1:8b python process-with-ollama.py --book "Libro1"

# Terminal 2:
CUDA_VISIBLE_DEVICES=1 OLLAMA_MODEL=llama3.1:8b python process-with-ollama.py --book "Libro2"
```

**3. Batch processing:**
Edita el script para procesar múltiples archivos por request (avanzado).

## 🐛 Troubleshooting

### Ollama no responde

```bash
# Reiniciar Ollama
pkill ollama
ollama serve
```

### Modelo muy lento

```bash
# Usar modelo más pequeño
ollama pull llama3.1:7b

# O cuantizado (más rápido, menos preciso)
ollama pull llama3.1:7b-q4_0
```

### JSON mal formado

- El modelo a veces devuelve texto extra
- El script intenta limpiar automáticamente
- Si persiste, reduce `num_predict` en el prompt

### Out of memory

```bash
# Reducir contexto
# En el script, limita content[:1500] a [:800]

# O usar modelo más pequeño
ollama pull llama3.1:7b
```

## 📈 Próximo: Sistema RAG

Una vez procesados todos los archivos, puedes crear un sistema RAG para búsquedas semánticas:

```bash
# Siguiente script a correr:
python setup-rag.py
```

Esto te permitirá:
- "Buscar todas las explicaciones de Modalverben"
- "¿En qué páginas hay ejercicios de Hören?"
- "Mostrar vocabulario nivel B1 sobre restaurantes"

## 💡 Tips

1. **Empieza pequeño**: Procesa 1 libro primero
2. **Revisa calidad**: Abre algunos JSON y verifica
3. **Ajusta prompts**: Si algo no se detecta, modifica el prompt
4. **Usa GPU**: Acelera 5-10x el procesamiento
5. **Deja correr de noche**: 2300 archivos toma horas

## 📞 Especificaciones del Modelo?

¿Necesitas ayuda configurando el modelo del gobierno alemán? Dame:
- Nombre del modelo
- ¿Es un modelo RAG específico o un LLM general?
- ¿Tienen documentación del endpoint/API?
- ¿Qué framework usan? (LangChain, LlamaIndex, custom?)

Puedo adaptar el script para ese modelo específico.
