#!/usr/bin/env bash
set -euo pipefail

# process_arbeitsbuch.sh — Split, OCR, and AI-analyze Delfin Arbeitsubuch.pdf

DELFIN_DIR="/home/f/deutsch-app/de/delfin"
PDF_DIR="$DELFIN_DIR/pdf"
TXT_DIR="$DELFIN_DIR/txt"
AI_DIR="$DELFIN_DIR/ai"
LOG_DIR="$DELFIN_DIR/logs"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="$LOG_DIR/arbeitsbuch_$TIMESTAMP.log"

mkdir -p "$PDF_DIR" "$TXT_DIR" "$AI_DIR" "$LOG_DIR"

log()  { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOG_FILE"; }
info() { log "INFO: $*"; }

ocr_page() {
    local pdf_path="$1"
    local txt_path="$2"
    if [ -f "$txt_path" ] && [ -s "$txt_path" ]; then
        local sz; sz=$(wc -c < "$txt_path")
        [ "$sz" -gt 10 ] && return 0
    fi
    local base; base=$(basename "$pdf_path" .pdf)
    local png_dir; png_dir=$(mktemp -d)
    pdftoppm -png -f 1 -l 1 -r 300 "$pdf_path" "$png_dir/page" 2>> "$LOG_FILE"
    local png_file; png_file=$(ls "$png_dir"/*.png 2>/dev/null | head -1)
    [ -n "$png_file" ] && tesseract "$png_file" "${txt_path%.txt}" -l deu 2>> "$LOG_FILE"
    rm -rf "$png_dir"
    if [ -f "$txt_path" ] && [ -s "$txt_path" ]; then
        local sz; sz=$(wc -c < "$txt_path")
        [ "$sz" -gt 10 ] && info "    OCR OK: $(basename "$txt_path") ($sz bytes)" && return 0
    fi
    { echo "=== $base ==="; echo "(No text extracted)"; } > "$txt_path"
    info "    OCR placeholder: $(basename "$txt_path")"
}

run_ai() {
    local txt_path="$1"
    local ai_path="$2"
    if [ -f "$ai_path" ] && [ -s "$ai_path" ]; then
        local sz; sz=$(wc -c < "$ai_path")
        [ "$sz" -gt 20 ] && return 0
    fi
    local content; content=$(cat "$txt_path")
    local escaped; escaped=$(python3 -c "import json, sys; print(json.dumps(sys.stdin.read()))" <<< "$content")
    local response
    response=$(curl -s http://localhost:11434/api/generate \
        -H "Content-Type: application/json" \
        -d "{
            \"model\": \"mistral:latest\",
            \"prompt\": $escaped,
            \"system\": \"You are a German linguistic expert. Summarize the text in English, extract a German→English vocabulary list, and note grammar points.\",
            \"stream\": false
        }" 2>/dev/null || true)
    if [ -n "$response" ]; then
        echo "$response" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    print(data.get('response', ''))
except: pass
" > "$ai_path" 2>/dev/null || true
        [ -s "$ai_path" ] && info "    AI -> $(basename "$ai_path")"
    fi
}

info "=== Delfin Arbeitsbuch Processing ==="
info "Start: $(date)"
info ""

# Step 1: Split PDF
info "Splitting Arbeitsubuch.pdf (504 pages) ..."
/home/f/miniforge3/bin/python -c "
import fitz, os
src = '$DELFIN_DIR/Arbeitsubuch.pdf'
outdir = '$PDF_DIR'
prefix = 'Delfin_Arbeitsbuch'
doc = fitz.open(src)
total = len(doc)
os.makedirs(outdir, exist_ok=True)
for i in range(total):
    outname = f'{prefix}-{i+1:03d}.pdf'
    outpath = os.path.join(outdir, outname)
    if os.path.exists(outpath): continue
    out = fitz.open()
    out.insert_pdf(doc, from_page=i, to_page=i)
    out.save(outpath); out.close()
doc.close()
print(f'Split {total} pages')
"

# Step 2: OCR
info "OCR with tesseract-deu ..."
total=0; ocr_ok=0
for pdf_page in "$PDF_DIR"/Delfin_Arbeitsbuch-*.pdf; do
    [ -f "$pdf_page" ] || continue
    base=$(basename "$pdf_page" .pdf)
    txt_file="$TXT_DIR/$base.txt"
    ocr_page "$pdf_page" "$txt_file"
    total=$((total + 1))
    sz=$(wc -c < "$txt_file" 2>/dev/null || echo 0)
    [ "$sz" -gt 10 ] && ocr_ok=$((ocr_ok + 1))
done
info "OCR done: $ocr_ok/$total with text"

# Step 3: AI analysis
if curl -s http://localhost:11434/api/tags >/dev/null 2>&1; then
    info "AI analysis with mistral:latest ..."
    ai_total=0
    for txt_file in "$TXT_DIR"/Delfin_Arbeitsbuch-*.txt; do
        [ -f "$txt_file" ] || continue
        base=$(basename "$txt_file" .txt)
        ai_file="$AI_DIR/AI_$base.txt"
        run_ai "$txt_file" "$ai_file"
        ai_total=$((ai_total + 1))
    done
    info "AI analysis done for $ai_total files"
else
    info "Ollama not running, skipping AI analysis"
fi

info ""
info "=== Delfin Arbeitsbuch Complete: $(date) ==="
info "  Pages: $total"
info "  OCR OK: $ocr_ok"
info "  AI OK: $ai_total"
info "  Log: $LOG_FILE"
