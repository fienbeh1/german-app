#!/usr/bin/env python3
"""
Export all PostgreSQL tables to Parquet (snappy compressed).
Dumps to /home/f/deutsch-app/parquet/backup/{db}/{table}.parquet

Usage:
  python export_parquet.py                          # all databases
  python export_parquet.py deutsch                  # single database
  python export_parquet.py db  ip_table             # single table
"""
import sys, os, time, psycopg2, pandas as pd, pyarrow as pa, pyarrow.parquet as pq

BACKUP_DIR = '/home/f/deutsch-app/parquet/backup'
PG = {'host': '/var/run/postgresql', 'user': 'f'}

DATABASES = ['deutsch', 'db', 'takeout_kali_db', 'nutricion']

def get_tables(dbname, table_filter=None):
    conn = psycopg2.connect(dbname=dbname, **PG)
    cur = conn.cursor()
    cur.execute("""
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name
    """)
    tables = [r[0] for r in cur.fetchall()]
    if table_filter:
        tables = [t for t in tables if table_filter.lower() in t.lower()]
    cur.close()
    conn.close()
    return tables

def export_table(dbname, table, chunk_size=50000):
    out_dir = os.path.join(BACKUP_DIR, dbname)
    os.makedirs(out_dir, exist_ok=True)
    out_file = os.path.join(out_dir, f'{table}.parquet')

    conn = psycopg2.connect(dbname=dbname, **PG)
    cur = conn.cursor()

    # Get row count
    cur.execute(f'SELECT COUNT(*) FROM "{table}"')
    total = cur.fetchone()[0]
    if total == 0:
        print(f"  SKIP {table}: empty")
        cur.close()
        conn.close()
        return 0

    print(f"  {table}: {total:,} rows → {out_file}")
    sys.stdout.flush()

    # Stream in chunks and write as single Parquet
    offset = 0
    writer = None
    start = time.time()

    while offset < total:
        cur.execute(f'SELECT * FROM "{table}" OFFSET {offset} LIMIT {chunk_size}')
        rows = cur.fetchall()
        if not rows:
            break

        cols = [desc[0] for desc in cur.description]
        df = pd.DataFrame(rows, columns=cols)

        # Convert JSONB/object/dict columns to string for Parquet compat
        for col in df.columns:
            if df[col].dtype == 'object':
                # Check if first non-null value is a dict/list
                sample = df[col].dropna()
                if len(sample) > 0 and isinstance(sample.iloc[0], (dict, list)):
                    df[col] = df[col].apply(lambda x: str(x) if x is not None else None)

        table_pa = pa.Table.from_pandas(df, preserve_index=False)

        if writer is None:
            writer = pq.ParquetWriter(out_file, table_pa.schema, compression='snappy')
        writer.write_table(table_pa)

        offset += len(rows)
        elapsed = time.time() - start
        rate = offset / elapsed if elapsed > 0 else 0
        print(f"    {offset:,}/{total:,} ({offset*100//total}%)  {rate:,.0f} rows/s")
        sys.stdout.flush()

    if writer:
        writer.close()

    conn.close()
    return total

def main():
    args = sys.argv[1:]
    db_filter = args[0] if len(args) >= 1 else None
    table_filter = args[1] if len(args) >= 2 else None

    dbs = [db_filter] if db_filter else DATABASES

    totals = {}
    for dbname in dbs:
        if dbname not in DATABASES:
            print(f"Unknown database: {dbname}. Known: {DATABASES}")
            continue

        print(f"\n{'='*60}")
        print(f"  Database: {dbname}")
        print(f"{'='*60}")

        try:
            tables = get_tables(dbname, table_filter)
        except Exception as e:
            print(f"  ERROR connecting: {e}")
            continue

        db_total = 0
        for table in tables:
            try:
                n = export_table(dbname, table)
                db_total += n or 0
            except Exception as e:
                print(f"  ERROR exporting {table}: {e}")

        totals[dbname] = db_total
        print(f"  → {dbname}: {db_total:,} total rows")

    # Summary
    print(f"\n{'='*60}")
    print(f"  SUMMARY")
    print(f"{'='*60}")
    for db, n in totals.items():
        print(f"  {db}: {n:,} rows")
    grand = sum(totals.values())
    print(f"  TOTAL: {grand:,} rows")

    # Show file sizes
    print(f"\n  Files:")
    for root, dirs, files in os.walk(BACKUP_DIR):
        for f in files:
            if f.endswith('.parquet'):
                fp = os.path.join(root, f)
                size = os.path.getsize(fp)
                print(f"  {os.path.relpath(fp, BACKUP_DIR)}: {size/1024/1024:.1f} MB")
    print(f"\n  All Parquet files in: {BACKUP_DIR}")

if __name__ == '__main__':
    main()
