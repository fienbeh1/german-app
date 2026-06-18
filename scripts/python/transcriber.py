import whisper
import torch
import json
import os
import sys
import time

MODEL_NAME = os.environ.get("WHISPER_MODEL", "large-v3")
DEVICE = "cuda:0" if torch.cuda.is_available() else "cpu"

_model = None

def get_model():
    global _model
    if _model is None:
        print(f"Loading whisper model '{MODEL_NAME}' on {DEVICE}...", file=sys.stderr)
        t0 = time.time()
        _model = whisper.load_model(MODEL_NAME, device=DEVICE)
        print(f"Model loaded in {time.time()-t0:.1f}s", file=sys.stderr)
    return _model

def transcribe(audio_path, language="de", task="transcribe"):
    model = get_model()
    result = model.transcribe(
        audio_path,
        language=language,
        task=task,
        fp16=torch.cuda.is_available(),
        verbose=False,
    )
    segments = []
    for seg in result.get("segments", []):
        segments.append({
            "start": seg.get("start", 0),
            "end": seg.get("end", 0),
            "text": seg.get("text", "").strip(),
        })
    return {
        "text": result.get("text", "").strip(),
        "language": result.get("language", language),
        "segments": segments,
        "duration": result.get("segments", [{}])[-1].get("end", 0) if result.get("segments") else 0,
    }

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Transcribe German audio with Whisper")
    parser.add_argument("audio_path", help="Path to audio file")
    parser.add_argument("--language", default="de", help="Language code (default: de)")
    parser.add_argument("--task", default="transcribe", choices=["transcribe", "translate"], help="Task")
    args = parser.parse_args()

    if not os.path.exists(args.audio_path):
        print(json.dumps({"error": f"File not found: {args.audio_path}"}))
        sys.exit(1)

    try:
        result = transcribe(args.audio_path, language=args.language, task=args.task)
        print(json.dumps(result, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"error": str(e)}, ensure_ascii=False))
        sys.exit(1)
