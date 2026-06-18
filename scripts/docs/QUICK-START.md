# ⚡ Quick Start - 5 Minutos

## 🎯 Setup Rápido

```bash
# 1. Instalar dependencias
pip install requests sentence-transformers chromadb

# 2. Setup Ollama
curl -fsSL https://ollama.com/install.sh | sh
ollama pull llama3.1:8b
ollama serve  # En otra terminal

# 3. Test con un archivo
export OLLAMA_MODEL=llama3.1:8b
python test-ollama-single.py "/home/f/deutsch-app/de/Schritte International 1/txt/page-012.txt"

# 4. Si funciona, procesar todo (2-10 horas)
python process-with-ollama.py
```

## 📂 Lo Que Hace

```
[txt/] → [Ollama AI] → [annotations/]
  ↓
• Detecta: páginas, lecciones, unidades
• Extrae: vocabulario, gramática, ejercicios  
• Identifica: audios (Track X, Hören Sie)
• Traduce: instrucciones al español
• Genera: resúmenes, tips de estudio
```

## ✨ Resultado

Cada página TXT genera un JSON con:

```json
{
  "structure": {"page": "12", "unit": "Lektion 2"},
  "audio": [{"track": "12", "type": "Dialog"}],
  "vocabulary": [
    {"word": "die Wohnung", "translation_es": "apartamento"}
  ],
  "grammar": [
    {"name": "Modalverben", "examples": ["Ich kann..."]}
  ],
  "summary_es": "Esta página trata sobre..."
}
```

## 🔍 Búsqueda RAG (después de procesar)

```bash
# Setup RAG (30-60 min, una vez)
python setup-rag.py

# Buscar
python search-rag.py "ejercicios de Modalverben"
```

## 💡 Archivos Clave

| Archivo | Propósito |
|---------|-----------|
| `process-with-ollama.py` | **Script principal** - Procesa todo |
| `test-ollama-single.py` | Test con 1 archivo |
| `setup-rag.py` | Crea base de datos búsqueda |
| `search-rag.py` | Búsqueda semántica |
| `SETUP-OLLAMA.md` | 📖 Guía completa Ollama |
| `README-SISTEMA-COMPLETO.md` | 📖 Documentación completa |

## 🎨 Frontend React

Ya está listo en `src/app/App.tsx`:

- ✅ Sidebar compacta con navegación
- ✅ Visor de PDF con zoom
- ✅ Editor de notas (TXT)
- ✅ Panel IA colapsable (vocabulario, gramática, audio)
- ✅ Reproductor audio/video
- ✅ Navegación entre páginas con flechas

## 🚀 Orden Recomendado

1. **Test** → `test-ollama-single.py` (5 min)
2. **Procesar 1 libro** → `--book "Schritte International 1"` (1-2 horas)
3. **Verificar calidad** → Abre algunos JSON en `annotations/`
4. **Ajustar prompts** si es necesario
5. **Procesar todo** → `process-with-ollama.py` (noche completa)
6. **Setup RAG** → `setup-rag.py` (30 min)
7. **Probar búsquedas** → `search-rag.py`
8. **Integrar frontend** → Conectar API

## ⚠️ Importante

**Inhaltsverzeichnis (Índice):**
- El script detecta PRIMERO las páginas de índice (3-8)
- Extrae estructura: "Lektion 3 ... página 45"
- Usa eso como contexto para procesar el resto
- **Evita confundir** número de lección con número de página

## 📊 Especificaciones del Modelo?

Si usas el modelo del gobierno alemán, dime:
- Nombre del modelo
- ¿Corre con Ollama o otro framework?
- ¿Es RAG específico o LLM general?
- Endpoint/API si existe

Puedo adaptar el script para ese modelo específico.

## 💬 ¿Dudas?

Lee la documentación completa:
- **`README-SISTEMA-COMPLETO.md`** - Overview completo
- **`SETUP-OLLAMA.md`** - Guía detallada Ollama
- **`README-PROCESAMIENTO.md`** - Guía original (Claude API)
