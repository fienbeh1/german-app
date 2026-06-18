#!/usr/bin/env bash
set -euo pipefail

###############################################################################
# redo_delfin_ocr.sh — Re-OCR Delfin Lehrbuch + Arbeitsbuch with Tesseract
# Usage: ./redo_delfin_ocr.sh [--lehrbuch-only] [--arbeitsbuch-only]
#
# Fixes:
#   - Re-OCRs scanned PDF pages with pdftoppm + tesseract -l deu
#   - Re-runs AI analysis via Ollama mistral:latest
#   - Updates existing DB rows (raw_data + materials_registry)
#   - Processes Arbeitsbuch if not already split
###############################################################################

DELFIN_DIR="/home/f/deutsch-app/de/delfin"
PDF_DIR="$DELFIN_DIR/pdf"
TXT_DIR="$DELFIN_DIR/txt"
AI_DIR="$DELFIN_DIR/ai"
LOG_DIR="$DELFIN_DIR/logs"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="$LOG_DIR/redo_$TIMESTAMP.log"

mkdir -p "$PDF_DIR" "$TXT_DIR" "$AI_DIR" "$LOG_DIR"

log()  { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOG_FILE"; }
err()  { log "ERROR: $*"; }
info() { log "INFO: $*"; }

dq() {
    local val="$1"
    local tag="DQ"
    while [[ "$val" == *"$tag"* ]]; do
        tag="DQ$(date +%N)"
    done
    printf "\$%s\$%s\$%s\$\n" "$tag" "$val" "$tag"
}

run_psql() {
    local sql="$1"
    echo "$sql" | psql -d deutsch -U f -v ON_ERROR_STOP=1 -At -q 2>&1
}

# ---------- OCR a single page: PDF -> PNG -> tesseract ----------
ocr_page_with_tesseract() {
    local pdf_path="$1"
    local txt_path="$2"
    if [ -f "$txt_path" ] && [ -s "$txt_path" ]; then
        local size
        size=$(wc -c < "$txt_path")
        if [ "$size" -gt 10 ]; then
            return 0
        fi
    fi
    local base
    base=$(basename "$pdf_path" .pdf)
    local png_dir
    png_dir=$(mktemp -d)
    pdftoppm -png -f 1 -l 1 -r 300 "$pdf_path" "$png_dir/page" 2>> "$LOG_FILE"
    local png_file
    png_file=$(ls "$png_dir"/*.png 2>/dev/null | head -1)
    if [ -n "$png_file" ]; then
        tesseract "$png_file" "${txt_path%.txt}" -l deu 2>> "$LOG_FILE"
    fi
    rm -rf "$png_dir"
    if [ -f "$txt_path" ] && [ -s "$txt_path" ]; then
        local size
        size=$(wc -c < "$txt_path")
        if [ "$size" -gt 10 ]; then
            info "    OCR OK: $(basename "$txt_path") ($size bytes)"
            return 0
        fi
    fi
    {
        echo "=== $base ==="
        echo "(No text extracted from PDF page)"
    } > "$txt_path"
    info "    OCR placeholder: $(basename "$txt_path")"
    return 0
}

# ---------- AI analysis ----------
run_ai() {
    local txt_path="$1"
    local ai_path="$2"
    if [ -f "$ai_path" ] && [ -s "$ai_path" ]; then
        local size
        size=$(wc -c < "$ai_path")
        if [ "$size" -gt 20 ]; then
            return 0
        fi
    fi
    local content
    content=$(cat "$txt_path")
    local escaped
    escaped=$(python3 -c "
import json, sys
text = sys.stdin.read()
print(json.dumps(text))
" <<< "$content")
    local response
    response=$(curl -s http://localhost:11434/api/generate \
        -H "Content-Type: application/json" \
        -d "{
            \"model\": \"mistral:latest\",
            \"prompt\": $escaped,
            \"system\": \"You are a German linguistic expert. Summarize the text in English, provide a German→English vocabulary list of key terms, and note any grammar points. Output in this format:\n\nSUMMARY: <English summary>\n\nVOCABULARY:\n- <German word>: <English translation>\n\nGRAMMAR: <notes>\",
            \"stream\": false
        }" 2>/dev/null || true)
    if [ -n "$response" ]; then
        echo "$response" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    print(data.get('response', ''))
except:
    pass
" > "$ai_path" 2>/dev/null || true
        if [ -s "$ai_path" ]; then
            info "    AI -> $(basename "$ai_path")"
        fi
    fi
}

# ---------- update DB for a single page ----------
update_db() {
    local book_name="$1"
    local page_num="$2"
    local txt_path="$3"
    local ai_path="$4"

    local txt_id="NULL"
    local ai_id="NULL"

    # Upsert txt into raw_data
    if [ -n "$txt_path" ] && [ -f "$txt_path" ]; then
        local content_txt
        content_txt=$(cat "$txt_path")
        txt_id=$(run_psql "
            INSERT INTO raw_data (content_txt, content_type, file_name, file_path, book_name, page_num, directory, file_size, md5_hash)
            VALUES (
                $(dq "$content_txt"),
                'txt',
                $(dq "$(basename "$txt_path")"),
                $(dq "$txt_path"),
                $(dq "$book_name"),
                $page_num,
                $(dq "$(dirname "$txt_path")"),
                $(stat -c%s "$txt_path"),
                $(dq "$(md5sum "$txt_path" | cut -d' ' -f1)")
            )
            ON CONFLICT (file_path, content_type) DO UPDATE SET
                content_txt = EXCLUDED.content_txt,
                file_size = EXCLUDED.file_size,
                md5_hash = EXCLUDED.md5_hash
            RETURNING id;
        " 2>/dev/null || true)
        if [ -z "$txt_id" ]; then
            txt_id=$(run_psql "SELECT id FROM raw_data WHERE file_path = $(dq "$txt_path") AND content_type = 'txt' LIMIT 1;")
        fi
        [ -z "$txt_id" ] && txt_id="NULL"
    fi

    # Upsert ai into raw_data
    if [ -n "$ai_path" ] && [ -f "$ai_path" ]; then
        local content_ai
        content_ai=$(cat "$ai_path")
        ai_id=$(run_psql "
            INSERT INTO raw_data (content_txt, content_type, file_name, file_path, book_name, page_num, directory, file_size, md5_hash, parent_txt_id)
            VALUES (
                $(dq "$content_ai"),
                'ai',
                $(dq "$(basename "$ai_path")"),
                $(dq "$ai_path"),
                $(dq "$book_name"),
                $page_num,
                $(dq "$(dirname "$ai_path")"),
                $(stat -c%s "$ai_path"),
                $(dq "$(md5sum "$ai_path" | cut -d' ' -f1)"),
                $txt_id
            )
            ON CONFLICT (file_path, content_type) DO UPDATE SET
                content_txt = EXCLUDED.content_txt,
                file_size = EXCLUDED.file_size,
                md5_hash = EXCLUDED.md5_hash,
                parent_txt_id = COALESCE(EXCLUDED.parent_txt_id, raw_data.parent_txt_id)
            RETURNING id;
        " 2>/dev/null || true)
        if [ -z "$ai_id" ]; then
            ai_id=$(run_psql "SELECT id FROM raw_data WHERE file_path = $(dq "$ai_path") AND content_type = 'ai' LIMIT 1;")
        fi
        [ -z "$ai_id" ] && ai_id="NULL"
    fi

    local has_txt="FALSE"
    local has_ai="FALSE"
    [ -n "$txt_path" ] && [ -f "$txt_path" ] && has_txt="TRUE"
    [ -n "$ai_path" ] && [ -f "$ai_path" ] && has_ai="TRUE"

    run_psql "
        INSERT INTO materials_registry (book_name, page_num, directory, pdf_path, txt_path, ai_path, raw_data_txt_id, raw_data_ai_id, has_txt, has_ai, has_pdf)
        VALUES (
            $(dq "$book_name"),
            $page_num,
            $(dq "$DELFIN_DIR"),
            $(dq "$pdf_page"),
            $(dq "$txt_path"),
            $(dq "$ai_path"),
            $txt_id,
            $ai_id,
            $has_txt,
            $has_ai,
            TRUE
        )
        ON CONFLICT (book_name, page_num) DO UPDATE SET
            txt_path = EXCLUDED.txt_path,
            ai_path = EXCLUDED.ai_path,
            raw_data_txt_id = COALESCE(EXCLUDED.raw_data_txt_id, materials_registry.raw_data_txt_id),
            raw_data_ai_id = COALESCE(EXCLUDED.raw_data_ai_id, materials_registry.raw_data_ai_id),
            has_txt = EXCLUDED.has_txt,
            has_ai = EXCLUDED.has_ai;
    "
    info "    DB updated: $book_name p$page_num"
}

# ---------- process a single book ----------
process_book() {
    local pdf_file="$1"
    local prefix="$2"
    local book_name="$3"

    info "=== Processing $book_name ==="

    # Step 1: Split PDF if not already done
    local existing_pdf
    existing_pdf=$(ls "$PDF_DIR"/"${prefix}"-*.pdf 2>/dev/null | wc -l)
    if [ "$existing_pdf" -eq 0 ]; then
        info "  Splitting PDF for $prefix ..."
        local total
        total=$(/home/f/miniforge3/bin/python -c "
import fitz
doc = fitz.open('$pdf_file')
print(len(doc))
doc.close()
")
        /home/f/miniforge3/bin/python -c "
import fitz, os
src = '$pdf_file'
prefix = '$prefix'
outdir = '$PDF_DIR'
doc = fitz.open(src)
total = len(doc)
os.makedirs(outdir, exist_ok=True)
for i in range(total):
    outname = f'{prefix}-{i+1:03d}.pdf'
    outpath = os.path.join(outdir, outname)
    if os.path.exists(outpath):
        continue
    out = fitz.open()
    out.insert_pdf(doc, from_page=i, to_page=i)
    out.save(outpath)
    out.close()
doc.close()
print(f'Split {total} pages for {prefix}')
"
        info "  Split complete for $prefix"
    else
        info "  PDFs already split ($existing_pdf pages), skipping split"
    fi

    # Step 2: OCR with tesseract
    info "  OCRing pages for $prefix with tesseract-deu ..."
    local total=0
    local ocr_ok=0
    for pdf_page in "$PDF_DIR"/"${prefix}"-*.pdf; do
        [ -f "$pdf_page" ] || continue
        local base
        base=$(basename "$pdf_page" .pdf)
        local txt_file="$TXT_DIR/$base.txt"
        ocr_page_with_tesseract "$pdf_page" "$txt_file"
        total=$((total + 1))
        local size
        size=$(wc -c < "$txt_file" 2>/dev/null || echo 0)
        if [ "$size" -gt 10 ]; then
            ocr_ok=$((ocr_ok + 1))
        fi
        if [ $((total % 25)) -eq 0 ]; then
            info "    Progress: $total/$total pages"
        fi
    done
    info "  OCR done: $ocr_ok/$total with text"

    # Step 3: AI analysis via Ollama
    if curl -s http://localhost:11434/api/tags >/dev/null 2>&1; then
        info "  Running AI analysis for $prefix with mistral:latest ..."
        local ai_total=0
        for txt_file in "$TXT_DIR"/"${prefix}"-*.txt; do
            [ -f "$txt_file" ] || continue
            local base
            base=$(basename "$txt_file" .txt)
            local ai_file="$AI_DIR/AI_$base.txt"
            run_ai "$txt_file" "$ai_file"
            ai_total=$((ai_total + 1))
            if [ $((ai_total % 25)) -eq 0 ]; then
                info "    AI progress: $ai_total files analyzed"
            fi
        done
        info "  AI analysis done for $ai_total files"
    else
        info "  Ollama not running, skipping AI analysis"
    fi

    # Step 4: Update DB
    info "  Updating DB for $prefix ..."
    local reg_ok=0
    for pdf_page in "$PDF_DIR"/"${prefix}"-*.pdf; do
        [ -f "$pdf_page" ] || continue
        local base
        base=$(basename "$pdf_page" .pdf)
        local page_num_str="${base##*-}"
        local page_num=$((10#$page_num_str))
        local txt_file="$TXT_DIR/$base.txt"
        local ai_file="$AI_DIR/AI_$base.txt"
        if [ ! -f "$ai_file" ] || [ ! -s "$ai_file" ]; then
            ai_file=""
        fi
        update_db "$book_name" "$page_num" "$txt_file" "$ai_file"
        reg_ok=$((reg_ok + 1))
    done
    info "  DB updated for $reg_ok pages of $book_name"
}

# ---------- main ----------
main() {
    log "========== Delfin Re-OCR Pipeline =========="
    log "Start time: $(date)"
    log ""

    local do_lehrbuch=true
    local do_arbeitsbuch=true

    for arg in "$@"; do
        case "$arg" in
            --lehrbuch-only) do_arbeitsbuch=false ;;
            --arbeitsbuch-only) do_lehrbuch=false ;;
        esac
    done

    if $do_lehrbuch; then
        process_book "$DELFIN_DIR/Delfin Lehrbuch.pdf" "Delfin_Lehrbuch" "delfin/Delfin_Lehrbuch"
    fi

    if $do_arbeitsbuch; then
        process_book "$DELFIN_DIR/Arbeitsubuch.pdf" "Delfin_Arbeitsbuch" "delfin/Delfin_Arbeitsbuch"
    fi

    # Summary
    local total_pdf
    total_pdf=$(ls "$PDF_DIR"/*.pdf 2>/dev/null | wc -l)
    local total_txt
    total_txt=$(ls "$TXT_DIR"/*.txt 2>/dev/null | wc -l)
    local total_ai
    total_ai=$(ls "$AI_DIR"/*.txt 2>/dev/null | wc -l)

    log ""
    log "========== Delfin Re-OCR Complete =========="
    log "  Page PDFs:     $total_pdf"
    log "  OCR texts:     $total_txt"
    log "  AI analyses:   $total_ai"
    log "  Log file:      $LOG_FILE"
    log "============================================"
}

main "$@"
