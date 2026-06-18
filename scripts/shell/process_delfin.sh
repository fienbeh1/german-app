#!/usr/bin/env bash
set -euo pipefail

###############################################################################
# process_delfin.sh — Full Delfin processing pipeline
# 1. Split Delfin Lehrbuch.pdf + Arbeitsubuch.pdf into individual page PDFs
# 2. OCR each page via pdftotext
# 3. Run AI analysis via Ollama (if running)
# 4. Consolidate audio files into Audio/
# 5. Register everything in PostgreSQL
#
# Idempotent: safe to re-run; skips existing files.
###############################################################################

DELFIN_DIR="/home/f/deutsch-app/de/delfin"
PDF_DIR="$DELFIN_DIR/pdf"
TXT_DIR="$DELFIN_DIR/txt"
AI_DIR="$DELFIN_DIR/ai"
AUDIO_DIR="$DELFIN_DIR/Audio"
LOG_DIR="$DELFIN_DIR/logs"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="$LOG_DIR/pipeline_$TIMESTAMP.log"
PYTHON="/home/f/miniforge3/bin/python"

mkdir -p "$PDF_DIR" "$TXT_DIR" "$AI_DIR" "$AUDIO_DIR" "$LOG_DIR"

log()  { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOG_FILE"; }
err()  { log "ERROR: $*"; }
info() { log "INFO: $*"; }

# ---------- helper: split PDF into page PDFs ----------
split_pdf() {
    local src="$1"
    local prefix="$2"
    local outdir="$3"

    local total
    total=$("$PYTHON" -c "
import fitz
doc = fitz.open('$src')
print(len(doc))
doc.close()
")

    info "Splitting $prefix ($total pages) into $outdir ..."

    local existing
    existing=$(ls "$outdir"/"${prefix}"-*.pdf 2>/dev/null | wc -l)
    if [ "$existing" -ge "$total" ]; then
        info "  All $total page PDFs for $prefix already exist, skipping split."
        return
    fi

    "$PYTHON" -c "
import fitz, os, sys
src = '$src'
prefix = '$prefix'
outdir = '$outdir'
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
}

# ---------- helper: OCR a single page PDF ----------
ocr_page() {
    local pdf_path="$1"
    local txt_path="$2"
    if [ -f "$txt_path" ] && [ -s "$txt_path" ]; then
        return 0
    fi
    pdftotext -layout "$pdf_path" "$txt_path" 2>> "$LOG_FILE"
    if [ $? -eq 0 ] && [ -s "$txt_path" ]; then
        return 0
    fi
    # If pdftotext produced empty output, write a placeholder
    if [ -f "$txt_path" ] && [ ! -s "$txt_path" ]; then
        local base
        base=$(basename "$pdf_path" .pdf)
        echo "=== $base ===" > "$txt_path"
        echo "(No text extracted from PDF page)" >> "$txt_path"
    fi
    return 0
}

# ---------- helper: run AI analysis on a text file ----------
run_ai() {
    local txt_path="$1"
    local ai_path="$2"
    if [ -f "$ai_path" ] && [ -s "$ai_path" ]; then
        return 0
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
            \"model\": \"ger:latest\",
            \"prompt\": $escaped,
            \"system\": \"You are a German linguistic expert. Summarize the text, provide translations, and list key vocabulary.\",
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

# ---------- helper: dollar_quote for psql ----------
dq() {
    local val="$1"
    local tag="DQ"
    while [[ "$val" == *"$tag"* ]]; do
        tag="DQ$(date +%N)"
    done
    printf "\$%s\$%s\$%s\$\n" "$tag" "$val" "$tag"
}

# ---------- helper: run psql ----------
run_psql() {
    local sql="$1"
    echo "$sql" | psql -d deutsch -U f -v ON_ERROR_STOP=1 -At -q 2>&1
}

# ---------- helper: register a page in DB ----------
register_page() {
    local book_name="$1"
    local page_num="$2"
    local pdf_path="$3"
    local txt_path="$4"
    local ai_path="$5"
    local txt_id="NULL"
    local ai_id="NULL"

    # Check if already registered
    local exists
    exists=$(run_psql "SELECT id FROM materials_registry WHERE book_name = $(dq "$book_name") AND page_num = $page_num;")
    if [ -n "$exists" ]; then
        info "    Already registered: $book_name p$page_num (id=$exists)"
        return
    fi

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
            ON CONFLICT DO NOTHING
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
            ON CONFLICT DO NOTHING
            RETURNING id;
        " 2>/dev/null || true)
        if [ -z "$ai_id" ]; then
            ai_id=$(run_psql "SELECT id FROM raw_data WHERE file_path = $(dq "$ai_path") AND content_type = 'ai' LIMIT 1;")
        fi
        [ -z "$ai_id" ] && ai_id="NULL"
    fi

    local has_txt="FALSE"
    local has_ai="FALSE"
    local has_pdf="TRUE"
    [ -n "$txt_path" ] && [ -f "$txt_path" ] && has_txt="TRUE"
    [ -n "$ai_path" ] && [ -f "$ai_path" ] && has_ai="TRUE"

    run_psql "
        INSERT INTO materials_registry (book_name, page_num, directory, pdf_path, txt_path, ai_path, raw_data_txt_id, raw_data_ai_id, has_txt, has_ai, has_pdf)
        VALUES (
            $(dq "$book_name"),
            $page_num,
            $(dq "$DELFIN_DIR"),
            $(dq "$pdf_path"),
            $(dq "$txt_path"),
            $(dq "$ai_path"),
            $txt_id,
            $ai_id,
            $has_txt,
            $has_ai,
            $has_pdf
        )
        ON CONFLICT (book_name, page_num) DO UPDATE SET
            txt_path = EXCLUDED.txt_path,
            ai_path = EXCLUDED.ai_path,
            raw_data_txt_id = COALESCE(EXCLUDED.raw_data_txt_id, materials_registry.raw_data_txt_id),
            raw_data_ai_id = COALESCE(EXCLUDED.raw_data_ai_id, materials_registry.raw_data_ai_id),
            has_txt = EXCLUDED.has_txt,
            has_ai = EXCLUDED.has_ai;
    "
    info "    Registered: $book_name p$page_num"
}

# ---------- process a single book ----------
process_book() {
    local pdf_file="$1"
    local prefix="$2"
    local book_name="$3"

    info "=== Processing $book_name ==="

    # Step 1: Split PDF into individual page PDFs
    split_pdf "$pdf_file" "$prefix" "$PDF_DIR"

    # Step 2: OCR each page
    info "  OCRing pages for $prefix ..."
    local total=0
    local ocr_ok=0
    for pdf_page in "$PDF_DIR"/"${prefix}"-*.pdf; do
        [ -f "$pdf_page" ] || continue
        local base
        base=$(basename "$pdf_page" .pdf)
        local txt_file="$TXT_DIR/$base.txt"
        ocr_page "$pdf_page" "$txt_file"
        total=$((total + 1))
        if [ -s "$txt_file" ]; then
            ocr_ok=$((ocr_ok + 1))
        fi
        if [ $((total % 50)) -eq 0 ]; then
            info "    OCR progress: $total pages processed"
        fi
    done
    info "  OCR done: $ocr_ok/$total pages with text"

    # Step 3: AI analysis (if Ollama is running)
    if curl -s http://localhost:11434/api/tags >/dev/null 2>&1; then
        info "  Running AI analysis for $prefix ..."
        local ai_total=0
        for txt_file in "$TXT_DIR"/"${prefix}"-*.txt; do
            [ -f "$txt_file" ] || continue
            local base
            base=$(basename "$txt_file" .txt)
            local ai_file="$AI_DIR/AI_$base.txt"
            run_ai "$txt_file" "$ai_file"
            ai_total=$((ai_total + 1))
            if [ $((ai_total % 50)) -eq 0 ]; then
                info "    AI progress: $ai_total files analyzed"
            fi
        done
        info "  AI analysis done for $ai_total files"
    else
        info "  Ollama not running, skipping AI analysis"
    fi

    # Step 4: Register in DB
    info "  Registering pages in DB for $prefix ..."
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
        register_page "$book_name" "$page_num" "$pdf_page" "$txt_file" "$ai_file"
        reg_ok=$((reg_ok + 1))
    done
    info "  Registered $reg_ok pages for $book_name"
}

# ---------- main ----------
main() {
    log "========== Delfin Processing Pipeline =========="
    log "Start time: $(date)"
    log ""

    # --- Process main books ---
    process_book "$DELFIN_DIR/Delfin Lehrbuch.pdf"   "Delfin_Lehrbuch"   "delfin/Delfin_Lehrbuch"
    process_book "$DELFIN_DIR/Arbeitsubuch.pdf"      "Delfin_Arbeitsbuch" "delfin/Delfin_Arbeitsbuch"

    # --- Process Glossary (optional, fewer pages) ---
    if [ -f "$DELFIN_DIR/Delfin Glossar Deutsch-Arabisch.pdf" ]; then
        process_book "$DELFIN_DIR/Delfin Glossar Deutsch-Arabisch.pdf" "Delfin_Glossar" "delfin/Delfin_Glossar"
    fi

    # --- Process Answers ---
    if [ -f "$DELFIN_DIR/answers.pdf" ]; then
        process_book "$DELFIN_DIR/answers.pdf" "Delfin_Answers" "delfin/Delfin_Answers"
    fi

    # --- Audio files: copy to Audio/ ---
    info "=== Copying audio files ==="
    local audio_count=0
    for src_dir in "$DELFIN_DIR"/Dolph*/; do
        [ -d "$src_dir" ] || continue
        while IFS= read -r -d '' mp3; do
            local base
            base=$(basename "$mp3")
            local dest="$AUDIO_DIR/$base"
            if [ ! -f "$dest" ]; then
                cp "$mp3" "$dest"
                audio_count=$((audio_count + 1))
            fi
        done < <(find "$src_dir" -name '*.mp3' -print0 2>/dev/null)
    done
    info "  Copied $audio_count audio files to $AUDIO_DIR"

    # --- Register audio in DB ---
    info "=== Registering audio in DB ==="
    local audio_reg=0
    for mp3 in "$AUDIO_DIR"/*.mp3; do
        [ -f "$mp3" ] || continue
        local base
        base=$(basename "$mp3")
        local exists
        exists=$(run_psql "SELECT id FROM audio_index WHERE file_path = $(dq "$mp3") LIMIT 1;")
        if [ -n "$exists" ]; then
            continue
        fi
        # Try to extract track number from filename
        local track_num=0
        if [[ "$base" =~ Track[[:space:]]*([0-9]+) ]]; then
            track_num=$((10#${BASH_REMATCH[1]}))
        fi
        local fsize
        fsize=$(stat -c%s "$mp3" 2>/dev/null || echo 0)
        local md5
        md5=$(md5sum "$mp3" | cut -d' ' -f1)
        run_psql "
            INSERT INTO audio_index (file_name, file_path, directory, book_name, track_num, file_size, md5_hash)
            VALUES (
                $(dq "$base"),
                $(dq "$mp3"),
                $(dq "$AUDIO_DIR"),
                'delfin',
                $track_num,
                $fsize,
                $(dq "$md5")
            )
            ON CONFLICT DO NOTHING;
        " 2>/dev/null || true
        audio_reg=$((audio_reg + 1))
    done
    info "  Registered $audio_reg audio files in DB"

    # --- Summary ---
    local total_pdf
    total_pdf=$(ls "$PDF_DIR"/*.pdf 2>/dev/null | wc -l)
    local total_txt
    total_txt=$(ls "$TXT_DIR"/*.txt 2>/dev/null | wc -l)
    local total_ai
    total_ai=$(ls "$AI_DIR"/*.txt 2>/dev/null | wc -l)
    local total_audio
    total_audio=$(ls "$AUDIO_DIR"/*.mp3 2>/dev/null | wc -l)

    log ""
    log "========== Delfin Pipeline Complete =========="
    log "  Page PDFs:     $total_pdf"
    log "  OCR texts:     $total_txt"
    log "  AI analyses:   $total_ai"
    log "  Audio files:   $total_audio"
    log "  Log file:      $LOG_FILE"
    log "=============================================="
}

main "$@"
