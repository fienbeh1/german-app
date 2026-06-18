#!/usr/bin/env python3
"""
Búsqueda semántica en anotaciones usando RAG
"""

import sys
from pathlib import Path

try:
    from sentence_transformers import SentenceTransformer
    import chromadb
except ImportError:
    print("❌ Instala: pip install sentence-transformers chromadb")
    sys.exit(1)


RAG_DB_PATH = Path("./rag-database")


def search(query: str, n_results: int = 5):
    """
    Busca en la base de datos RAG
    """
    print(f"\n🔍 Buscando: '{query}'\n")

    # Cargar modelo (cachea automáticamente)
    model = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")

    # Conectar a ChromaDB
    client = chromadb.PersistentClient(path=str(RAG_DB_PATH))
    collection = client.get_collection("deutsch_annotations")

    # Generar embedding de la query
    query_embedding = model.encode([query])[0]

    # Buscar
    results = collection.query(
        query_embeddings=[query_embedding.tolist()],
        n_results=n_results
    )

    # Mostrar resultados
    if not results['documents'][0]:
        print("❌ No se encontraron resultados")
        return

    print(f"📊 Top {len(results['documents'][0])} resultados:\n")

    for i, (doc, metadata, distance) in enumerate(
        zip(
            results['documents'][0],
            results['metadatas'][0],
            results['distances'][0]
        ),
        1
    ):
        print("─" * 70)
        print(f"{i}. {metadata.get('book', 'Unknown')}")
        print(f"   📄 Página: {metadata.get('page', '?')}")
        print(f"   📚 Unidad: {metadata.get('unit', 'Unknown')}")
        print(f"   🎯 Tema: {metadata.get('topic_es', 'Sin tema')}")
        print(f"   🎧 Audio: {'Sí' if metadata.get('has_audio') else 'No'}")
        print(f"   📍 Similarity: {1 - distance:.3f}")
        print(f"\n   Contenido:")
        print(f"   {doc[:200]}...")
        print()


def interactive_search():
    """
    Modo interactivo de búsqueda
    """
    print("🔍 Búsqueda Interactiva RAG - Libros DaF")
    print("="*70)
    print("\nEjemplos de búsquedas:")
    print("  - 'ejercicios de Modalverben'")
    print("  - 'pistas de audio sobre restaurante'")
    print("  - 'vocabulario nivel A2'")
    print("  - 'explicación de Akkusativ'")
    print("\nEscribe 'salir' para terminar\n")

    # Cargar modelo una vez
    model = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")

    # Conectar a ChromaDB
    client = chromadb.PersistentClient(path=str(RAG_DB_PATH))
    collection = client.get_collection("deutsch_annotations")

    print(f"✅ Base de datos cargada: {collection.count()} documentos\n")

    while True:
        try:
            query = input("🔍 Query: ").strip()

            if query.lower() in ['salir', 'exit', 'quit', 'q']:
                print("👋 Hasta luego!")
                break

            if not query:
                continue

            # Buscar
            query_embedding = model.encode([query])[0]

            results = collection.query(
                query_embeddings=[query_embedding.tolist()],
                n_results=5
            )

            # Mostrar
            if not results['documents'][0]:
                print("❌ No se encontraron resultados\n")
                continue

            print(f"\n📊 Top {len(results['documents'][0])} resultados:\n")

            for i, (doc, meta, dist) in enumerate(
                zip(
                    results['documents'][0],
                    results['metadatas'][0],
                    results['distances'][0]
                ),
                1
            ):
                print(f"{i}. {meta.get('book', '?')} - Pág. {meta.get('page', '?')}")
                print(f"   {meta.get('topic_es', 'Sin tema')} | Audio: {'✓' if meta.get('has_audio') else '✗'}")
                print(f"   {doc[:150]}...")
                print()

        except KeyboardInterrupt:
            print("\n\n👋 Hasta luego!")
            break
        except Exception as e:
            print(f"❌ Error: {e}\n")


if __name__ == "__main__":
    if not RAG_DB_PATH.exists():
        print("❌ Base de datos RAG no encontrada")
        print("   Ejecuta primero: python setup-rag.py")
        sys.exit(1)

    if len(sys.argv) > 1:
        # Búsqueda directa
        query = " ".join(sys.argv[1:])
        search(query)
    else:
        # Modo interactivo
        interactive_search()
