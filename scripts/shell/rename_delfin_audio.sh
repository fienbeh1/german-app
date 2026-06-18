#!/usr/bin/env bash
set -euo pipefail

###############################################################################
# rename_delfin_audio.sh
# Renames poorly-named Delfin audio files to a clean, consistent scheme and
# moves them into /home/f/deutsch-app/de/delfin/Audio/.
#
# Naming pattern:
#   Delfin_<Volume>_<CD>_T<NN>.mp3
#
# Example:
#   "01 - Track  1.mp3"  →  "Delfin_Delphin1_1_CD1_T01.mp3"
#
# Also writes a JSON mapping: /home/f/deutsch-app/de/delfin/audio_rename_map.json
###############################################################################

DELFIN_DIR="/home/f/deutsch-app/de/delfin"
AUDIO_DIR="$DELFIN_DIR/Audio"
LOG_DIR="$DELFIN_DIR/logs"
MAP_FILE="$DELFIN_DIR/audio_rename_map.json"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="$LOG_DIR/rename_audio_$TIMESTAMP.log"

mkdir -p "$AUDIO_DIR" "$LOG_DIR"

log()  { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOG_FILE"; }
info() { log "INFO: $*"; }
warn() { log "WARN: $*"; }

declare -A RENAME_MAP

# ---------- Build the mapping ----------
build_mapping() {
    local vol="$1"        # e.g. "Delphin1_1"
    local cd="$2"         # e.g. "CD1"
    local src_dir="$3"    # e.g. "/path/to/Delphin1_1/Delphin1_CD1"

    if [ ! -d "$src_dir" ]; then
        warn "Source directory not found: $src_dir"
        return
    fi

    local files
    files=$(find "$src_dir" -maxdepth 1 -name '*.mp3' -print0 2>/dev/null | sort -z | tr '\0' '\n')
    if [ -z "$files" ]; then
        warn "No MP3 files in $src_dir"
        return
    fi

    while IFS= read -r -d '' mp3; do
        [ -f "$mp3" ] || continue
        local base
        base=$(basename "$mp3")

        # Extract track number from "NN - Track  N.mp3" or "NN - Track NN.mp3"
        local track_num=0
        if [[ "$base" =~ ^([0-9]+) ]]; then
            track_num=$((10#${BASH_REMATCH[1]}))
        fi

        # Build new name
        local new_name
        new_name=$(printf "Delfin_%s_%s_T%02d.mp3" "$vol" "$cd" "$track_num")
        local src_path="$mp3"
        local dst_path="$AUDIO_DIR/$new_name"

        RENAME_MAP["$src_path"]="$new_name"

        if [ -f "$dst_path" ]; then
            info "  EXISTS: $new_name (skipping)"
            continue
        fi

        cp "$src_path" "$dst_path"
        info "  $base → $new_name"

    done < <(find "$src_dir" -maxdepth 1 -name '*.mp3' -print0 | sort -z)
}

# ---------- Write mapping JSON ----------
write_mapping() {
    local first=true
    {
        echo "{"
        for src in "${!RENAME_MAP[@]}"; do
            local dst="${RENAME_MAP[$src]}"
            if [ "$first" = true ]; then
                first=false
            else
                echo ","
            fi
            printf '  %s' "$(python3 -c "
import json
src = '''$src'''.replace(\"'\", \"'\\\\''\")
dst = '''$dst'''.replace(\"'\", \"'\\\\''\")
print(json.dumps(src) + ': ' + json.dumps(dst))
")"
        done
        echo ""
        echo "}"
    } > "$MAP_FILE"
    info "Written mapping to $MAP_FILE"
}

# ---------- Report ----------
print_report() {
    local total=${#RENAME_MAP[@]}
    log ""
    log "========== Audio Rename Complete =========="
    log "  Files processed: $total"
    log "  Audio directory: $AUDIO_DIR"
    log "  Mapping file:    $MAP_FILE"
    log "  Log file:        $LOG_FILE"
    log "==========================================="
}

# ---------- Main ----------
main() {
    log "========== Delfin Audio Rename =========="
    log "Started: $(date)"
    log ""

    # Dolph1_1 → Delphin1_1 CD1 (27 tracks)
    local src1="$DELFIN_DIR/Dolph1_1/Delphin1_1/Delphin1_CD1"
    log "--- Dolph1_1: Delphin1_1 / CD1 ---"
    build_mapping "Delphin1_1" "CD1" "$src1"

    # Dolph1_2 → Delphin1_2 CD2 (27 tracks) + CD3 (50 tracks)
    local src2="$DELFIN_DIR/Dolph1_2/Delphin1_2/Delphin1_CD2"
    log "--- Dolph1_2: Delphin1_2 / CD2 ---"
    build_mapping "Delphin1_2" "CD2" "$src2"

    local src3="$DELFIN_DIR/Dolph1_2/Delphin1_2/Delphin1_CD3"
    log "--- Dolph1_2: Delphin1_2 / CD3 ---"
    build_mapping "Delphin1_2" "CD3" "$src3"

    # Dolph2_1 → Delphin2_1 CD1 (27 tracks)
    local src4="$DELFIN_DIR/Dolph2_1/Delphin2_1/Delphin2_CD1"
    log "--- Dolph2_1: Delphin2_1 / CD1 ---"
    build_mapping "Delphin2_1" "CD1" "$src4"

    # Dplph2_2 → Delphin2_2 CD3 (27 tracks)
    local src5="$DELFIN_DIR/Dplph2_2/Delphin2_2/Delphin2_CD3"
    log "--- Dplph2_2: Delphin2_2 / CD3 ---"
    build_mapping "Delphin2_2" "CD3" "$src5"

    write_mapping
    print_report
}

main "$@"
