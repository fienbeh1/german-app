#!/usr/bin/env python3
"""
Deutsch App Master Controller
Unifies indexing, AI annotation, answer extraction, and service lifecycle.
"""

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import time
import urllib.request
import urllib.error
from datetime import datetime
from pathlib import Path
from typing import Optional, Tuple

ROOT_DIR = "/home/f/deutsch-app/de"
INDEX_FILE = "/home/f/deutsch-app/index/index.json"
DB_NAME = "deutsch"
DB_USER = "f"
DB_HOST = "/var/run/postgresql"

OLLAMA_URL = "http://localhost:11434/api/generate"
OLLAMA_MODEL = "deutsch-gemma3-ib:latest"
OLLAMA_SYSTEM = "You are a German linguistic expert. Summarize the text, provide translations, and list key vocabulary."


def run_psql(sql: str, quiet: bool = True) -> str:
    cmd = ["psql", "-d", DB_NAME, "-U", DB_USER, "-v", "ON_ERROR_STOP=1", "-At"]
    if quiet:
        cmd.append("-q")
    result = subprocess.run(
        cmd,
        input=sql,
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip())
    return result.stdout.strip()


def dollar_quote(value: str) -> str:
    tag = "DQ"
    while tag in value:
        tag = f"DQ{int(time.time() * 1000)}"
        time.sleep(0.001)
    return f"${tag}$" + value + f"${tag}$"


def ensure_pipeline_tables() -> None:
    run_psql(
        """
        CREATE TABLE IF NOT EXISTS pipeline_runs (
            id BIGSERIAL PRIMARY KEY,
            command TEXT NOT NULL,
            status TEXT NOT NULL,
            started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            finished_at TIMESTAMP,
            notes TEXT
        );
        CREATE TABLE IF NOT EXISTS pipeline_events (
            id BIGSERIAL PRIMARY KEY,
            run_id BIGINT REFERENCES pipeline_runs(id),
            event_type TEXT NOT NULL,
            status TEXT NOT NULL,
            file_path TEXT,
            message TEXT,
            metadata JSONB,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """
    )


def start_run(command: str) -> int:
    run_id = run_psql(
        f"INSERT INTO pipeline_runs (command, status) VALUES ({dollar_quote(command)}, 'running') RETURNING id;"
    )
    return int(run_id)


def finish_run(run_id: int, status: str, notes: str = "") -> None:
    run_psql(
        f"UPDATE pipeline_runs SET status = {dollar_quote(status)}, finished_at = CURRENT_TIMESTAMP, notes = {dollar_quote(notes)} WHERE id = {run_id};"
    )


def log_event(run_id: int, event_type: str, status: str, file_path: str = "", message: str = "", metadata: Optional[dict] = None) -> None:
    metadata_json = json.dumps(metadata or {})
    run_psql(
        """
        INSERT INTO pipeline_events (run_id, event_type, status, file_path, message, metadata)
        VALUES (
            {run_id},
            {event_type},
            {status},
            {file_path},
            {message},
            {metadata}
        );
        """.format(
            run_id=run_id,
            event_type=dollar_quote(event_type),
            status=dollar_quote(status),
            file_path=dollar_quote(file_path),
            message=dollar_quote(message),
            metadata=dollar_quote(metadata_json),
        )
    )


def ensure_index_dir() -> None:
    Path(INDEX_FILE).parent.mkdir(parents=True, exist_ok=True)


def build_tree(dir_path: str, base: str = ROOT_DIR) -> dict:
    stat = os.stat(dir_path)
    rel = os.path.relpath(dir_path, base)
    node = {
        "path": dir_path,
        "rel": rel if rel != "." else ".",
        "type": "folder" if os.path.isdir(dir_path) else "file",
        "name": os.path.basename(dir_path),
    }
    if os.path.isdir(dir_path):
        items = [n for n in os.listdir(dir_path) if not n.startswith(".")]
        node["children"] = [build_tree(os.path.join(dir_path, n), base) for n in items]
    return node


