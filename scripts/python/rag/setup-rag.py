#!/usr/bin/env python3
"""
Setup de sistema RAG para búsqueda semántica en anotaciones
Usa embeddings locales con sentence-transformers
"""

import os
import json
from pathlib import Path
from typing import List, Dict
import numpy as np

# Imports opcionales - instalar si se necesita
try:
    from sentence_transformers import SentenceTransformer
    EMBEDDINGS_AVAILABLE = True
except ImportError:
    print("⚠️  sentence-transformers no instalado")
    print("   Instala con: pip install sentence-transformers")
    EMBEDDINGS_AVAILABLE = False

try:
    import chromadb
    CHROMA_AVAILABLE = True
except ImportError:
    print("⚠️  chromadb no instalado")
    print("   Instala con: pip install chromadb")
    CHROMA_AVAILABLE = False


BASE_DIR = Path("/home/f/deutsch-app/de")
RAG_DB_PATH = Path("./rag-database")


def setup_embedding_model():
    """
    Carga modelo de embeddings optimizado para alemán
    """
    print("📦 Cargando modelo de embeddings...")

    # Modelos recomendados para alemán:
    models = [
        "paraphrase-multilingual-MiniLM-L12-v2",  # Multilingüe, incluye alemán
        "distiluse-base-multilingual-cased-v2",   # Alternativa
        "all-MiniLM-L6-v2"                        # Inglés principalmente, pero funciona
    ]

    # Intentar cargar
    for model_name in models:
        try:
            print(f"   Intentando: {model_name}...")
            model = SentenceTransformer(model_name)
            print(f"   ✅ Cargado: {model_name}")
            return model
        except:
            continue

    print("❌ No se pudo cargar ningún modelo")
    return None


def collect_all_annotations(base_dir: Path) -> List[Dict]:
    """
    Recopila todas las anotaciones procesadas
    """
    print(f"\n🔍 Buscando anotaciones en {base_dir}...")

    annotations = []
    count = 0

    for root, dirs, files in os.walk(base_dir):
        if Path(root).name == "annotations":
            for file in files:
                if file.endswith(".json") and not file.startswith("_"):
                    file_path = Path(root) / file
                    count += 1

                    try:
                        with open(file_path, 'r', encoding='utf-8') as f:
                            data = json.load(f)
                            data['_file_path'] = str(file_path)
                            annotations.append(data)

                        if count % 100 == 0:
                            print(f"   Cargadas: {count}...", end="\r")

                    except:
                        continue

    print(f"   ✅ Total anotaciones: {count}")
    return annotations


def create_searchable_documents(annotations: List[Dict]) -> List[Dict]:
    """
    Convierte anotaciones en documentos para RAG
    """
    print("\n📝 Creando documentos de búsqueda...")

    documents = []

    for ann in annotations:
        # Texto combinado para embedding
        text_parts = []

        # Metadata básica
        metadata = ann.get('metadata', {})
        structure = ann.get('structure', {})
        topic = ann.get('topic', {})

        # Unidad y tema
        if structure.get('unit'):
            text_parts.append(f"Unidad: {structure['unit']}")

        if topic.get('de'):
            text_parts.append(f"Tema: {topic['de']}")

        # Resumen
        if ann.get('summary_es'):
            text_parts.append(ann['summary_es'])

        # Gramática
        for grammar in ann.get('grammar', []):
            if grammar.get('name'):
                text_parts.append(f"Gramática: {grammar['name']}")
                for ex in grammar.get('examples', [])[:2]:
                    text_parts.append(f"Ejemplo: {ex}")

        # Vocabulario (solo primeras 10 palabras)
        for vocab in ann.get('vocabulary', [])[:10]:
            if vocab.get('word'):
                trans = vocab.get('translation_es', '')
                text_parts.append(f"{vocab['word']}: {trans}")

        # Combinar todo
        combined_text = " | ".join(text_parts)

        if combined_text.strip():
            doc = {
                'id': f"{metadata.get('book', 'unknown')}_{structure.get('page', 'x')}",
                'text': combined_text,
                'metadata': {
                    'book': metadata.get('book', ''),
                    'page': structure.get('page', ''),
                    'unit': structure.get('unit', ''),
                    'topic_de': topic.get('de', ''),
                    'topic_es': topic.get('es', ''),
                    'has_audio': len(ann.get('audio', [])) > 0,
                    'file_path': ann.get('_file_path', '')
                },
                'full_annotation': ann
            }
            documents.append(doc)

    print(f"   ✅ Documentos creados: {len(documents)}")
    return documents


