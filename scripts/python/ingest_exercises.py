#!/usr/bin/env python3
"""Ingest Arbeitsbuch/Übungsheft pages from raw_data into ejercicios table."""
import psycopg2
import re
import sys

CONN = "dbname=deutsch user=f"

# Map of patterns to find Arbeitsbuch books for each course
COURSE_AB_PATTERNS = {
    "Lagune 1": ["Lagune_1/Lagune 1/Arbeitsbuch", "Lagune_1_Arbeitsbuch"],
    "Lagune 2": ["Lagune_2/Lagune 2/Lagune-2-Arbeitsbuch", "Lagune-2-Arbeitsbuch"],
    "Lagune 3": ["Lagune_3/Lagune 3/Arbeitsbuch", "Lagune-3-Arbeitsbuch"],
    "Tangram Aktuell 1": ["Tangram_1/Tangram Aktuell 1/Tangram Z", "Tangram_1/Tangram Aktuell 1/Ubungsheft"],
    "Tangram Aktuell 2": ["Tangram_2/Tangram Aktuell 2/Ubungsheft-2"],
    "Tangram Aktuell 3": ["Tangram_3/Tangram Aktuell 3/Tangram Z", "Tangram_3/Tangram Aktuell 3/Ubungsheft"],
    "Menschen A1": ["Varied_Books/Menschen-A2.2-Arbeitsbuch"],
    "Menschen A2": ["Varied_Books/Menschen-A2.2-Arbeitsbuch"],
    "EM B2": ["B2/EM_Neu_AB/EM_Neu_AB_B2", "EM_Neu_AB"],
    "C1": ["Neu-B1-Plus/B1-plus-Arbeitsbuch"],
    "Schritte International 1": ["Schritte_International_1_Kursbuch_und_Arbeitsbuch"],
    "Schritte plus neu A1.2": ["601081_Schritte_plus_Neu_2"],
    "Schritte plus neu A2.1": ["Schritte_plus_Neu_2_Transkripte_Arbeitsbuch", "Schritte_plus_Neu_3_Transkriptionen_Arbeitsbuch"],
    "Schritte plus neu B1.1": ["Schritte_Plus_Neu_5_B1.1"],
    "Schritte plus neu B1.2": ["601085", "601086"],
}

def extract_exercises(text, page_num):
    lines = text.split('\n')
    exercises = []
    current = []
    in_exercise = False
    
    for line in lines:
        stripped = line.strip()
        if not stripped:
            if in_exercise and current:
                exercises.append('\n'.join(current))
                current = []
                in_exercise = False
            continue
        
        # Detect exercise starts: "Übung 1", "1.", "Aufgabe 1", numbers at line start
        if re.match(r'^(Übung|Aufgabe|Üb|Aufg\.?)\s*\d+', stripped, re.I):
            if current:
                exercises.append('\n'.join(current))
            current = [stripped]
            in_exercise = True
        elif re.match(r'^\d+[.)]\s', stripped) and len(stripped) > 3:
            if current:
                exercises.append('\n'.join(current))
            current = [stripped]
            in_exercise = True
        elif in_exercise and len(stripped) > 20:
            current.append(stripped)
        elif not in_exercise and len(stripped) > 50:
            current = [stripped]
            in_exercise = True
    
    if current:
        exercises.append('\n'.join(current))
    
    # Filter: must have meaningful content
    return [e for e in exercises if len(e) > 30 and len(e) < 5000]

def main():
    conn = psycopg2.connect(CONN)
    cur = conn.cursor()
    
    # Get curso IDs
    cur.execute("SELECT id, nombre FROM cursos")
    cursos = {row[1]: row[0] for row in cur.fetchall()}
    
    total_inserted = 0
    
    for course_name, patterns in COURSE_AB_PATTERNS.items():
        curso_id = cursos.get(course_name)
        if not curso_id:
            print(f"  SKIP {course_name}: no curso_id")
            continue
        
        # Remove existing auto-generated exercises for this course
        cur.execute("DELETE FROM ejercicios WHERE curso_id = %s AND tipo = 'grammatik'", (curso_id,))
        conn.commit()
        
        # Find matching raw_data pages
        like_clauses = " OR ".join([f"book_name LIKE '%{p}%'" for p in patterns])
        cur.execute(f"""
            SELECT id, book_name, page_num, content_txt
            FROM raw_data
            WHERE ({like_clauses})
              AND content_txt IS NOT NULL
              AND length(content_txt) > 100
            ORDER BY book_name, page_num
        """)
        pages = cur.fetchall()
        print(f"\n{course_name}: {len(pages)} Arbeitsbuch pages")
        
        page_exercises = 0
        for raw_id, book_name, page_num, text in pages:
            exercises = extract_exercises(text, page_num)
            for i, ex_text in enumerate(exercises):
                title = f"Seite {page_num}"
                first_line = ex_text.split('\n')[0][:80]
                tipo = "grammatik"
                
                # Try to determine type from content
                if re.search(r'konjug|Verb|Präsens|Perfekt|Präteritum', ex_text, re.I):
                    tipo = "conjugation"
                elif re.search(r'Präposition|in,|auf,|unter', ex_text, re.I):
                    tipo = "prepositions"
                elif re.search(r'Artikel|der,|die,|das,|Nominativ|Akkusativ|Dativ', ex_text, re.I):
                    tipo = "declension"
                elif re.search(r'Adjektiv|Komparativ|Superlativ', ex_text, re.I):
                    tipo = "adjective"
                
                try:
                    cur.execute("""
                        INSERT INTO ejercicios (curso_id, numero, pagina, tipo, titulo, texto)
                        VALUES (%s, %s, %s, %s, %s, %s)
                    """, (curso_id, page_num, str(page_num), tipo, title, ex_text))
                    page_exercises += 1
                except Exception as e:
                    print(f"    Error inserting: {e}")
        
        conn.commit()
        total_inserted += page_exercises
        print(f"  Inserted {page_exercises} exercises")
    
    cur.close()
    conn.close()
    print(f"\nTotal: {total_inserted} exercises inserted")
    print("Done!")

if __name__ == '__main__':
    main()
