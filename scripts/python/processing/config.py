"""
Configuración central para el sistema de procesamiento
"""

import os
from pathlib import Path

# Modelo específico del gobierno alemán
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "deutsch-gemma3-ib:latest")
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")

# Directorios
BASE_DIR = Path(os.getenv("DEUTSCH_APP_DIR", "/home/f/deutsch-app/de"))
RAG_DB_PATH = Path("./rag-database")

# Configuración del modelo
MODEL_CONFIG = {
    "temperature": 0.1,      # Más determinista para análisis estructurado
    "top_p": 0.9,
    "top_k": 40,
    "num_ctx": 4096,         # Contexto amplio para páginas largas
    "num_predict": 2500,     # Tokens para la respuesta
}

# Configuración de prompts para RAG alemán
PROMPT_CONFIG = {
    "language": "de",         # El modelo entiende mejor alemán
    "use_german_prompts": True,  # Usar prompts en alemán para mejor precisión
    "include_examples": True,
    "verbose": False
}

# Logging
VERBOSE = os.getenv("VERBOSE", "false").lower() == "true"