def setup_chroma_db(documents: List[Dict], model: SentenceTransformer):
    """
    Crea base de datos ChromaDB con embeddings
    """
    print("\n💾 Configurando ChromaDB...")

    RAG_DB_PATH.mkdir(exist_ok=True)

    client = chromadb.PersistentClient(path=str(RAG_DB_PATH))

    # Crear o obtener colección
    collection = client.get_or_create_collection(
        name="deutsch_annotations",
        metadata={"description": "German DaF book annotations"}
    )

    # Generar embeddings en batches
    batch_size = 100
    total = len(documents)

    print(f"   📊 Generando embeddings para {total} documentos...")

    for i in range(0, total, batch_size):
        batch = documents[i:i+batch_size]

        texts = [doc['text'] for doc in batch]
        ids = [doc['id'] for doc in batch]
        metadatas = [doc['metadata'] for doc in batch]

        # Generar embeddings
        embeddings = model.encode(texts, show_progress_bar=False)

        # Añadir a ChromaDB
        collection.add(
            embeddings=embeddings.tolist(),
            documents=texts,
            ids=ids,
            metadatas=metadatas
        )

        print(f"   [{i+len(batch)}/{total}] procesados...", end="\r")

    print(f"\n   ✅ Base de datos creada: {collection.count()} documentos")

    return collection


def test_search(collection, model: SentenceTransformer):
    """
    Prueba búsquedas de ejemplo
    """
    print("\n🔍 PRUEBAS DE BÚSQUEDA:")

    queries = [
        "Modalverben ejemplos",
        "ejercicios de escucha",
        "vocabulario restaurante",
        "nivel A1 gramática"
    ]

    for query in queries:
        print(f"\n   Query: '{query}'")

        # Generar embedding de la query
        query_embedding = model.encode([query])[0]

        # Buscar
        results = collection.query(
            query_embeddings=[query_embedding.tolist()],
            n_results=3
        )

        # Mostrar resultados
        if results['documents']:
            for i, (doc, metadata) in enumerate(zip(results['documents'][0], results['metadatas'][0]), 1):
                print(f"      {i}. {metadata.get('book', 'Unknown')} - Página {metadata.get('page', '?')}")
                print(f"         {metadata.get('topic_es', 'Sin tema')}")
                print(f"         {doc[:100]}...")


def main():
    """
    Setup completo del sistema RAG
    """
    print("🚀 Setup de Sistema RAG para Libros DaF\n")
    print("="*70)

    if not EMBEDDINGS_AVAILABLE or not CHROMA_AVAILABLE:
        print("\n❌ Dependencias faltantes. Instala:")
        print("   pip install sentence-transformers chromadb")
        return

    # 1. Cargar modelo de embeddings
    model = setup_embedding_model()
    if not model:
        return

    # 2. Recopilar anotaciones
    annotations = collect_all_annotations(BASE_DIR)
    if not annotations:
        print("\n❌ No se encontraron anotaciones")
        print("   Ejecuta primero: python process-with-ollama.py")
        return

    # 3. Crear documentos
    documents = create_searchable_documents(annotations)

    # 4. Setup ChromaDB
    collection = setup_chroma_db(documents, model)

    # 5. Pruebas
    test_search(collection, model)

    print("\n" + "="*70)
    print("✅ Sistema RAG configurado correctamente")
    print(f"   Base de datos: {RAG_DB_PATH}")
    print(f"   Documentos indexados: {collection.count()}")
    print("\n💡 Ahora puedes usar search-rag.py para búsquedas")


if __name__ == "__main__":
    main()
