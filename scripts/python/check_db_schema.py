#!/usr/bin/env python3
"""Quick schema check for key tables across databases."""
import psycopg2

PG = {'host': '/var/run/postgresql', 'user': 'f'}

for db in ['deutsch', 'db', 'takeout_kali_db']:
    conn = psycopg2.connect(dbname=db, **PG)
    cur = conn.cursor()
    cur.execute("""
        SELECT table_name,
               (SELECT string_agg(column_name || ' ' || data_type, ', ')
                FROM information_schema.columns
                WHERE table_schema='public' AND table_name=t.table_name
                ORDER BY ordinal_position) as cols
        FROM information_schema.tables t
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name
    """)
    print(f"\n=== {db} ===")
    for r in cur.fetchall():
        print(f"  {r[0]}: {r[1][:120]}")
    cur.close()
    conn.close()
