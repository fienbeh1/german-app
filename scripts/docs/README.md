# Deutsch Learning App

App moderna para aprender alemán con React + Tailwind CSS.

## 🚀 Features

- 📊 **Dashboard** con estadísticas de progreso
- 🎴 **Flashcards** interactivas con flip 3D
- 🎧 **Audio Player** completo con controles
- 📄 **PDF Viewer** para libros de texto
- 🔍 **Búsqueda** de vocabulario en tiempo real
- 📝 **Notas** y anotaciones por lección

## 📂 Estructura

```
deutsch-app/
├── src/
│   ├── app/
│   │   ├── App.tsx              # Componente principal
│   │   └── components/
│   │       ├── DashboardStats.tsx
│   │       ├── VocabularyCard.tsx
│   │       ├── AudioPlayer.tsx
│   │       └── PDFViewer.tsx
│   └── styles/
│       └── theme.css            # Tailwind + custom styles
├── server/
│   ├── index.js                 # Backend Express
│   └── package.json
└── package.json
```

## 🛠️ Setup Local

### Prerequisitos

- Node.js 18+
- pnpm (recomendado) o npm
- Tus archivos procesados en `/home/f/deutsch-app/de/`

### Instalación

```bash
# Clonar repo
git clone https://github.com/fienbeh1/deutsch-gemma-scripts.git
cd deutsch-gemma-scripts

# Checkout rama frontend
git checkout frontend

# Instalar dependencias frontend
pnpm install

# Instalar dependencias backend
cd server
pnpm install
cd ..

# Configurar variables de entorno
cp .env.example .env
# Edita .env si tus archivos están en otra ruta
```

### Correr en desarrollo

**Terminal 1 - Backend:**
```bash
cd server
DEUTSCH_APP_DIR=/home/f/deutsch-app/de pnpm dev
# Corre en http://localhost:3001
```

**Terminal 2 - Frontend:**
```bash
pnpm dev
# Corre en http://localhost:5173
```

Abre tu navegador en **http://localhost:5173**

## 📡 API Endpoints

El backend expone estos endpoints:

- `GET /api/books` - Lista todos los libros
- `GET /api/books/:bookId/lessons` - PDFs y anotaciones de un libro
- `GET /api/books/:bookId/vocabulary` - Todo el vocabulario de un libro
- `GET /api/books/:bookId/audio` - Todos los audios detectados
- `GET /api/books/:bookId/annotations/:page` - Anotación de una página
- `GET /pdfs/:bookId/pdfs/:filename` - Servir PDF estático

## 🎨 Componentes

### Dashboard
Muestra estadísticas de progreso, vocabulario reciente y audio player.

### Vocabulary Cards
Flashcards con animación flip 3D:
- Click para voltear
- Frente: palabra alemán + artículo
- Reverso: traducción español + contexto

### Audio Player
Reproductor completo con:
- Play/Pause, Skip
- Progress bar con seek
- Control de volumen
- Lista de tracks

### PDF Viewer
Visor de PDFs con:
- Zoom in/out
- Navegación por páginas
- Error handling

## 🔧 Configuración

### Variables de entorno

```bash
# .env
VITE_API_URL=http://localhost:3001
```

### Backend

```bash
# Al correr el backend, puedes especificar la ruta:
DEUTSCH_APP_DIR=/ruta/custom pnpm dev
```

## 📦 Build para producción

```bash
# Frontend
pnpm build

# Los archivos estarán en dist/
```

## 🐛 Troubleshooting

### PDFs no cargan
- Verifica que `DEUTSCH_APP_DIR` apunte a la ruta correcta
- Verifica que existan las carpetas `pdfs/` en tus libros
- Revisa la consola del backend

### Vocabulario vacío
- Verifica que existan carpetas `annotations/` con JSONs
- Ejecuta el script de procesamiento primero

### CORS errors
- Verifica que el backend esté corriendo en puerto 3001
- Verifica `VITE_API_URL` en `.env`

## 📝 License

MIT

## 🤝 Contributing

Pull requests bienvenidos!
