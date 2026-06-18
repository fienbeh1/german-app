# 🇩🇪 Sistema de Procesamiento Automático para Libros DaF

## 📋 Resumen

Este sistema analiza automáticamente tus archivos OCR (`.txt`) de libros de alemán DaF y genera anotaciones detalladas con IA que incluyen:

✅ Detección de unidades/lecciones/páginas  
✅ Referencias a audio (tracks, CDs)  
✅ Vocabulario extraído con traducciones  
✅ Puntos gramaticales identificados  
✅ Clasificación de ejercicios  
✅ Traducciones de instrucciones  
✅ Notas culturales y tips de estudio  

## 📁 Tu Estructura Actual

```
/home/f/deutsch-app/de/
├── B2/
│   ├── EM_Neu_AB/
│   │   └── EM_Neu_AB_B2/
│   │       ├── pdf/          # PDFs originales
│   │       ├── txt/          # OCR de los PDFs ← ESTO SE PROCESA
│   │       └── ai/           # Tus análisis previos
│   └── HauptKurs/
│       └── B2-Hauptkurs/
│           ├── pdf/
│           └── txt/          # ← ESTO SE PROCESA
│
├── Schritte International 1/
│   ├── pdf/
│   ├── txt/                  # ← ESTO SE PROCESA
│   └── ai/
│
└── Lagune_1/
    └── Lagune 1/
        ├── Kursbuch + CD/
        │   ├── pdf/
        │   └── txt/          # ← ESTO SE PROCESA
        └── Arbeitsbuch + CD/
            ├── pdf/
            └── txt/          # ← ESTO SE PROCESA
```

## 🚀 Cómo Usar

### 1️⃣ Configurar API Key

```bash
export ANTHROPIC_API_KEY="sk-ant-api03-..."
```

O edita el script y reemplaza `"tu-api-key"` con tu clave real.

### 2️⃣ Ver qué se procesaría (sin gastar tokens)

```bash
python process-german-books.py --dry-run
```

Esto muestra:
- Cuántas carpetas `txt/` encontró
- Cuántos archivos hay en cada una
- Qué contexto detectó (nivel, tipo de material)
- **NO consume tokens de API**

### 3️⃣ Procesar TODO

```bash
python process-german-books.py
```

El script:
1. Recorre `/home/f/deutsch-app/de/` con `os.walk()`
2. Encuentra todas las carpetas llamadas `txt/`
3. Procesa cada archivo `.txt` con Claude
4. Guarda resultados en `annotations/archivo.json` al lado de `txt/`
5. **Skip automático** de archivos ya procesados (puedes interrumpir y reanudar)

### 4️⃣ Consolidar resultados por libro

```bash
# Consolidar un libro específico
python consolidate-annotations.py "Schritte International 1"

# O consolidar todos los libros
python consolidate-annotations.py
```

Esto genera archivos `_CONSOLIDATED.json` con:
- Índice completo de páginas
- Todo el vocabulario del libro (sin duplicados)
- Todos los puntos gramaticales con páginas donde aparecen
- Índice de audios (qué track en qué página)
- Tópicos cubiertos

## 📊 Output Generado

Para cada libro con carpeta `txt/`, se crea:

```
libro/
├── txt/                      # Tus OCRs (no se modifican)
│   ├── page-001.txt
│   ├── page-002.txt
│   └── ...
│
└── annotations/              # ✨ NUEVO - Generado por el script
    ├── page-001.json         # Análisis detallado de cada página
    ├── page-002.json
    ├── ...
    └── _CONSOLIDATED.json    # Resumen del libro completo
```

### Ejemplo de JSON generado

Ver: `example-annotation-output.json`

Cada archivo contiene:
- **Metadata**: Libro, nivel, fecha
- **Estructura**: Lección, página, tipo de material
- **Audio**: Todos los tracks mencionados
- **Vocabulario**: Palabras con artículo, plural, traducción
- **Gramática**: Puntos gramaticales con ejemplos
- **Ejercicios**: Tipo, instrucciones, dificultad
- **Traducciones**: Instrucciones en ES/EN
- **Cultural notes**: Notas culturales relevantes
- **Study tips**: Consejos para estudiar
- **Summary**: Resumen en español de la página

## 🎯 Detección Inteligente

### Audio/Multimedia

