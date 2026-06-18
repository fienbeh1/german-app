#!/usr/bin/env python3
"""
Script para consolidar anotaciones de un libro completo
Genera resúmenes útiles: vocabulario total, índice de audio, etc.
"""

import os
import json
from pathlib import Path
from collections import defaultdict


def consolidate_book_annotations(book_folder: Path):
    """
    Consolida todas las anotaciones de un libro
    """
    annotations_dir = book_folder / 'annotations'

    if not annotations_dir.exists():
        print(f"❌ No hay carpeta de anotaciones en {book_folder.name}")
        return

    print(f"\n📚 Consolidando: {book_folder.name}")

    annotation_files = sorted(annotations_dir.glob('*.json'))

    if not annotation_files:
        print(f"   ⚠️  No hay archivos JSON para consolidar")
        return

    # Estructuras de consolidación
    all_vocabulary = {}
    all_grammar = defaultdict(list)
    all_audio = []
    all_topics = defaultdict(int)
    page_index = []

    # Procesar cada anotación
    for ann_file in annotation_files:
        with open(ann_file, 'r', encoding='utf-8') as f:
            try:
                data = json.load(f)
            except:
                continue

        # Índice de páginas
        page_info = {
            'file': ann_file.name,
            'page': data.get('structure', {}).get('page_number', 'Unknown'),
            'unit': data.get('structure', {}).get('unit', 'Unknown'),
            'topic': data.get('main_topic', 'Unknown'),
            'type': data.get('content_classification', []),
            'summary': data.get('summary_es', '')
        }
        page_index.append(page_info)

        # Vocabulario (consolidar sin duplicados)
        for vocab in data.get('vocabulary', []):
            word = vocab.get('word', '')
            if word and word not in all_vocabulary:
                all_vocabulary[word] = vocab

        # Gramática
        for grammar in data.get('grammar_points', []):
            name = grammar.get('name', '')
            if name:
                all_grammar[name].append({
                    'page': page_info['page'],
                    'description': grammar.get('description', ''),
                    'examples': grammar.get('examples', [])
                })

        # Audio
        for audio in data.get('audio_references', []):
            audio_info = {
                **audio,
                'page': page_info['page'],
                'unit': page_info['unit']
            }
            all_audio.append(audio_info)

        # Tópicos
        topic = data.get('main_topic', '')
        if topic:
            all_topics[topic] += 1

    # Generar consolidado
    consolidated = {
        'book_name': book_folder.name,
        'total_pages': len(annotation_files),
        'generated': str(Path.cwd()),

        'page_index': sorted(page_index, key=lambda x: x.get('page', '0')),

        'vocabulary_summary': {
            'total_words': len(all_vocabulary),
            'by_type': count_by_type(all_vocabulary),
            'all_words': sorted(all_vocabulary.values(), key=lambda x: x.get('word', ''))
        },

        'grammar_summary': {
            'total_topics': len(all_grammar),
            'topics': [
                {
                    'name': name,
                    'occurrences': len(pages),
                    'pages': [p['page'] for p in pages],
                    'details': pages
                }
                for name, pages in sorted(all_grammar.items())
            ]
        },

        'audio_index': {
            'total_tracks': len(all_audio),
            'tracks': sorted(all_audio, key=lambda x: x.get('track_number', '0'))
        },

        'topics_covered': [
            {'topic': topic, 'frequency': count}
            for topic, count in sorted(all_topics.items(), key=lambda x: -x[1])
        ]
    }

    # Guardar consolidado
    output_file = annotations_dir / '_CONSOLIDATED.json'
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(consolidated, f, ensure_ascii=False, indent=2)

    print(f"   ✅ Consolidado guardado: {output_file.name}")
    print(f"      📄 {len(page_index)} páginas")
    print(f"      📚 {len(all_vocabulary)} palabras de vocabulario")
    print(f"      📖 {len(all_grammar)} puntos gramaticales")
    print(f"      🎧 {len(all_audio)} referencias de audio")


def count_by_type(vocabulary):
    """Cuenta vocabulario por tipo"""
    types = defaultdict(int)
    for word_data in vocabulary.values():
        word_type = word_data.get('word_type', 'Other')
        types[word_type] += 1
    return dict(types)


if __name__ == "__main__":
    import sys

    base_dir = Path("/home/f/deutsch-app/de")

    if len(sys.argv) > 1:
        # Consolidar un libro específico
        book_name = sys.argv[1]
        book_path = base_dir / book_name

        if book_path.exists():
            consolidate_book_annotations(book_path)
        else:
            print(f"❌ No se encuentra: {book_path}")
    else:
        # Consolidar todos los libros que tengan carpeta annotations/
        print("🔍 Buscando libros con anotaciones...\n")

        for item in base_dir.iterdir():
            if item.is_dir():
                # Buscar carpetas annotations en cualquier nivel
                for root, dirs, files in os.walk(item):
                    if 'annotations' in dirs:
                        book_folder = Path(root)
                        consolidate_book_annotations(book_folder)
