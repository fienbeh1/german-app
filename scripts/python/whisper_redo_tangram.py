import os
import sys
import subprocess
from concurrent.futures import ThreadPoolExecutor, as_completed
from faster_whisper import WhisperModel

os.environ["LD_LIBRARY_PATH"] = "/mnt/storage/venv/lib/python3.14/site-packages/nvidia/cu13/lib:" + os.environ.get("LD_LIBRARY_PATH", "")

TANGRAM_DIR = "/home/f/deutsch-app/de/Tangram_1"

def find_broken_txts():
    broken = []
    for root, dirs, files in os.walk(TANGRAM_DIR):
        if "transcriptions_de" not in root:
            continue
        for f in files:
            if not f.endswith(".txt") or "_translated" in f:
                continue
            fp = os.path.join(root, f)
            with open(fp, "r") as fh:
                lines = fh.readlines()
            if len(lines) <= 3:
                broken.append(fp)
    return broken

def find_mp3(txt_path):
    d = os.path.dirname(txt_path)
    p = os.path.dirname(d)
    b = os.path.splitext(os.path.basename(txt_path))[0]
    for ext in [".mp3", ".wma"]:
        fp = os.path.join(p, b + ext)
        if os.path.exists(fp):
            return fp
    r = subprocess.run(["find", p, "-maxdepth", "2", "-name", "*.mp3", "-type", "f"],
                       capture_output=True, text=True, timeout=10)
    for m in r.stdout.strip().split("\n"):
        if m and os.path.exists(m):
            return m
    return None

def transcribe_one(txt_path, model):
    mp3 = find_mp3(txt_path)
    if not mp3 or not os.path.exists(mp3):
        return f"SKIP (no mp3) {os.path.basename(txt_path)}"
    try:
        segs, _ = model.transcribe(mp3, language="de", beam_size=3)
        text = "\n".join(s.text.strip() for s in segs)
        if not text.strip():
            text = "(no speech detected)"
        with open(txt_path, "w") as f:
            f.write(text + "\n")
        nc = len(text.split(chr(10)))
        return f"OK {os.path.basename(txt_path)} ({os.path.getsize(txt_path)}b, {nc} lines)"
    except Exception as e:
        return f"ERR {os.path.basename(txt_path)}: {e}"

def main():
    broken = find_broken_txts()
    total = len(broken)
    print(f"Found {total} broken transcription files (<=3 lines)")
    sys.stdout.flush()
    if total == 0:
        return

    print("Loading faster-whisper small model on GPU...")
    sys.stdout.flush()
    model = WhisperModel("small", device="cuda", compute_type="float16")
    print(f"Model loaded. Starting with 6 workers...")
    sys.stdout.flush()

    done = 0
    with ThreadPoolExecutor(max_workers=6) as ex:
        fut_map = {ex.submit(transcribe_one, fp, model): fp for fp in broken}
        for fut in as_completed(fut_map):
            done += 1
            print(f"[{done}/{total}] {fut.result()}")
            sys.stdout.flush()

    print(f"\nDone! {total} files processed.")

if __name__ == "__main__":
    main()