def index_pdf(pdf_path: str) -> dict:
    pdf_file_name = os.path.basename(pdf_path)
    pdf_dir = os.path.dirname(pdf_path)
    book_root = os.path.dirname(pdf_dir)
    base_name = re.sub(r"\.pdf$", "", pdf_file_name, flags=re.IGNORECASE)

    txt_dir = os.path.join(book_root, "txt")
    has_txt = False
    txt_path = None
    if os.path.exists(txt_dir):
        txt_files = os.listdir(txt_dir)
        matching_txt = next((f for f in txt_files if f.startswith(base_name) and f.endswith(".txt")), None)
        if matching_txt:
            has_txt = True
            txt_path = os.path.join(txt_dir, matching_txt)

    ai_dir = os.path.join(book_root, "ai")
    has_ai = False
    ai_path = None
    if os.path.exists(ai_dir):
        ai_files = os.listdir(ai_dir)
        matching_ai = next((f for f in ai_files if f.startswith("AI_" + base_name) and f.endswith(".txt")), None)
        if matching_ai:
            has_ai = True
            ai_path = os.path.join(ai_dir, matching_ai)

    return {
        "pdfPath": pdf_path,
        "hasTxt": has_txt,
        "txtPath": txt_path,
        "hasAi": has_ai,
        "aiPath": ai_path,
    }


def parse_page_num(file_name: str) -> int:
    match = re.search(r"(\d+)(?!.*\d)", file_name)
    if not match:
        return 0
    try:
        return int(match.group(1))
    except ValueError:
        return 0


def file_md5(path: str) -> str:
    md5 = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            md5.update(chunk)
    return md5.hexdigest()


def upsert_raw_data(content_type: str, file_path: str, book_name: str, page_num: int, directory: str, content_txt: Optional[str], parent_txt_id: Optional[int] = None) -> int:
    file_name = os.path.basename(file_path)
    size = os.path.getsize(file_path) if os.path.exists(file_path) else None
    md5_hash = file_md5(file_path) if os.path.exists(file_path) else None
    existing_id = run_psql(
        """
        SELECT id FROM raw_data
        WHERE file_path = {file_path} AND content_type = {content_type}
        ORDER BY id DESC LIMIT 1;
        """.format(
            file_path=dollar_quote(file_path),
            content_type=dollar_quote(content_type),
        )
    )
    content_txt_val = dollar_quote(content_txt or "")
    if existing_id:
        update_sql = """
            UPDATE raw_data
            SET content_txt = {content_txt},
                file_name = {file_name},
                book_name = {book_name},
                page_num = {page_num},
                directory = {directory},
                file_size = {file_size},
                md5_hash = {md5_hash},
                parent_txt_id = {parent_txt_id}
            WHERE id = {id}
            RETURNING id;
        """.format(
            content_txt=content_txt_val,
            file_name=dollar_quote(file_name),
            book_name=dollar_quote(book_name),
            page_num=page_num,
            directory=dollar_quote(directory),
            file_size="NULL" if size is None else size,
            md5_hash="NULL" if md5_hash is None else dollar_quote(md5_hash),
            parent_txt_id="NULL" if parent_txt_id is None else parent_txt_id,
            id=int(existing_id),
        )
        updated_id = run_psql(update_sql)
        return int(updated_id)

    insert_sql = """
        INSERT INTO raw_data (content_txt, content_type, file_name, file_path, book_name, page_num, directory, file_size, md5_hash, parent_txt_id)
        VALUES ({content_txt}, {content_type}, {file_name}, {file_path}, {book_name}, {page_num}, {directory}, {file_size}, {md5_hash}, {parent_txt_id})
        RETURNING id;
    """.format(
        content_txt=content_txt_val,
        content_type=dollar_quote(content_type),
        file_name=dollar_quote(file_name),
        file_path=dollar_quote(file_path),
        book_name=dollar_quote(book_name),
        page_num=page_num,
        directory=dollar_quote(directory),
        file_size="NULL" if size is None else size,
        md5_hash="NULL" if md5_hash is None else dollar_quote(md5_hash),
        parent_txt_id="NULL" if parent_txt_id is None else parent_txt_id,
    )
    inserted_id = run_psql(insert_sql)
    return int(inserted_id)


def ensure_source_material(file_path: str, file_name: str, directory: str) -> None:
    exists = run_psql(
        "SELECT 1 FROM de_source_materials WHERE file_path = {file_path} LIMIT 1;".format(
            file_path=dollar_quote(file_path)
        )
    )
    if exists:
        return
    run_psql(
        """
        INSERT INTO de_source_materials (file_path, file_name, directory)
        VALUES ({file_path}, {file_name}, {directory});
        """.format(
            file_path=dollar_quote(file_path),
            file_name=dollar_quote(file_name),
            directory=dollar_quote(directory),
        )
    )


