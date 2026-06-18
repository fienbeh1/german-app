# Force-create the file to ensure it's there
cat << 'EOF' > process_corpus.py
import sys
import spacy
from tqdm import tqdm

# Load the German transformer model
nlp = spacy.load("de_dep_news_trf")

def stream_and_parse(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        for line in tqdm(f):
            if len(line.split()) < 3: continue
            doc = nlp(line.strip())
            for token in doc:
                # Target: Verb-Object or Adjective-Noun pairings
                if token.dep_ in ('obj', 'amod'):
                    head = token.head.lemma_.lower()
                    child = token.lemma_.lower()
                    # Output in Tab-Separated format for Postgres COPY
                    sys.stdout.write(f"{head}\t{child}\n")

if __name__ == "__main__":
    stream_and_parse(sys.argv[1])
EOF
