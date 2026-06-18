#!/usr/bin/env python3
"""Ingest audio reference scan results into page_audio_refs table."""
import json, psycopg2, sys

DB_NAME = "deutsch"
DB_USER = "f"
DB_HOST = "/var/run/postgresql"
SCAN_FILE = "/tmp/audio_refs_scan.json"

def main():
    with open(SCAN_FILE) as f:
        data = json.load(f)
    
    conn = psycopg2.connect(dbname=DB_NAME, user=DB_USER, host=DB_HOST)
    cur = conn.cursor()
    
    inserted = 0
    skipped = 0
    
    for result in data["results"]:
        book_name = result["book_name"]
        
        for page in result["pages_scanned"]:
            page_num = page["page"]
            has_trans = page.get("has_transcription", False)
            has_ans = page.get("has_answers", False)
            section_type = page.get("section_type", "other")
            
            # Insert audio refs
            for ref in page.get("audio_refs", []):
                cd = ref.get("cd")
                track = ref.get("track")
                exercise_text = ref.get("exercise_text", "")
                
                cur.execute("""
                    INSERT INTO page_audio_refs (book_name, page_num, cd_num, track_num, exercise_text, has_transcription, has_answers, section_type)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT DO NOTHING
                """, (book_name, page_num, cd, track, exercise_text, has_trans, has_ans, section_type))
                inserted += 1
            
            # If no audio refs but has transcription/answers, still record it
            if not page.get("audio_refs") and (has_trans or has_ans):
                cur.execute("""
                    INSERT INTO page_audio_refs (book_name, page_num, cd_num, track_num, exercise_text, has_transcription, has_answers, section_type)
                    VALUES (%s, %s, NULL, NULL, '', %s, %s, %s)
                    ON CONFLICT DO NOTHING
                """, (book_name, page_num, has_trans, has_ans, section_type))
                inserted += 1
    
    conn.commit()
    print(f"Inserted {inserted} rows into page_audio_refs")
    print(f"Skipped {skipped} duplicates")
    
    # Summary
    cur.execute("SELECT COUNT(*) FROM page_audio_refs")
    total = cur.fetchone()[0]
    print(f"Total rows in table: {total}")
    
    cur.execute("SELECT COUNT(DISTINCT book_name) FROM page_audio_refs")
    books = cur.fetchone()[0]
    print(f"Books covered: {books}")
    
    cur.execute("SELECT COUNT(*) FROM page_audio_refs WHERE cd_num IS NOT NULL")
    with_audio = cur.fetchone()[0]
    print(f"Rows with audio refs: {with_audio}")
    
    cur.close()
    conn.close()

if __name__ == "__main__":
    main()