def ensure_ai_response(file_path: str, file_name: str, directory: str, origin_file: str) -> None:
    exists = run_psql(
        "SELECT 1 FROM de_ai_responses WHERE file_path = {file_path} LIMIT 1;".format(
            file_path=dollar_quote(file_path)
        )
    )
    if exists:
        return
    run_psql(
        """
        INSERT INTO de_ai_responses (file_path, file_name, directory, origin_file)
        VALUES ({file_path}, {file_name}, {directory}, {origin_file});
        """.format(
            file_path=dollar_quote(file_path),
            file_name=dollar_quote(file_name),
            directory=dollar_quote(directory),
            origin_file=dollar_quote(origin_file),
        )
    )


def ensure_source_files(file_path: str, file_name: str, directory: str, ai_file: Optional[str]) -> None:
    exists = run_psql(
        "SELECT 1 FROM source_files WHERE file_path = {file_path} LIMIT 1;".format(
            file_path=dollar_quote(file_path)
        )
    )
    if exists:
        return
    run_psql(
        """
        INSERT INTO source_files (file_path, file_name, directory, ai_file)
        VALUES ({file_path}, {file_name}, {directory}, {ai_file});
        """.format(
            file_path=dollar_quote(file_path),
            file_name=dollar_quote(file_name),
            directory=dollar_quote(directory),
            ai_file="NULL" if not ai_file else dollar_quote(ai_file),
        )
    )


def upsert_materials_registry(entry: dict, run_id: int) -> None:
    pdf_path = entry["pdfPath"]
    book_root = Path(pdf_path).parent.parent
    book_name = str(book_root.relative_to(ROOT_DIR)).replace("\\", "/")
    directory = str(book_root)
    file_name = os.path.basename(pdf_path)
    page_num = parse_page_num(file_name)
    txt_path = entry.get("txtPath")
    ai_path = entry.get("aiPath")
    has_txt = bool(entry.get("hasTxt"))
    has_ai = bool(entry.get("hasAi"))
    has_pdf = True

    raw_txt_id = None
    raw_ai_id = None

    if txt_path and os.path.exists(txt_path):
        with open(txt_path, "r", encoding="utf-8", errors="ignore") as f:
            content_txt = f.read()
        raw_txt_id = upsert_raw_data("txt", txt_path, book_name, page_num, directory, content_txt)
        ensure_source_material(txt_path, os.path.basename(txt_path), directory)

    if ai_path and os.path.exists(ai_path):
        with open(ai_path, "r", encoding="utf-8", errors="ignore") as f:
            content_ai = f.read()
        raw_ai_id = upsert_raw_data("ai", ai_path, book_name, page_num, directory, content_ai, parent_txt_id=raw_txt_id)
        ensure_ai_response(ai_path, os.path.basename(ai_path), directory, txt_path or "")

    if txt_path:
        ensure_source_files(txt_path, os.path.basename(txt_path), directory, ai_path)

    registry_sql = """
        INSERT INTO materials_registry (
            book_name, page_num, directory, pdf_path, txt_path, ai_path,
            raw_data_txt_id, raw_data_ai_id, has_txt, has_ai, has_pdf
        ) VALUES (
            {book_name}, {page_num}, {directory}, {pdf_path}, {txt_path}, {ai_path},
            {raw_txt_id}, {raw_ai_id}, {has_txt}, {has_ai}, {has_pdf}
        )
        ON CONFLICT (book_name, page_num) DO UPDATE SET
            directory = EXCLUDED.directory,
            pdf_path = EXCLUDED.pdf_path,
            txt_path = EXCLUDED.txt_path,
            ai_path = EXCLUDED.ai_path,
            raw_data_txt_id = COALESCE(EXCLUDED.raw_data_txt_id, materials_registry.raw_data_txt_id),
            raw_data_ai_id = COALESCE(EXCLUDED.raw_data_ai_id, materials_registry.raw_data_ai_id),
            has_txt = EXCLUDED.has_txt,
            has_ai = EXCLUDED.has_ai,
            has_pdf = EXCLUDED.has_pdf;
    """.format(
        book_name=dollar_quote(book_name),
        page_num=page_num,
        directory=dollar_quote(directory),
        pdf_path=dollar_quote(pdf_path),
        txt_path="NULL" if not txt_path else dollar_quote(txt_path),
        ai_path="NULL" if not ai_path else dollar_quote(ai_path),
        raw_txt_id="NULL" if raw_txt_id is None else raw_txt_id,
        raw_ai_id="NULL" if raw_ai_id is None else raw_ai_id,
        has_txt="TRUE" if has_txt else "FALSE",
        has_ai="TRUE" if has_ai else "FALSE",
        has_pdf="TRUE" if has_pdf else "FALSE",
    )
    run_psql(registry_sql)
    log_event(run_id, "index", "ok", pdf_path, "Indexed PDF", {
        "book_name": book_name,
        "page_num": page_num,
        "txt_path": txt_path,
        "ai_path": ai_path,
    })


