import pandas as pd
from deep_translator import GoogleTranslator
import time
import os

def translate_list():
    input_file = 'verben - Sheet1.csv'
    output_file = 'verben_uebersetzt.csv'
    
    # Datei laden
    df = pd.read_csv(input_file)
    verbs = df['Infinitiv'].dropna().tolist()
    
    # Sprachen definieren
    langs = {'English': 'en', 'Spanish': 'es', 'French': 'fr'}
    
    # Falls wir schon angefangen haben, laden wir den Fortschritt
    if os.path.exists(output_file):
        df_result = pd.read_csv(output_file)
    else:
        df_result = pd.DataFrame({'German': verbs})

    for col_name, code in langs.items():
        if col_name in df_result.columns:
            print(f"{col_name} bereits vorhanden. Überspringe...")
            continue
            
        print(f"Starte Übersetzung: {col_name}...")
        translator = GoogleTranslator(source='de', target=code)
        translated = []
        
        for i, verb in enumerate(verbs):
            try:
                # Übersetzt das Wort
                res = translator.translate(verb)
                translated.append(res)
                if i % 50 == 0:
                    print(f"Fortschritt {col_name}: {i}/{len(verbs)}")
            except Exception as e:
                print(f"Fehler bei '{verb}': {e}")
                translated.append("ERROR")
                time.sleep(2) # Kurze Pause bei Fehler
        
        df_result[col_name] = translated
        # Zwischenspeichern nach jeder Sprache
        df_result.to_csv(output_file, index=False, encoding='utf-8-sig')

    print("--- FERTIG! Datei: verben_uebersetzt.csv ---")

if __name__ == "__main__":
    translate_list()
