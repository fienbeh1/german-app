# Setup del Backend - App de Alemán

## Estructura Recomendada

```
/home/f/deutsch-app/backend/
├── content/                    # Contenido de las lecciones
│   ├── B2/
│   │   ├── Lektion-1/
│   │   │   ├── metadata.json   # ✨ Auto-generado con IA
│   │   │   ├── pdfs/
│   │   │   │   ├── page-001.pdf
│   │   │   │   ├── page-002.pdf
│   │   │   │   └── ...
│   │   │   ├── text/
│   │   │   │   ├── page-001.txt
│   │   │   │   ├── page-002.txt
│   │   │   │   └── ...
│   │   │   ├── audio/
│   │   │   │   ├── lektion-1-full.mp3
│   │   │   │   └── dialog-1.mp3
│   │   │   ├── video/           # Opcional
│   │   │   │   └── video-1.mp4
│   │   │   ├── annotations/     # ✨ Auto-generado con IA
│   │   │   │   ├── page-001.json
│   │   │   │   ├── page-002.json
│   │   │   │   ├── lesson-summary.json
│   │   │   │   └── vocabulary.json
│   │   │   └── notes.txt        # Tus notas manuales
│   │   ├── Lektion-2/
│   │   └── ...
│   ├── Schritte-International/
│   ├── Schritte-Plus-Neu/
│   ├── Tangram/
│   └── Varios/
│
├── scripts/                    # Scripts de procesamiento
│   ├── analyze-content.py
│   └── process-lessons.py
│
└── server/                     # API Node.js/Express
    ├── index.js
    └── routes/
        ├── lessons.js
        └── content.js
```

## Paso 1: Organizar tus archivos existentes

### 1.1 Renombrar PDFs con formato consistente

```bash
# Ir a la carpeta de una lección
cd /home/f/deutsch-app/backend/content/B2/Lektion-1/pdfs

# Renombrar archivos a formato page-001.pdf
# Si están como: 1.pdf, 2.pdf, 3.pdf
count=1
for file in *.pdf; do
  mv "$file" "page-$(printf "%03d" $count).pdf"
  count=$((count + 1))
done
```

### 1.2 Crear estructura de carpetas

```bash
# Para cada lección, crear subcarpetas
cd /home/f/deutsch-app/backend/content/B2/Lektion-1

mkdir -p pdfs text audio video annotations

# Mover archivos a sus carpetas correspondientes
mv *.pdf pdfs/
mv *.txt text/
mv *.mp3 audio/
mv *.mp4 video/ 2>/dev/null  # Si existen
```

## Paso 2: Procesar con IA

### 2.1 Instalar dependencias

```bash
pip install anthropic
export ANTHROPIC_API_KEY="tu-api-key-aquí"
```

### 2.2 Escanear estructura actual

```bash
# Ver qué tienes actualmente
python process-lessons.py scan

# Esto genera: content-structure.json con un reporte completo
```

### 2.3 Procesar una lección

```bash
# Procesar una lección individual (análisis con IA)
python process-lessons.py process B2/Lektion-1

# Esto genera:
# - annotations/page-001.json (análisis de cada página)
# - annotations/page-002.json
# - ...
# - annotations/lesson-summary.json (resumen completo)
# - annotations/vocabulary.json (todo el vocabulario consolidado)
```

### 2.4 Procesar un curso completo

```bash
# Procesar todas las lecciones de un curso
python process-lessons.py process-all B2/

# ⚠️ Esto puede tomar tiempo y consumir tokens de API
# Costo aproximado: ~$0.50 - $2.00 por lección completa
```

## Paso 3: Crear metadata.json manualmente (o semi-automático)

Copia `metadata-template.json` a cada lección:

```bash
# Para cada lección
cp metadata-template.json content/B2/Lektion-1/metadata.json

# Edita y ajusta con información específica
```

## Paso 4: Crear API Backend Simple

### 4.1 Node.js + Express (Opción rápida)

