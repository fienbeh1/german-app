import spacy
import psycopg2
from psycopg2.extras import execute_values
from datasets import load_dataset
from tqdm import tqdm

# 1. Configuración de conexión (Asegúrate de que tus credenciales coincidan)
try:
    conn = psycopg2.connect(
        dbname="german_linguistics", 
        user="collocation_user", 
        password="secure_password_here", 
        host="localhost"
    )
    cur = conn.cursor()
except Exception as e:
    print(f"Error de conexión: {e}")
    exit()

# 2. Carga modelo y dataset
spacy.prefer_gpu()
nlp = spacy.load("de_dep_news_trf")
dataset = load_dataset("wikimedia/wikipedia", "20231101.de", split="train[:50000]")

print("Iniciando extracción masiva...")
batch = []

# 3. Procesamiento y extracción
for text in tqdm(dataset['text']):
    # Analizamos dependencias sintácticas para extraer colocaciones
    doc = nlp(text[:1000])
    for t in doc:
        # Extraemos relaciones de objeto (obj/nk) y adjetivo-sustantivo (amod)
        if t.dep_ in ('obj', 'nk', 'amod'):
            batch.append((t.head.lemma_.lower(), t.lemma_.lower()))
    
    # Inserción eficiente en lotes
    if len(batch) >= 2000:
        execute_values(cur, "INSERT INTO collocations (word_1, word_2) VALUES %s ON CONFLICT DO NOTHING", batch)
        conn.commit()
        batch = []

# Limpieza final
if batch:
    execute_values(cur, "INSERT INTO collocations (word_1, word_2) VALUES %s ON CONFLICT DO NOTHING", batch)
    conn.commit()

cur.close()
conn.close()
print("Pipeline finalizado con éxito.")