El prompt detecta automáticamente:
- `Hören Sie` → Audio de escucha
- `Track 12`, `CD 1` → Números de pista
- `Wiederholen Sie` → Ejercicio de repetición
- `Dialog`, `Gespräch` → Tipo de audio
- Símbolos: 🎧, CD, etc.

### Tipos de Contenido

Clasifica páginas como:
- `grammar_explanation` - Explicación gramatical
- `listening_comprehension` - Comprensión auditiva
- `reading_comprehension` - Comprensión lectora
- `exercise_fill_blanks` - Lückentext
- `dialog` - Diálogo/conversación
- `vocabulary_list` - Lista de vocabulario
- `cultural_info` - Landeskunde
- Y más...

### Contexto Automático

Detecta automáticamente:
- **Nivel**: A1, A2, B1, B2, C1, C2 (del nombre de carpeta)
- **Tipo**: Kursbuch, Arbeitsbuch, Lehrerhandbuch
- **Serie**: Schritte, Lagune, Tangram, Menschen, etc.

## 💰 Costo Estimado

**Claude 3.5 Sonnet:**
- Por página: ~$0.01 - $0.03
- Por libro (50 páginas): ~$0.50 - $1.50
- Toda tu colección (500 páginas): ~$5 - $15

**Claude 3 Haiku** (más barato, ligeramente menos preciso):
- Por página: ~$0.003 - $0.01
- Por libro (50 páginas): ~$0.15 - $0.50
- Toda tu colección: ~$1.50 - $5

Para usar Haiku, cambia en el script:
```python
model="claude-3-haiku-20240307"
```

## ⚙️ Opciones Avanzadas

### Procesar solo un libro

Edita el script y cambia:
```python
BASE_DIR = Path("/home/f/deutsch-app/de/Schritte International 1")
```

### Reprocesar todo (ignorar archivos existentes)

Borra las carpetas `annotations/` y vuelve a ejecutar.

### Ver progreso en tiempo real

El script muestra:
```
📚 Schritte International 1
   📂 /home/f/deutsch-app/de/Schritte International 1/txt
   ℹ️  Nivel: A1, Tipo: Kursbuch
   [1/25] page-001.txt... ✅
   [2/25] page-002.txt... ✅
   [3/25] page-003.txt... ❌
```

## 🔧 Troubleshooting

### Error: "Failed to parse JSON"

- El modelo a veces devuelve texto adicional
- El script intenta limpiarlo automáticamente
- Si falla, revisa manualmente el archivo

### Error: "API key not found"

```bash
export ANTHROPIC_API_KEY="tu-clave-aquí"
```

### Muchos errores de OCR

- El prompt está diseñado para tolerar errores de OCR
- Si el texto es muy malo, considera re-hacer el OCR

### Quiero pausar y reanudar

- ✅ Puedes interrumpir (Ctrl+C) en cualquier momento
- Al volver a ejecutar, salta archivos ya procesados
- Safe to resume

## 📈 Próximos Pasos

1. **Procesar todo**: Ejecuta el script en toda tu colección
2. **Revisar calidad**: Abre algunos `.json` generados y verifica
3. **Ajustar prompt**: Si algo no se detecta bien, modifica el prompt
4. **Consolidar**: Ejecuta `consolidate-annotations.py` para resúmenes
5. **Integrar al frontend**: Usa los JSON en tu aplicación React

## 🎓 Valor Agregado para Estudiantes

Con este sistema, tu app puede ofrecer:

✅ **Búsqueda de vocabulario**: "¿Dónde aparece 'Wohnung'?" → Lista todas las páginas  
✅ **Índice de gramática**: "Ver todas las explicaciones de Modalverben"  
✅ **Navegación por audio**: "Ver todas las páginas con ejercicios de escucha"  
✅ **Dificultad adaptativa**: Filtrar por nivel A1, A2, B1, etc.  
✅ **Traducciones instantáneas**: Todas las instrucciones ya traducidas  
✅ **Tips personalizados**: Consejos de estudio por página  
✅ **Notas culturales**: Contexto cultural automático  

## 📞 Soporte

Si tienes problemas:
1. Revisa `--dry-run` primero
2. Prueba con 1-2 archivos manualmente
3. Verifica tu API key
4. Revisa que los archivos `.txt` tengan contenido