def run_indexer(run_id: int) -> None:
    if not os.path.exists(ROOT_DIR):
        raise FileNotFoundError(f"Root directory {ROOT_DIR} does not exist.")
    ensure_index_dir()
    root_tree = build_tree(ROOT_DIR)
    index_entries = []

    def walk(node: dict) -> None:
        if node and node.get("type") == "folder" and node.get("children"):
            for child in node["children"]:
                walk(child)
        elif node and node.get("path"):
            ext = os.path.splitext(node["path"])[1].lower()
            if ext == ".pdf" and os.path.basename(os.path.dirname(node["path"])) == "pdf":
                res = index_pdf(node["path"])
                index_entries.append({
                    **res,
                    "name": node.get("name"),
                    "rel": node.get("rel")
                })

    walk(root_tree)
    with open(INDEX_FILE, "w", encoding="utf-8") as f:
        json.dump(index_entries, f, indent=2)

    for entry in index_entries:
        upsert_materials_registry(entry, run_id)


def extract_answers(run_id: int) -> None:
    course_ids = [1, 2, 4, 5, 6, 8]
    for curso_id in course_ids:
        losung_sql = """
            SELECT texto_extraido FROM archivos
            WHERE tipo = 'ocr' AND curso_id = {curso_id} AND texto_extraido LIKE '%Lösungsschlüssel%'
            ORDER BY pagina DESC LIMIT 1;
        """.format(curso_id=curso_id)
        losung_text = run_psql(losung_sql)
        if not losung_text:
            log_event(run_id, "extract_answers", "skip", "", f"Course {curso_id}: no Lösungen found")
            continue

        answers = []
        lines = losung_text.split("\n")
        for line in lines:
            match = re.match(r"^([a-zA-Z0-9]+)\.\s+(.+)", line)
            if match and 2 < len(match.group(2)) < 100:
                answers.append(match.group(1).lower() + ". " + match.group(2)[:80])

        log_event(run_id, "extract_answers", "ok", "", f"Course {curso_id}: found {len(answers)} answers")

        exercises_sql = """
            SELECT id, pregunta FROM parsed_exercises
            WHERE curso_id = {curso_id} AND respuesta IS NULL
            ORDER BY id LIMIT {limit};
        """.format(curso_id=curso_id, limit=len(answers))
        exercise_ids = run_psql(exercises_sql)
        if not exercise_ids:
            continue
        ids = [int(x.split("|")[0]) for x in exercise_ids.split("\n") if x.strip()]
        for i, ex_id in enumerate(ids):
            if i >= len(answers):
                break
            update_sql = """
                UPDATE parsed_exercises SET respuesta = {respuesta} WHERE id = {id};
            """.format(respuesta=dollar_quote(answers[i]), id=ex_id)
            run_psql(update_sql)

    count_sql = "SELECT COUNT(*) FROM parsed_exercises WHERE respuesta IS NOT NULL AND respuesta != '';"
    count = run_psql(count_sql)
    log_event(run_id, "extract_answers", "ok", "", f"Total with answers: {count}")


