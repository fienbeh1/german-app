# 🚀 EMPIEZA AQUÍ - Sistema de Aprendizaje de Alemán

## ⚡ Quick Start (5 minutos)

```bash
# 1. Verificar Ollama
ollama serve  # En otra terminal
ollama list   # Verificar deutsch-gemma3-ib:latest

# 2. Test de audio (NUEVO - formatos reales)
python test-audio-detection.py

# 3. Test del modelo
python test-deutsch-gemma.py

# 4. Si pasan (4/4 y 3/3), continuar:
python process-deutsch-gemma.py --buch "Schritte International 1"
```

## 📚 Documentación

### ⭐ COMENZAR CON ESTOS:

1. **`START-DEUTSCH-GEMMA.md`** ← LEER PRIMERO
   - Test de 5 minutos
   - Procesamiento paso a paso
   - Troubleshooting

2. **`README-DEUTSCH-GEMMA.md`** ← GUÍA COMPLETA
   - Todos los scripts explicados
   - Configuración avanzada
   - Monitoreo y optimización

### 📖 Documentación Adicional:

3. **`README-SISTEMA-COMPLETO.md`** - Overview del sistema completo
4. **`SETUP-OLLAMA.md`** - Guía detallada de Ollama
5. **`QUICK-START.md`** - Guía general rápida

## 🎯 ¿Qué hace este sistema?

```
[Tus ~2300 archivos TXT] 
         ↓
[deutsch-gemma3-ib] ← Modelo RAG del gobierno alemán
         ↓
[annotations/ con JSON estructurado]
         ↓
[Búsqueda semántica RAG]
         ↓
[Frontend React moderno]
```

**Resultado:** App de alemán con vocabulario indexado, audios mapeados, gramática estructurada, y búsqueda inteligente.

## 🤖 Scripts Principales

| Script | Qué hace | Cuándo usar |
|--------|----------|-------------|
| `test-deutsch-gemma.py` | Tests automáticos | PRIMERO - verificar setup |
| `process-deutsch-gemma.py` | Procesar libros | SEGUNDO - generar annotations |
| `setup-rag.py` | Indexar para búsqueda | TERCERO - después de procesar |
| `search-rag.py` | Búsqueda semántica | ÚLTIMO - buscar contenido |

## ⏱️ Timeline Sugerido

### Día 1 (30 min)
```bash
python test-deutsch-gemma.py
# Objetivo: 3/3 tests PASS
```

### Día 2 (2-3 horas)
```bash
python process-deutsch-gemma.py --buch "Schritte International 1"
# Objetivo: 1 libro procesado, calidad verificada
```

### Día 3-5 (10-15 horas en background)
```bash
python process-deutsch-gemma.py
# Objetivo: Todos los libros procesados
# Déjalo correr de noche
```

### Día 6 (1 hora)
```bash
python setup-rag.py
# Objetivo: Base de datos RAG creada
```

### Día 7 (ongoing)
```bash
python search-rag.py "Modalverben"
# Objetivo: Búsquedas funcionando
```

## 📊 Estructura Generada

```
/home/f/deutsch-app/de/
├── Schritte International 1/
│   ├── txt/                    # Tus OCR (no se modifican)
│   ├── buchstruktur.json       # ✨ Estructura del libro
│   └── annotations/            # ✨ Análisis detallado
│       ├── page-001.json       # Vocabulario, gramática, audio
│       ├── page-002.json
│       └── _CONSOLIDATED.json  # Resumen completo
│
├── B2/...                      # Lo mismo para cada libro
├── Lagune_1/...
└── ... (todos tus libros)

./rag-database/                 # ✨ Base de datos búsqueda
```

## ✨ Output por Página (JSON)

Cada página TXT genera:

```json
{
  "struktur": {"seite": "12", "lektion": "Lektion 2"},
  "audio": [{"track": "12", "typ": "Dialog"}],
  "vokabular": [
    {
      "wort": "die Wohnung",
      "übersetzung_es": "apartamento"
    }
  ],
  "grammatik": [{"name": "Modalverben", "beispiele": [...]}],
  "zusammenfassung_es": "Esta página trata sobre..."
}
```

## 🎯 Resultado Final

Tu app tendrá:

✅ **~8,000-12,000 palabras** indexadas con traducciones  
✅ **~800-1,200 audios** mapeados a páginas específicas  
✅ **~300-500 puntos gramaticales** con ejemplos  
✅ **Búsqueda semántica** ("ejercicios de Dativ")  
✅ **Frontend React** ya implementado  
✅ **100% gratis** - modelo local  

## 🔧 Requisitos Técnicos

**Software:**
- Ollama instalado
- Modelo `deutsch-gemma3-ib:latest` descargado
- Python 3.8+
- (Opcional) GPU NVIDIA para velocidad

**Hardware recomendado:**
- RAM: 8GB+ (16GB ideal)
- Disco: 10GB libres
- GPU: Cualquier NVIDIA moderna (opcional pero recomendado)

## 🆘 Problemas Comunes

### "Modelo no encontrado"
```bash
ollama pull deutsch-gemma3-ib:latest
```

### "Ollama not responding"
```bash
ollama serve  # En otra terminal
```

### "Tests fallan"
- Lee `START-DEUTSCH-GEMMA.md` sección Troubleshooting
- Verifica output en archivos de test

## 💡 Tips Importantes

1. **NO saltes el test** - `test-deutsch-gemma.py` PRIMERO
2. **Verifica calidad** - Procesa 1 libro, revisa JSON antes de procesar todo
3. **Usa GPU** - 5-10x más rápido
4. **Déjalo de noche** - Procesar todo toma horas
5. **Haz backups** - De la carpeta `annotations/` periódicamente

## 📞 Archivos Clave

### Para empezar:
- ✅ `START-DEUTSCH-GEMMA.md`
- ✅ `test-deutsch-gemma.py`
- ✅ `process-deutsch-gemma.py`

### Para configurar:
- ✅ `config.py`

### Para búsquedas:
- ✅ `setup-rag.py`
- ✅ `search-rag.py`

### Para entender:
- ✅ `README-DEUTSCH-GEMMA.md`
- ✅ `README-SISTEMA-COMPLETO.md`

## 🎓 Frontend React

Ya está implementado en `src/app/App.tsx`:

- ✅ Sidebar compacta con navegación
- ✅ Visor de PDF con zoom
- ✅ Editor de notas (TXT)
- ✅ Panel IA colapsable
- ✅ Reproductor audio/video
- ✅ Navegación entre páginas

Solo necesitas conectarlo con el backend/API una vez procesados los datos.

## 🚀 Siguiente Paso

```bash
# PASO 1: Leer la guía
cat START-DEUTSCH-GEMMA.md

# PASO 2: Ejecutar tests
python test-deutsch-gemma.py

# Si pasa 3/3:
# PASO 3: Procesar un libro
python process-deutsch-gemma.py --buch "Schritte International 1"
```

---

**¿Todo listo?** → Abre `START-DEUTSCH-GEMMA.md` y comienza 🚀

**¿Problemas?** → Revisa `README-DEUTSCH-GEMMA.md` sección Troubleshooting

**¿Dudas conceptuales?** → Lee `README-SISTEMA-COMPLETO.md`
