# 🚀 Setup Local - Deutsch App

Guía completa para correr la aplicación en tu Ubuntu local.

## 📋 Prerequisitos

- ✅ Node.js 18+ (`node --version`)
- ✅ pnpm instalado (`npm install -g pnpm`)
- ✅ Tus archivos procesados en `/home/f/deutsch-app/de/`

---

## 📥 Paso 1: Clonar el Repo

```bash
cd ~/deutsch-app

# Si ya clonaste el repo antes, actualiza:
cd deutsch-gemma-scripts
git fetch origin
git checkout frontend
git pull origin frontend

# Si es la primera vez:
git clone https://github.com/fienbeh1/deutsch-gemma-scripts.git
cd deutsch-gemma-scripts
git checkout frontend
```

---

## 📦 Paso 2: Instalar Dependencias

### Frontend

```bash
# En la raíz del proyecto
pnpm install
```

### Backend

```bash
cd server
pnpm install
cd ..
```

---

## ⚙️ Paso 3: Configurar Variables de Entorno

```bash
# Copiar template
cp .env.example .env

# Editar .env (opcional, ya tiene valores por defecto)
nano .env
```

Contenido de `.env`:
```env
# URL del backend (default correcto)
VITE_API_URL=http://localhost:3001

# Ruta de tus archivos (para el backend)
DEUTSCH_APP_DIR=/home/f/deutsch-app/de
```

---

## 🏃 Paso 4: Correr la Aplicación

Necesitas **2 terminales** abiertas:

### Terminal 1️⃣ - Backend (Puerto 3001)

```bash
cd ~/deutsch-app/deutsch-gemma-scripts/server

# Correr backend
DEUTSCH_APP_DIR=/home/f/deutsch-app/de pnpm dev
```

Deberías ver:
```
🚀 Backend server running on http://localhost:3001
📂 Serving files from: /home/f/deutsch-app/de
```

### Terminal 2️⃣ - Frontend (Puerto 5173)

```bash
cd ~/deutsch-app/deutsch-gemma-scripts

# Correr frontend
pnpm dev
```

Deberías ver:
```
  VITE v5.x.x  ready in XXX ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

---

## 🌐 Paso 5: Abrir en el Navegador

Abre tu navegador en:
```
http://localhost:5173
```

---

## 🎯 Verificar que Funciona

### 1. Dashboard debe mostrar:
- ✅ 4 tarjetas de estadísticas
- ✅ Vocabulario reciente (si hay JSONs procesados)
- ✅ Audio player

### 2. Lektionen debe mostrar:
- ✅ Lista de libros en sidebar (de tu carpeta `/home/f/deutsch-app/de/`)
- ✅ PDFs cargando cuando seleccionas una lección
- ✅ Panel AI con vocabulario (si hay annotations)

### 3. Vokabeln debe mostrar:
- ✅ Grid de flashcards
- ✅ Búsqueda funcional
- ✅ Click para voltear tarjetas (flip 3D)

---

## 🐛 Troubleshooting

### ❌ "Cannot GET /api/books"

**Problema:** Backend no está corriendo

**Solución:**
```bash
cd server
DEUTSCH_APP_DIR=/home/f/deutsch-app/de pnpm dev
```

---

### ❌ PDFs no cargan / 404

**Problema:** Ruta incorrecta de archivos

**Solución:**
```bash
# Verifica que la ruta existe
ls -la /home/f/deutsch-app/de/

# Si está en otra ubicación, ajusta:
cd server
DEUTSCH_APP_DIR=/tu/ruta/correcta pnpm dev
```

---

### ❌ Vocabulario vacío

**Problema:** No hay JSONs procesados todavía

**Solución:**
```bash
# Ejecuta el procesamiento primero
cd ~/deutsch-app/deutsch-gemma-scripts/scripts
python process-deutsch-gemma.py
```

Espera ~5 horas a que procese todos los archivos.

---

### ❌ CORS error en consola

**Problema:** Frontend no puede conectar al backend

**Solución:**

1. Verifica que backend corre en puerto **3001**
2. Verifica `.env` tiene `VITE_API_URL=http://localhost:3001`
3. Reinicia el frontend:
```bash
# Ctrl+C para detener
pnpm dev
```

---

### ❌ "pnpm: command not found"

**Solución:**
```bash
# Instalar pnpm globalmente
npm install -g pnpm

# O usar npm en su lugar:
npm install
npm run dev
```

---

## 📂 Estructura Esperada de Archivos

```
/home/f/deutsch-app/de/
├── Lagune_1/
│   └── Lagune 1/
│       └── Kursbuch + CD/
│           └── Lagune-1-Kursbuch/
│               ├── pdfs/           # ← PDFs del libro
│               ├── txt/            # ← Archivos OCR
│               └── annotations/    # ← JSONs procesados
├── Schritte International 1/
│   └── ...
└── Tangram_1/
    └── ...
```

El backend **automáticamente** busca todas las carpetas que tengan `txt/` y las reconoce como libros.

---

## 🔄 Actualizar el Código

Cuando haya cambios nuevos en el repo:

```bash
cd ~/deutsch-app/deutsch-gemma-scripts
git pull origin frontend

# Reinstalar dependencias si hay cambios
pnpm install
cd server && pnpm install && cd ..

# Reiniciar servidores
```

---

## 📊 API Endpoints Disponibles

El backend expone:

- `GET /api/books` - Lista todos los libros encontrados
- `GET /api/books/:bookId/lessons` - PDFs de un libro
- `GET /api/books/:bookId/vocabulary` - Todo el vocabulario
- `GET /api/books/:bookId/audio` - Todos los audios
- `GET /pdfs/:path` - Servir PDFs estáticos

---

## 💡 Tips

### Ver logs del backend:
Los logs aparecen en la Terminal 1 (backend). Si hay errores loading PDFs o JSONs, revisa ahí.

### Cambiar puerto del frontend:
```bash
pnpm dev --port 3000
```

### Modo producción (build):
```bash
pnpm build
# Archivos en dist/
```

---

## ✅ ¡Listo!

Ahora tienes:
- ✅ Frontend moderno con React + Tailwind
- ✅ Backend que sirve tus PDFs y JSONs reales
- ✅ Todo corriendo 100% local
- ✅ Sin costos de API

**Disfruta tu app de alemán!** 🇩🇪🎉
