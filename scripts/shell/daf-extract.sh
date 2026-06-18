#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════
#  daf-extract.sh  —  DaF book extractor with resume support
#  Usage:  bash daf-extract.sh [target_dir]
#  Default target: /home/f/deutsch-app/test
# ═══════════════════════════════════════════════════════════

# NO set -e here — we handle errors manually so the script never exits silently

MODEL="daf-extractor:latest"
TARGET_DIR="${1:-/home/f/deutsch-app/test/Lagune_2/Lagune 2/Lagune-2-Kursbuch/Lagune_2_Kursbuch/test}"
OLLAMA_URL="http://localhost:11434/api/generate"
MAX_CHARS=3500    # chars per page sent to model
INDEX_PAGES=7     # first N pages checked for Inhaltsverzeichnis

# ── Colours ──────────────────────────────────────────────────
GRN='\033[0;32m'; RED='\033[0;31m'; YLW='\033[0;33m'; BLU='\033[0;34m'; NC='\033[0m'
ok()   { echo -e "  ${GRN}✅ $*${NC}"; }
fail() { echo -e "  ${RED}❌ $*${NC}"; }
info() { echo -e "${BLU}━━ $*${NC}"; }
warn() { echo -e "  ${YLW}⚠️  $*${NC}"; }

# ── Sanity checks ────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════"
echo "  DaF Extractor  |  model: $MODEL"
echo "  Target: $TARGET_DIR"
echo "════════════════════════════════════════════════"
echo ""

if ! command -v jq &>/dev/null; then
    fail "jq not found — install: sudo apt install jq"; exit 1
fi
if ! command -v curl &>/dev/null; then
    fail "curl not found"; exit 1
fi
if ! command -v python3 &>/dev/null; then
    fail "python3 not found"; exit 1
fi
if [[ ! -d "$TARGET_DIR" ]]; then
    fail "Target directory not found: $TARGET_DIR"; exit 1
fi

