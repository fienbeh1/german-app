import sys
import os
import json

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from flask import Flask, request, jsonify
from transcriber import get_model, transcribe
import torch

app = Flask(__name__)

COURSES_DIR = '/home/f/deutsch-app/de'

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        "status": "ok",
        "model": os.environ.get("WHISPER_MODEL", "large-v3"),
        "device": "cuda:0" if torch.cuda.is_available() else "cpu",
        "cuda_available": torch.cuda.is_available(),
    })

@app.route('/transcribe', methods=['POST'])
def transcribe_endpoint():
    data = request.get_json(silent=True) or {}
    audio_path = data.get("audio_path", "")
    language = data.get("language", "de")
    task = data.get("task", "transcribe")

    if not audio_path:
        return jsonify({"error": "audio_path is required"}), 400

    if not os.path.isabs(audio_path):
        audio_path = os.path.normpath(os.path.join(COURSES_DIR, audio_path))

    if not os.path.exists(audio_path):
        return jsonify({"error": f"File not found: {audio_path}"}), 404

    try:
        result = transcribe(audio_path, language=language, task=task)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    get_model()
    port = int(os.environ.get("TRANSCRIBE_PORT", 3457))
    print(f"Transcription server starting on port {port}", file=sys.stderr)
    app.run(host="127.0.0.1", port=port, debug=False)
