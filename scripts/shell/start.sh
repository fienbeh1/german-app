#!/bin/bash
# Start both backend and frontend servers
# Usage: ./start.sh

echo "=== Deutsch App Starter ==="

# Kill any existing servers
pkill -f "server.js" 2>/dev/null
pkill -f "vite" 2>/dev/null
sleep 1

# Start backend on port 3456
echo "[1/2] Starting backend..."
cd /home/f/deutsch-app/backend
setsid node server.js <> /dev/null > /tmp/server.log 2>&1 &
disown
sleep 1.5

# Verify backend
if curl -s http://localhost:3456/api/health > /dev/null 2>&1; then
  echo "  ✓ Backend running on http://localhost:3456"
else
  echo "  ✗ Backend failed to start"
  cat /tmp/server.log
fi

# Start frontend on port 5173
echo "[2/2] Starting frontend..."
cd /home/f/deutsch-app/app
setsid npm run dev -- --host <> /dev/null > /tmp/vite.log 2>&1 &
disown
sleep 3

# Verify frontend
if ss -tlnp | grep -q 5173; then
  echo "  ✓ Frontend running on http://localhost:5173"
  echo ""
  echo "=== Both servers are running ==="
  echo "  Frontend: http://localhost:5173"
  echo "  Backend:  http://localhost:3456"
  echo "  Logs:     tail -f /tmp/server.log /tmp/vite.log"
else
  echo "  ✗ Frontend failed to start"
  cat /tmp/vite.log
fi