# Check model exists
MODEL_CHECK=$(curl -sf http://localhost:11434/api/tags 2>/dev/null)
if [[ -z "$MODEL_CHECK" ]]; then
    fail "Ollama not responding at localhost:11434 — is it running?"; exit 1
fi
if ! echo "$MODEL_CHECK" | grep -q "\"$MODEL\""; then
    fail "Model '$MODEL' not found. Build it with:"
    echo "       ollama create daf-extractor -f Modelfile"
    exit 1
fi
ok "Ollama and model '$MODEL' ready"
echo ""

# ════════════════════════════════════════════════
# call_model <content> <hint>
# ════════════════════════════════════════════════
call_model() {
    local content="$1"
    local hint="$2"
    local trimmed="${content:0:$MAX_CHARS}"

    # Build prompt as plain string — no jq needed for this
    local prompt="[$hint]

$trimmed"

    # Build JSON payload with jq (handles escaping safely)
    local payload
    payload=$(jq -n \
        --arg model   "$MODEL" \
        --arg prompt  "$prompt" \
        '{
            model:  $model,
            prompt: $prompt,
            stream: false,
            options: {temperature: 0.05, num_predict: 2048, repeat_penalty: 1.1}
        }')

    local response
    response=$(curl -sf --max-time 200 \
        -H "Content-Type: application/json" \
        -d "$payload" \
        "$OLLAMA_URL" 2>/dev/null)

    if [[ -z "$response" ]]; then
        echo ""
        return
    fi

    echo "$response" | jq -r '.response // empty' 2>/dev/null
}

# ════════════════════════════════════════════════
# clean_json <raw>   — strips markdown fences
# ════════════════════════════════════════════════
clean_json() {
    local raw="$1"
    python3 - <<PYEOF
import sys, re, json

raw = """$( echo "$raw" | sed 's/\\/\\\\/g; s/"""/\\"""\\"""/g' )"""

# Strip markdown fences
cleaned = re.sub(r'^```json?\s*', '', raw.strip(), flags=re.MULTILINE)
cleaned = re.sub(r'```\s*$', '', cleaned.strip(), flags=re.MULTILINE)
cleaned = cleaned.strip()

# Try direct parse
try:
    json.loads(cleaned)
    print(cleaned)
    sys.exit(0)
except:
    pass

# Try to find first complete JSON object
m = re.search(r'\{[\s\S]*\}', cleaned)
if m:
    try:
        json.loads(m.group())
        print(m.group())
        sys.exit(0)
    except:
        pass

# Nothing valid
print("")
PYEOF
}

# ════════════════════════════════════════════════
# detect_audio <content>  — regex fallback
# returns JSON array of audio refs
# ════════════════════════════════════════════════
detect_audio() {
    local content="$1"
    python3 - <<PYEOF
import re, json, sys

text = """$( echo "$content" | sed 's/\\/\\\\/g; s/"""/\\"""\\"""/g' )"""

results = []
seen = set()

def add(cd, track, fmt, ctx=""):
    key = (cd or "", track or "")
    if key not in seen and track:
        seen.add(key)
        results.append({"cd": cd, "track": track, "format": fmt, "context": ctx[:60]})

# Lagune / Schritte:  X|Y  or  X|Y-Z
for m in re.finditer(r'(\d+)\s*\|\s*(\d+(?:\s*-\s*\d+)?)', text):
    cd    = m.group(1)
    track = m.group(2).replace(" ","")
    ctx   = text[max(0,m.start()-60):m.start()].strip()
    add(cd, track, "lagune_schritte", ctx)

# Tangram: Hören … \n <number alone on next line>
lines = text.split('\n')
for i in range(len(lines)-1):
    if re.search(r'h.ren', lines[i], re.IGNORECASE):
        nxt = lines[i+1].strip()
        if re.fullmatch(r'\d+', nxt):
            add(None, nxt, "tangram", lines[i].strip())

# General: "Track 4", "CD 2 Track 15"
for m in re.finditer(r'(?:CD\s*(\d+)[^\d]*)?\bTrack\s+(\d+)', text, re.IGNORECASE):
    cd    = m.group(1)
    track = m.group(2)
    add(cd, track, "general")

print(json.dumps(results, ensure_ascii=False))
PYEOF
}

# ════════════════════════════════════════════════
# is_index_page <filepath> <rank>
# rank = position in sorted file list (1-based)
# ════════════════════════════════════════════════
is_index_page() {
    local fpath="$1"
    local rank="$2"
    local fname
    fname=$(basename "$fpath" | tr '[:upper:]' '[:lower:]')

    # Name contains index keywords
    if [[ "$fname" == *inhalt* || "$fname" == *index* || "$fname" == *contents* || "$fname" == *verzeichnis* ]]; then
        return 0
    fi

    # Among first INDEX_PAGES files — check content
    if (( rank <= INDEX_PAGES )); then
        local lower
        lower=$(cat "$fpath" | tr '[:upper:]' '[:lower:]')
        local hits=0
        for kw in lektion einheit kapitel themenkreis fokus lerneinheit; do
            if echo "$lower" | grep -q "$kw"; then
                hits=$((hits + 1))
            fi
        done
        local dots
        dots=$(echo "$lower" | tr -cd '.' | wc -c)
        if (( hits >= 2 && dots >= 8 )); then
            return 0
        fi
    fi
    return 1
}

# ════════════════════════════════════════════════
# process_book <dir_containing_txt_files>
# ════════════════════════════════════════════════
process_book() {
    local book_dir="$1"
    local book_name
    book_name=$(basename "$book_dir")
    local out_dir="$book_dir/annotations"
    mkdir -p "$out_dir"

    info "Book: $book_name  ($book_dir)"

    # Collect sorted txt files (not inside annotations/)
    local -a txt_files
    mapfile -t txt_files < <(find "$book_dir" -maxdepth 1 -name "*.txt" ! -path "*/annotations/*" | sort)

    local total=${#txt_files[@]}
    if (( total == 0 )); then
        warn "No .txt files found — skipping"
        return
    fi
    echo "  Found $total txt files"

    # ── PHASE 1: Inhaltsverzeichnis ──────────────────────────
    local struct_file="$book_dir/buchstruktur.json"
    local index_data="{}"

    if [[ -f "$struct_file" ]]; then
        ok "Structure cache found: $struct_file"
        index_data=$(cat "$struct_file")
    else
        echo "  Phase 1 — looking for index pages (first $INDEX_PAGES of $total)..."
        local combined_index=""
        local rank=0

        for f in "${txt_files[@]}"; do
            rank=$((rank + 1))
            if is_index_page "$f" "$rank"; then
                echo "    index candidate [#$rank]: $(basename "$f")"
                combined_index+=$'\n'"$(cat "$f")"
            fi
        done

        if [[ -n "$combined_index" ]]; then
            echo "    → calling model..."
            local raw_idx
            raw_idx=$(call_model "$combined_index" "INHALTSVERZEICHNIS")
            local clean_idx
            clean_idx=$(clean_json "$raw_idx")

            if [[ -n "$clean_idx" ]] && echo "$clean_idx" | jq -e '.buchstruktur' &>/dev/null 2>&1; then
                echo "$clean_idx" | jq --arg buch "$book_name" '. + {buch: $buch}' > "$struct_file"
                index_data=$(cat "$struct_file")
                local n
                n=$(echo "$clean_idx" | jq '.buchstruktur | length')
                ok "Index extracted: $n units → $struct_file"
            else
                warn "Model did not return valid buchstruktur — saving raw response"
                echo "$raw_idx" > "$book_dir/buchstruktur_raw.txt"
                warn "Check $book_dir/buchstruktur_raw.txt"
            fi
        else
            warn "No index pages detected among first $INDEX_PAGES files"
        fi
    fi

    # Build structure hint string for page prompts
    local struct_hint=""
    if echo "$index_data" | jq -e '.buchstruktur' &>/dev/null 2>&1; then
        struct_hint=$(echo "$index_data" | \
            jq -r '.buchstruktur[] | "\(.nummer // "?") \(.titel) → S.\(.startseite)"' \
            2>/dev/null | head -25 | tr '\n' ' | ')
    fi

    # ── PHASE 2: All pages ───────────────────────────────────
    echo "  Phase 2 — processing $total pages..."
    local processed=0 skipped=0 errors=0
    local i=0

    for f in "${txt_files[@]}"; do
        i=$((i + 1))
        local stem
        stem=$(basename "$f" .txt)
        local annotation="$out_dir/${stem}.json"

        # Resume: skip done files
        if [[ -f "$annotation" ]]; then
            skipped=$((skipped + 1))
            printf "    [%3d/%d] %-35s → already done\n" "$i" "$total" "$(basename "$f")"
            continue
        fi

        printf "    [%3d/%d] %-35s → " "$i" "$total" "$(basename "$f")"

        local content
        content=$(cat "$f")

        # Skip near-empty (probably image pages)
        if (( ${#content} < 40 )); then
            echo "too short, skip"
            skipped=$((skipped + 1))
            continue
        fi

        # Build hint
        local hint="SEITE"
        if [[ -n "$struct_hint" ]]; then
            hint="SEITE | STRUKTUR: $struct_hint"
        fi

        # Call model
        local raw
        raw=$(call_model "$content" "$hint")

        if [[ -z "$raw" ]]; then
            echo "no response"
            fail "empty response for $(basename "$f")"
            errors=$((errors + 1))
            continue
        fi

        # Clean JSON
        local model_json
        model_json=$(clean_json "$raw")

        if [[ -z "$model_json" ]]; then
            echo "bad JSON"
            # Save raw for debugging
            echo "$raw" > "$out_dir/${stem}.raw.txt"
            warn "raw response saved to ${stem}.raw.txt"
            errors=$((errors + 1))
            continue
        fi

        # Merge audio detected by regex
        local extra_audio
        extra_audio=$(detect_audio "$content")

        local final_json
        final_json=$(python3 - "$model_json" "$extra_audio" <<'PYEOF'
import sys, json

try:
    mj = json.loads(sys.argv[1])
    ex = json.loads(sys.argv[2])
except Exception as e:
    print(sys.argv[1])  # fallback: emit model_json as-is
    sys.exit(0)

existing = mj.get("audio", [])
seen = set()
for a in existing:
    seen.add((a.get("cd") or "", a.get("track") or ""))

for e in ex:
    key = (e.get("cd") or "", e.get("track") or "")
    if key not in seen and key[1]:
        seen.add(key)
        existing.append({
            "anweisung":       e.get("context", "detectado"),
            "cd":              e.get("cd"),
            "track":           e.get("track"),
            "typ":             "Audio (" + e.get("format","auto") + ")",
            "beschreibung_es": "Audio detectado automáticamente"
        })

mj["audio"] = existing
print(json.dumps(mj, ensure_ascii=False, indent=2))
PYEOF
)

        echo "$final_json" > "$annotation"
        echo "✅"
        processed=$((processed + 1))
    done

    echo "  ────────────────────────────────────────────────"
    echo "  ✅ processed: $processed  |  ⏭  skipped: $skipped  |  ❌ errors: $errors"
    echo ""
}

# ════════════════════════════════════════════════
# MAIN — find every folder that has .txt files
# ════════════════════════════════════════════════
total_books=0

# Collect unique parent directories of all .txt files under TARGET_DIR
# (excluding annotations/ folders)
declare -A seen_dirs

while IFS= read -r txtfile; do
    dir=$(dirname "$txtfile")
    if [[ -z "${seen_dirs[$dir]+x}" ]]; then
        seen_dirs[$dir]=1
    fi
done < <(find "$TARGET_DIR" -type f -name "*.txt" ! -path "*/annotations/*" | sort)

if (( ${#seen_dirs[@]} == 0 )); then
    fail "No .txt files found under $TARGET_DIR"
    exit 1
fi

echo "Found ${#seen_dirs[@]} folder(s) with .txt files:"
for d in "${!seen_dirs[@]}"; do
    echo "  $d"
done
echo ""

for dir in $(echo "${!seen_dirs[@]}" | tr ' ' '\n' | sort); do
    process_book "$dir"
    total_books=$((total_books + 1))
done

echo "════════════════════════════════════════════════"
echo "  Done.  Folders processed: $total_books"
echo "  Annotations are in each folder's annotations/"
echo "════════════════════════════════════════════════"