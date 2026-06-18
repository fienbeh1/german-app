#!/bin/bash
# Start both servers persistently, survive shell exit
set -e

BACKEND_DIR="/home/f/deutsch-app/backend"
FRONTEND_DIR="/home/f/deutsch-app/app"
PORT_BE=3456
PORT_FE=5173

echo "=== Deutsch App Server Starter ==="

# Kill any existing
fuser -k ${PORT_BE}/tcp 2>/dev/null || true
fuser -k ${PORT_FE}/tcp 2>/dev/null || true
sleep 1

# Build frontend with correct env
echo "Building frontend..."
cd "$FRONTEND_DIR"
VITE_API_URL=http://localhost:3456 VITE_PG_API_URL=http://localhost:3456 VITE_USE_PG=true npx vite build 2>&1 | tail -3

# Start backend detached
echo "Starting backend on port $PORT_BE..."
cd "$BACKEND_DIR"
setsid node server.js <> /dev/null > /tmp/deutsch_backend.log 2>&1 &
BE_PID=$!
disown $BE_PID 2>/dev/null

sleep 2
if kill -0 $BE_PID 2>/dev/null; then
  echo "  Backend PID $BE_PID running ✓"
else
  echo "  Backend FAILED to start!"
  tail -5 /tmp/deutsch_backend.log
  exit 1
fi

# Start frontend detached
echo "Starting frontend on port $PORT_FE..."
cd "$FRONTEND_DIR"
setsid npx vite preview --port $PORT_FE --host <> /dev/null > /tmp/deutsch_frontend.log 2>&1 &
FE_PID=$!
disown $FE_PID 2>/dev/null

sleep 2
if kill -0 $FE_PID 2>/dev/null; then
  echo "  Frontend PID $FE_PID running ✓"
else
  echo "  Frontend FAILED to start!"
  tail -5 /tmp/deutsch_frontend.log
fi

echo ""
echo "=== Verification ==="
if curl -sf --max-time 3 http://localhost:${PORT_BE}/api/health > /dev/null 2>&1; then
  echo "  Backend API: OK"
else
  echo "  Backend API: DOWN"
fi

if curl -sf --max-time 3 http://localhost:${PORT_FE} > /dev/null 2>&1; then
  echo "  Frontend:    OK"
else
  echo "  Frontend:    DOWN"
fi

# Test data endpoints
echo ""
echo "=== Data Verification ==="
BOOKS=$(curl -sf --max-time 5 http://localhost:${PORT_BE}/books 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'{len(d)} books')" 2>/dev/null)
echo "  Books: $BOOKS"

# Get a simple book name (no slashes)
SIMPLE_BOOK=$(curl -sf --max-time 5 http://localhost:${PORT_BE}/books 2>/dev/null | python3 -c "
import sys,json
books = json.load(sys.stdin)
# Find a book without slashes, or use first
for b in books:
    if '/' not in b['id']:
        print(b['id'])
        break
else:
    print(books[0]['id'])
" 2>/dev/null)
echo "  Testing with book: $SIMPLE_BOOK"

if [ -n "$SIMPLE_BOOK" ]; then
  ENCODED=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$SIMPLE_BOOK', safe=''))" 2>/dev/null)
  
  VOCAB=$(curl -sf --max-time 10 "http://localhost:${PORT_BE}/books/${ENCODED}/vocabulary" 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'{len(d.get(\"vocabulary\",[]))} words')" 2>/dev/null)
  echo "  Vocabulary: $VOCAB"
  
  LESSONS=$(curl -sf --max-time 10 "http://localhost:${PORT_BE}/books/${ENCODED}/lessons" 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'{len(d.get(\"pdfs\",[]))} pdfs')" 2>/dev/null)
  echo "  Lessons: $LESSONS"
  
  AUDIO=$(curl -sf --max-time 10 "http://localhost:${PORT_BE}/books/${ENCODED}/audio" 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'{len(d.get(\"audio\",[]))} tracks')" 2>/dev/null)
  echo "  Audio: $AUDIO"
  
  EXERCISES=$(curl -sf --max-time 10 "http://localhost:${PORT_BE}/books/${ENCODED}/exercises" 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'{len(d.get(\"exercises\",[]))} exercises')" 2>/dev/null)
  echo "  Exercises: $EXERCISES"
fi

echo ""
echo "=== URLs ==="
echo "  Frontend: http://localhost:${PORT_FE}"
echo "  Backend:  http://localhost:${PORT_BE}"
echo ""
echo "PIDs: backend=$BE_PID frontend=$FE_PID"
echo "To kill: kill $BE_PID $FE_PID"