def call_ollama(prompt: str) -> str:
    payload = {
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "system": OLLAMA_SYSTEM,
        "stream": False,
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(OLLAMA_URL, data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        body = resp.read().decode("utf-8")
    response_json = json.loads(body)
    return response_json.get("response", "")


def run_ai_runner(run_id: int, target_dir: str) -> None:
    target_dir = os.path.expanduser(target_dir)
    for root, _, files in os.walk(target_dir):
        for name in files:
            if not name.endswith(".txt"):
                continue
            if name.startswith("AI_"):
                continue
            file_path = os.path.join(root, name)
            log_event(run_id, "ai_runner", "processing", file_path, "Processing")
            try:
                with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                    content = f.read()
                response = call_ollama(content)
                base_name = os.path.splitext(name)[0]
                output_file = os.path.join(root, f"AI_{base_name}.txt")
                with open(output_file, "w", encoding="utf-8") as f:
                    f.write(response)

                book_root = Path(root)
                while book_root != Path(ROOT_DIR) and book_root.parent != Path(ROOT_DIR):
                    book_root = book_root.parent
                book_name = str(book_root.relative_to(ROOT_DIR)).replace("\\", "/") if book_root != Path(ROOT_DIR) else ""
                page_num = parse_page_num(name)
                directory = str(book_root)

                raw_txt_id = None
                if os.path.exists(file_path):
                    raw_txt_id = upsert_raw_data("txt", file_path, book_name, page_num, directory, content)

                raw_ai_id = upsert_raw_data("ai", output_file, book_name, page_num, directory, response, parent_txt_id=raw_txt_id)
                ensure_ai_response(output_file, os.path.basename(output_file), directory, file_path)

                registry_sql = """
                    UPDATE materials_registry
                    SET ai_path = {ai_path}, raw_data_ai_id = {raw_ai_id}, has_ai = TRUE
                    WHERE txt_path = {txt_path};
                """.format(
                    ai_path=dollar_quote(output_file),
                    raw_ai_id=raw_ai_id,
                    txt_path=dollar_quote(file_path),
                )
                run_psql(registry_sql)

                log_event(run_id, "ai_runner", "ok", output_file, "Saved AI response")
            except (urllib.error.URLError, urllib.error.HTTPError) as e:
                log_event(run_id, "ai_runner", "error", file_path, str(e))
            except Exception as e:
                log_event(run_id, "ai_runner", "error", file_path, str(e))


def run_services(run_id: int, frontend_dir: str, backend_dir: str) -> None:
    backend_cmd = ["node", "server2.js"]
    frontend_cmd = ["npm", "run", "dev", "--", "--host"]

    backend_log = "/tmp/deutsch_backend.log"
    frontend_log = "/tmp/deutsch_frontend.log"

    with open(backend_log, "w") as be_log, open(frontend_log, "w") as fe_log:
        backend_proc = subprocess.Popen(backend_cmd, cwd=backend_dir, stdout=be_log, stderr=be_log)
        time.sleep(1.5)
        log_event(run_id, "service", "started", backend_dir, f"Backend PID {backend_proc.pid}")

        frontend_proc = subprocess.Popen(frontend_cmd, cwd=frontend_dir, stdout=fe_log, stderr=fe_log)
        time.sleep(2.5)
        log_event(run_id, "service", "started", frontend_dir, f"Frontend PID {frontend_proc.pid}")

        try:
            while True:
                time.sleep(1)
                if backend_proc.poll() is not None or frontend_proc.poll() is not None:
                    break
        except KeyboardInterrupt:
            pass
        finally:
            if backend_proc.poll() is None:
                backend_proc.terminate()
            if frontend_proc.poll() is None:
                frontend_proc.terminate()
            log_event(run_id, "service", "stopped", "", "Services stopped")


def main() -> None:
    parser = argparse.ArgumentParser(description="Deutsch App Master Controller")
    parser.add_argument("command", choices=["index", "ai", "extract-answers", "serve", "all"])
    parser.add_argument("--target-dir", default="~/deutsch-app/de", help="Directory to scan for .txt files")
    parser.add_argument("--frontend-dir", default="/home/f/deutsch-app/frontend-app", help="Frontend directory")
    parser.add_argument("--backend-dir", default="/home/f/deutsch-app/backend", help="Backend directory")
    args = parser.parse_args()

    ensure_pipeline_tables()
    run_id = start_run(args.command)

    try:
        if args.command == "index":
            run_indexer(run_id)
        elif args.command == "ai":
            run_ai_runner(run_id, args.target_dir)
        elif args.command == "extract-answers":
            extract_answers(run_id)
        elif args.command == "serve":
            run_services(run_id, args.frontend_dir, args.backend_dir)
        elif args.command == "all":
            run_indexer(run_id)
            run_ai_runner(run_id, args.target_dir)
            extract_answers(run_id)

        finish_run(run_id, "ok", "Completed")
    except Exception as e:
        finish_run(run_id, "error", str(e))
        raise


if __name__ == "__main__":
    main()
