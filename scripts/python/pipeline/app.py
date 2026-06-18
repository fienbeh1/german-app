from flask import Flask, render_template_string
import pandas as pd

app = Flask(__name__)

def load_and_merge_data():
    try:
        # 1. Original-Datei mit Konjugationen laden
        df_orig = pd.read_csv('verben - Sheet1.csv')
        # 2. Übersetzte Datei laden
        df_trans = pd.read_csv('verben_uebersetzt.csv')

        # Zusammenführen: Wir nehmen 'Infinitiv' aus Datei 1 und 'German' aus Datei 2
        merged = pd.merge(
            df_trans, 
            df_orig[['Infinitiv', 'Präteritum_ich', 'Partizip II']], 
            left_on='German', 
            right_on='Infinitiv', 
            how='inner'
        )
        
        # Duplikate entfernen und leere Felder füllen
        merged = merged.drop_duplicates(subset=['German']).fillna('---')
        return merged.to_dict('records')
    except Exception as e:
        print(f"Fehler beim Laden der Dateien: {e}")
        return []

HTML_TEMPLATE = """
<!DOCTYPE html>
<html>
<head>
    <title>Verbify Cards</title>
    <style>
        body { font-family: 'Segoe UI', sans-serif; background: #f0f4f8; display: flex; flex-direction: column; align-items: center; padding: 20px; }
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px; width: 100%; max-width: 1200px; }
        .card { perspective: 1000px; height: 220px; cursor: pointer; }
        .card-inner { position: relative; width: 100%; height: 100%; transition: transform 0.6s; transform-style: preserve-3d; }
        .card.flipped .card-inner { transform: rotateY(180deg); }
        .card-front, .card-back {
            position: absolute; width: 100%; height: 100%; backface-visibility: hidden;
            display: flex; flex-direction: column; justify-content: center; align-items: center;
            border-radius: 15px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); padding: 20px; text-align: center;
        }
        .card-front { background: white; color: #2d3748; border: 2px solid #e2e8f0; }
        .card-back { background: #4a90e2; color: white; transform: rotateY(180deg); }
        .german { font-size: 1.6rem; font-weight: bold; }
        .lang-item { margin: 5px 0; font-size: 1.1rem; }
        .forms { margin-top: 10px; font-size: 0.85rem; border-top: 1px solid rgba(255,255,255,0.4); pt: 10px; }
        h1 { color: #2d3748; }
    </style>
</head>
<body>
    <h1>Verbify: Flashcards</h1>
    <div class="grid">
        {% for v in verbs %}
        <div class="card" onclick="this.classList.toggle('flipped')">
            <div class="card-inner">
                <div class="card-front">
                    <div class="german">{{ v.German }}</div>
                    <p style="color: #a0aec0; font-size: 0.8rem;">Click to translate</p>
                </div>
                <div class="card-back">
                    <div class="lang-item">🇬🇧 {{ v.English }}</div>
                    <div class="lang-item">🇪🇸 {{ v.Spanish }}</div>
                    <div class="lang-item">🇫🇷 {{ v.French }}</div>
                    <div class="forms">
                        <strong>Past:</strong> {{ v.Präteritum_ich }} <br>
                        <strong>Perfect:</strong> {{ v['Partizip II'] }}
                    </div>
                </div>
            </div>
        </div>
        {% endfor %}
    </div>
</body>
</html>
"""

@app.route('/')
def index():
    verb_data = load_and_merge_data()
    return render_template_string(HTML_TEMPLATE, verbs=verb_data)

if __name__ == '__main__':
    app.run(debug=True, port=5000)