```javascript
// server/index.js
const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const CONTENT_DIR = '/home/f/deutsch-app/backend/content';

// Servir archivos estáticos (PDFs, audio, video)
app.use('/files', express.static(CONTENT_DIR));

// GET /api/courses - Lista de todos los cursos
app.get('/api/courses', async (req, res) => {
  const courses = await fs.readdir(CONTENT_DIR);
  const courseData = [];

  for (const course of courses) {
    const coursePath = path.join(CONTENT_DIR, course);
    const stat = await fs.stat(coursePath);
    
    if (stat.isDirectory()) {
      const lessons = await fs.readdir(coursePath);
      courseData.push({
        id: course.toLowerCase().replace(/\s+/g, '-'),
        name: course,
        lessonCount: lessons.length
      });
    }
  }

  res.json(courseData);
});

// GET /api/course/:courseId/lessons - Lecciones de un curso
app.get('/api/course/:courseId/lessons', async (req, res) => {
  const { courseId } = req.params;
  const coursePath = path.join(CONTENT_DIR, courseId);

  const lessons = await fs.readdir(coursePath);
  const lessonData = [];

  for (const lesson of lessons) {
    const lessonPath = path.join(coursePath, lesson);
    const metadataPath = path.join(lessonPath, 'metadata.json');

    let metadata = null;
    try {
      const content = await fs.readFile(metadataPath, 'utf-8');
      metadata = JSON.parse(content);
    } catch {
      // Si no existe metadata, crear básico
      const pdfs = await fs.readdir(path.join(lessonPath, 'pdfs'));
      metadata = {
        lesson_id: lesson,
        title: lesson,
        content: { pdf_pages: pdfs.length }
      };
    }

    lessonData.push(metadata);
  }

  res.json(lessonData);
});

// GET /api/lesson/:courseId/:lessonId - Detalles de una lección
app.get('/api/lesson/:courseId/:lessonId', async (req, res) => {
  const { courseId, lessonId } = req.params;
  const lessonPath = path.join(CONTENT_DIR, courseId, lessonId);
  const metadataPath = path.join(lessonPath, 'metadata.json');

  const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));

  // Agregar URLs completas
  if (metadata.content.pdfs) {
    metadata.content.pdfs = metadata.content.pdfs.map(pdf => ({
      ...pdf,
      url: `/files/${courseId}/${lessonId}/${pdf.file}`
    }));
  }

  if (metadata.content.audio) {
    metadata.content.audio = metadata.content.audio.map(audio => ({
      ...audio,
      url: `/files/${courseId}/${lessonId}/${audio.file}`
    }));
  }

  res.json(metadata);
});

app.listen(3000, () => {
  console.log('🚀 Backend running on http://localhost:3000');
});
```

### 4.2 Iniciar el servidor

```bash
cd /home/f/deutsch-app/backend/server
npm init -y
npm install express cors
node index.js
```

## Paso 5: Conectar el Frontend

En tu `App.tsx`, reemplaza los datos mock por llamadas reales:

```typescript
// En lugar de mockLessons, hacer fetch:
useEffect(() => {
  fetch('http://localhost:3000/api/courses')
    .then(res => res.json())
    .then(data => setCourses(data));
}, []);
```

## Prompts Clave para IA

### 📄 Análisis de Página Individual
Ver función `analyze_page()` en `process-lessons.py`

### 📚 Resumen de Lección Completa
Ver función `generate_lesson_summary()` en `analyze-content.py`

### 🔤 Extracción Exhaustiva de Vocabulario
Ver función `generate_vocabulary_extraction_prompt()` en `analyze-content.py`

### 🗂️ Documentación de Estructura
Ver función `generate_file_structure_documentation_prompt()` en `analyze-content.py`

## Tips

1. **Prioriza**: Empieza con 1-2 lecciones para probar el flujo
2. **Backup**: Haz backup antes de renombrar archivos masivamente
3. **Incremental**: No proceses todo de golpe, ve lección por lección
4. **Verifica**: Revisa los JSON generados por la IA, puede haber errores
5. **Cache**: Los resultados del análisis de IA quedan guardados, no necesitas reprocesar

## Costo Estimado IA

- **Por página**: ~$0.01 - $0.05 (depende de longitud)
- **Por lección (12 páginas)**: ~$0.50 - $1.50
- **Curso completo (10 lecciones)**: ~$5 - $15

Usa Claude Haiku si quieres reducir costos (3-5x más barato).
