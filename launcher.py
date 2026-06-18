#!/usr/bin/env python3
"""Deutsch Lern App — Desktop Launcher"""

import tkinter as tk
from tkinter import ttk, scrolledtext, filedialog
import subprocess, threading, time, os, signal, webbrowser, traceback, socket

BASE = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(BASE, 'backend')
FRONTEND_DIR = os.path.join(BASE, 'app')
ICON = os.path.join(FRONTEND_DIR, 'public', 'icons', 'icon-256.png')

BACKEND_PORT = 3456
FRONTEND_PORT = 5173

backend_proc = None
frontend_proc = None

def poll_server(port):
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(1)
    try:
        s.connect(('127.0.0.1', port))
        s.close()
        return True
    except:
        return False

def kill_by_port(port):
    import subprocess, signal
    try:
        result = subprocess.run(['ss', '-tlnp'], capture_output=True, text=True, timeout=5)
        for line in result.stdout.splitlines():
            if f':{port}' in line and 'users:' in line:
                import re
                pids = re.findall(r'pid=(\d+)', line)
                for pid in pids:
                    try:
                        os.kill(int(pid), signal.SIGTERM)
                        log(f'Killed PID {pid} on port {port}')
                    except:
                        pass
    except:
        pass

def make_context_menu(widget):
    menu = tk.Menu(widget, tearoff=0)
    menu.add_command(label='Ausschneiden', command=lambda: widget.event_generate('<<Cut>>'))
    menu.add_command(label='Kopieren', command=lambda: widget.event_generate('<<Copy>>'))
    menu.add_command(label='Einfügen', command=lambda: widget.event_generate('<<Paste>>'))
    menu.add_separator()
    menu.add_command(label='Alles auswählen', command=lambda: widget.event_generate('<<SelectAll>>'))
    return menu

_context_menus = {}
def show_context_menu(event, widget):
    if widget not in _context_menus:
        _context_menus[widget] = make_context_menu(widget)
    _context_menus[widget].tk_popup(event.x_root, event.y_root)

def update_status():
    be = poll_server(BACKEND_PORT)
    fe = poll_server(FRONTEND_PORT)
    be_label.config(text='● RUNNING' if be else '○ STOPPED', fg='#4ade80' if be else '#ef4444')
    fe_label.config(text='● RUNNING' if fe else '○ STOPPED', fg='#4ade80' if fe else '#ef4444')
    start_be_btn.config(state='disabled' if be else 'normal')
    stop_be_btn.config(state='normal' if be else 'disabled')
    start_fe_btn.config(state='disabled' if fe else 'normal')
    stop_fe_btn.config(state='normal' if fe else 'disabled')
    open_btn.config(state='normal' if fe else 'disabled')
    root.after(2000, update_status)

def log(msg):
    log_area.insert(tk.END, msg + '\n')
    log_area.see(tk.END)

def check_and_start_postgres():
    result = subprocess.run(
        ['pg_isready', '-h', '/var/run/postgresql', '-U', 'f'],
        capture_output=True, text=True)
    if result.returncode == 0:
        return True, "PostgreSQL läuft bereits"
    log('PostgreSQL nicht erreichbar — versuche Start...')
    result2 = subprocess.run(
        ['sudo', 'systemctl', 'start', 'postgresql@18-main'],
        capture_output=True, text=True)
    time.sleep(2)
    result3 = subprocess.run(
        ['pg_isready', '-h', '/var/run/postgresql', '-U', 'f'],
        capture_output=True, text=True)
    if result3.returncode == 0:
        return True, "PostgreSQL gestartet"
    return False, f"PostgreSQL Start fehlgeschlagen: {result2.stderr.strip()}"

def start_backend():
    global backend_proc
    def run():
        ok, msg = check_and_start_postgres()
        log(f'[pg] {msg}')
        if not ok:
            log('[pg] Backend-Start abgebrochen — keine Datenbank')
            return
        log('Starting backend...')
        proc = subprocess.Popen(
            ['node', 'server.js'],
            cwd=BACKEND_DIR,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            preexec_fn=os.setsid
        )
        backend_proc = proc
        for line in iter(proc.stdout.readline, b''):
            log(f'[backend] {line.decode().rstrip()}')
    threading.Thread(target=run, daemon=True).start()

def stop_backend():
    global backend_proc
    if backend_proc and backend_proc.poll() is None:
        try:
            os.killpg(os.getpgid(backend_proc.pid), signal.SIGTERM)
        except:
            try:
                os.kill(backend_proc.pid, signal.SIGTERM)
            except:
                pass
        try:
            backend_proc.wait(timeout=5)
        except:
            pass
    backend_proc = None
    kill_by_port(BACKEND_PORT)
    log('Backend stopped')

def start_frontend():
    global frontend_proc
    def run():
        log('Starting frontend...')
        proc = subprocess.Popen(
            ['npx', 'vite', 'preview', '--port', str(FRONTEND_PORT), '--host'],
            cwd=FRONTEND_DIR,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            preexec_fn=os.setsid
        )
        frontend_proc = proc
        for line in iter(proc.stdout.readline, b''):
            log(f'[frontend] {line.decode().rstrip()}')
    threading.Thread(target=run, daemon=True).start()

def stop_frontend():
    global frontend_proc
    if frontend_proc and frontend_proc.poll() is None:
        try:
            os.killpg(os.getpgid(frontend_proc.pid), signal.SIGTERM)
        except:
            try:
                os.kill(frontend_proc.pid, signal.SIGTERM)
            except:
                pass
        try:
            frontend_proc.wait(timeout=5)
        except:
            pass
    frontend_proc = None
    kill_by_port(FRONTEND_PORT)
    log('Frontend stopped')

def open_browser():
    webbrowser.open(f'http://localhost:{FRONTEND_PORT}')

def on_close():
    stop_backend()
    stop_frontend()
    root.destroy()

# --- GUI ---
root = tk.Tk()
root.title('Deutsch Lern App')
try:
    icon = tk.PhotoImage(file=ICON)
    root.iconphoto(True, icon)
except: pass

root.geometry('720x560')
root.minsize(600, 400)
root.configure(bg='#1a1a2e')

# Dark theme colors
BG = '#1a1a2e'
BG2 = '#16213e'
FG = '#e0e0e0'
ACCENT = '#e0a800'
GREEN = '#4ade80'
RED = '#ef4444'

# Header
header = tk.Frame(root, bg=BG, height=90)
header.pack(fill='x')
header.pack_propagate(False)

# Flag stripes
for color in ['#000', '#dd0000', '#ffce00']:
    bar = tk.Frame(header, bg=color, height=4)
    bar.pack(fill='x')

tk.Label(header, text='DEUTSCH LERN APP', font=('Helvetica', 22, 'bold'),
         fg=ACCENT, bg=BG).pack(pady=(14, 2))
tk.Label(header, text='German Language Learning Platform', font=('Helvetica', 10),
         fg='#888', bg=BG).pack()

# Main content
main = tk.Frame(root, bg=BG)
main.pack(fill='both', expand=True, padx=20, pady=(10, 12))

# Server status cards
card_frame = tk.Frame(main, bg=BG)
card_frame.pack(fill='x', pady=(0, 12))

def make_card(parent, title, port):
    card = tk.Frame(parent, bg=BG2, bd=1, relief='solid', highlightbackground='#2a2a4e', highlightthickness=1)
    card.pack(side='left', fill='x', expand=True, padx=(0, 8))
    tk.Label(card, text=title, font=('Helvetica', 11, 'bold'), fg=FG, bg=BG2).pack(anchor='w', padx=12, pady=(10, 2))
    tk.Label(card, text=f'port {port}', font=('Helvetica', 8), fg='#666', bg=BG2).pack(anchor='w', padx=12)
    return card

be_card = make_card(card_frame, 'Backend (API)', BACKEND_PORT)
be_label = tk.Label(be_card, text='○ STOPPED', font=('Helvetica', 10, 'bold'), fg=RED, bg=BG2)
be_label.pack(anchor='w', padx=12, pady=(2, 10))

fe_card = make_card(card_frame, 'Frontend (UI)', FRONTEND_PORT)
fe_label = tk.Label(fe_card, text='○ STOPPED', font=('Helvetica', 10, 'bold'), fg=RED, bg=BG2)
fe_label.pack(anchor='w', padx=12, pady=(2, 10))

# Action buttons
btn_frame = tk.Frame(main, bg=BG)
btn_frame.pack(fill='x', pady=(0, 10))

btn_style = {'font': ('Helvetica', 10), 'bd': 0, 'padx': 16, 'pady': 8, 'cursor': 'hand2'}

start_be_btn = tk.Button(btn_frame, text='▶ Start Backend', bg='#1b5e20', fg='#fff',
    activebackground='#2e7d32', activeforeground='#fff', command=start_backend, **btn_style)
start_be_btn.pack(side='left', padx=(0, 6))

stop_be_btn = tk.Button(btn_frame, text='■ Stop Backend', bg='#b71c1c', fg='#fff',
    activebackground='#c62828', activeforeground='#fff', command=stop_backend, state='disabled', **btn_style)
stop_be_btn.pack(side='left', padx=(0, 6))

start_fe_btn = tk.Button(btn_frame, text='▶ Start Frontend', bg='#1b5e20', fg='#fff',
    activebackground='#2e7d32', activeforeground='#fff', command=start_frontend, **btn_style)
start_fe_btn.pack(side='left', padx=(0, 6))

stop_fe_btn = tk.Button(btn_frame, text='■ Stop Frontend', bg='#b71c1c', fg='#fff',
    activebackground='#c62828', activeforeground='#fff', command=stop_frontend, state='disabled', **btn_style)
stop_fe_btn.pack(side='left', padx=(0, 6))

open_btn = tk.Button(btn_frame, text='🌐 Open Browser', bg='#0d47a1', fg='#fff',
    activebackground='#1565c0', activeforeground='#fff', command=open_browser, state='disabled', **btn_style)
open_btn.pack(side='left')

# --- Exercise Generator ---
ex_frame = tk.Frame(main, bg=BG2, bd=1, relief='solid', highlightbackground='#2a2a4e', highlightthickness=1)
ex_frame.pack(fill='x', pady=(0, 10))

ex_inner = tk.Frame(ex_frame, bg=BG2)
ex_inner.pack(fill='x', padx=12, pady=8)

tk.Label(ex_inner, text='🤖 Übungen generieren', font=('Helvetica', 11, 'bold'),
         fg=ACCENT, bg=BG2).pack(anchor='w')

ex_row = tk.Frame(ex_inner, bg=BG2)
ex_row.pack(fill='x', pady=(6, 0))

tk.Label(ex_row, text='Kurs:', font=('Helvetica', 9), fg=FG, bg=BG2).pack(side='left')
course_var = tk.StringVar(value='Lagune 1')
course_menu = ttk.Combobox(ex_row, textvariable=course_var, values=[
    'Lagune 1', 'Lagune 2', 'Lagune 3',
    'Tangram Aktuell 1', 'Tangram Aktuell 2', 'Tangram Aktuell 3',
    'Menschen A1', 'Menschen A2', 'EM B2', 'C1', 'ALL COURSES'
], width=18, state='readonly')
course_menu.pack(side='left', padx=(6, 12))

tk.Label(ex_row, text='Anzahl:', font=('Helvetica', 9), fg=FG, bg=BG2).pack(side='left')
count_var = tk.StringVar(value='6')
count_spin = tk.Spinbox(ex_row, from_=1, to=20, textvariable=count_var, width=4, font=('Helvetica', 9))
count_spin.pack(side='left', padx=(4, 12))

ex_btn = tk.Button(ex_row, text='▶ Generieren', bg='#e65100', fg='#fff',
    activebackground='#ef6c00', activeforeground='#fff',
    font=('Helvetica', 9, 'bold'), bd=0, padx=14, pady=4, cursor='hand2')
ex_btn.pack(side='left')

ex_status = tk.Label(ex_row, text='', font=('Helvetica', 8), fg='#aaa', bg=BG2)
ex_status.pack(side='left', padx=(10, 0))

def run_generate_exercises():
    course_name = course_var.get()
    try:
        count = int(count_var.get())
    except:
        count = 6

    def task():
        ex_btn.config(state='disabled', text='⏳ Läuft...')
        ex_status.config(text='Starte...')
        root.update()

        script = os.path.join(BASE, 'scripts', 'python', 'generate_exercises.py')

        log(f'=== DEBUG: Generating exercises ===')
        log(f'DEBUG: Selected course = {course_name}')
        log(f'DEBUG: Requested count = {count}')
        log(f'DEBUG: Script path = {script}')

        if course_name == 'ALL COURSES':
            cmd = [script, 'all']
        else:
            cmd = [script, course_name]
        log(f'DEBUG: Command = {cmd}')

        try:
            venv_python = os.path.join(BASE, 'scripts', '.venv', 'bin', 'python3')
            if os.path.exists(venv_python):
                cmd.insert(0, venv_python)
                log(f'DEBUG: Using venv python = {venv_python}')
            else:
                cmd.insert(0, 'python3')
                log(f'DEBUG: Using system python3 (no venv found at {venv_python})')

            log(f'=== Generating {count} exercises for {course_name} ===')
            log(f'DEBUG: Spawning subprocess: {cmd}')
            proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
            for line in iter(proc.stdout.readline, ''):
                if line:
                    log(f'[gen] {line.rstrip()}')
                    if 'OK:' in line:
                        ex_status.config(text=line.strip())
                    root.update()
            proc.wait()
            log(f'DEBUG: Subprocess exited with code {proc.returncode}')
            log(f'=== Done ===')
            ex_status.config(text='Fertig ✓')
        except Exception as e:
            log(f'[gen] ERROR: {traceback.format_exc()}')
            ex_status.config(text='Fehler!')
        finally:
            ex_btn.config(state='normal', text='▶ Generieren')

    threading.Thread(target=task, daemon=True).start()

ex_btn.config(command=run_generate_exercises)

# --- Mini Dictionary ---
dict_frame = tk.Frame(main, bg=BG2, bd=1, relief='solid', highlightbackground='#2a2a4e', highlightthickness=1)
dict_frame.pack(fill='x', pady=(0, 8))

dict_inner = tk.Frame(dict_frame, bg=BG2)
dict_inner.pack(fill='x', padx=12, pady=8)

tk.Label(dict_inner, text='📖 Mini Wörterbuch', font=('Helvetica', 11, 'bold'),
         fg=ACCENT, bg=BG2).pack(anchor='w')

dict_row = tk.Frame(dict_inner, bg=BG2)
dict_row.pack(fill='x', pady=(6, 0))

dict_lang_var = tk.StringVar(value='DE')
dict_lang_menu = ttk.Combobox(dict_row, textvariable=dict_lang_var, values=['DE', 'EN', 'ES', 'FR', 'PT'],
    width=5, state='readonly', font=('Helvetica', 9))
dict_lang_menu.pack(side='left', padx=(0, 6))

tk.Label(dict_row, text='Wort:', font=('Helvetica', 9), fg=FG, bg=BG2).pack(side='left')
dict_entry = tk.Entry(dict_row, font=('Helvetica', 10), bg='#0a0a1a', fg=FG,
                       insertbackground=FG, bd=1, relief='solid', width=18)
dict_entry.pack(side='left', padx=(6, 8))
dict_entry.bind('<Return>', lambda e: dict_lookup())
dict_entry.bind('<Button-3>', lambda e: show_context_menu(e, dict_entry))

dict_lookup_btn = tk.Button(dict_row, text='🔍 Übersetzen', bg='#0d47a1', fg='#fff',
    activebackground='#1565c0', activeforeground='#fff',
    font=('Helvetica', 9, 'bold'), bd=0, padx=14, pady=4, cursor='hand2')
dict_lookup_btn.pack(side='left')

dict_result = tk.Text(dict_inner, bg='#0a0a1a', fg='#ccc', font=('Courier', 9),
                       bd=0, height=5, relief='flat', wrap='word')
dict_result.pack(fill='x', pady=(6, 0))
dict_result.bind('<Button-3>', lambda e: show_context_menu(e, dict_result))

def dict_lookup():
    word = dict_entry.get().strip()
    lang = dict_lang_var.get()
    if not word:
        return
    dict_result.delete('1.0', tk.END)
    dict_result.insert(tk.END, f'[{lang}] Suche nach "{word}"...\n')
    dict_lookup_btn.config(state='disabled', text='⏳')
    root.update()

    def task():
        from urllib.request import urlopen
        from urllib.parse import quote
        import json, subprocess

        out_lines = []
        word_escaped = word.replace('"', '\\"')

        # 1) Local dictionary via API (DE ↔ EN)
        if lang in ('DE', 'EN'):
            from_code = 'de' if lang == 'DE' else 'en'
            to_code = 'en' if lang == 'DE' else 'de'
            try:
                url = f'http://localhost:{BACKEND_PORT}/api/dict/search?q={quote(word)}&from={from_code}&to={to_code}'
                resp = urlopen(url, timeout=10)
                data = json.loads(resp.read().decode())
                hits = data.get('results', [])
                if hits:
                    out_lines.append(f"📖 Lokales Wörterbuch ({len(hits)} Treffer):")
                    for h in hits[:8]:
                        src = h.get('source', '?')
                        tgt = h.get('target', '—')
                        art = h.get('artikel', '') or ''
                        typ = h.get('type', '') or ''
                        tag = f" {art}" if art else ""
                        tag += f" ({typ})" if typ else ""
                        out_lines.append(f"  {src}{tag}  →  {tgt}")
                else:
                    out_lines.append("⚠️ Keine lokalen Treffer")
            except Exception as e:
                out_lines.append(f"❌ API-Fehler: {e}")

        # 2) Google Translate for all pairs
        out_lines.append("")
        gt_code = {'DE': 'de', 'EN': 'en', 'ES': 'es', 'FR': 'fr', 'PT': 'pt'}[lang]
        code = fr"""
from deep_translator import GoogleTranslator
word = "{word_escaped}"
"""
        if lang == 'DE':
            # German → translate to EN, ES, FR, PT
            code += """
langs = {'EN':'en','ES':'es','FR':'fr','PT':'pt'}
for name,code in langs.items():
    try:
        t = GoogleTranslator(source='de',target=code).translate(word)
        print(f"🌐 {name}: {t}")
    except Exception as e:
        print(f"⚠️ {name}: Fehler")
"""
        else:
            # EN/ES/FR/PT → translate TO German
            code += f"""
try:
    t = GoogleTranslator(source='{gt_code}',target='de').translate(word)
    print(f"🌐 DE: {{t}}")
except Exception as e:
    print(f"⚠️ DE: Fehler")
"""

        try:
            result = subprocess.run(
                ['/home/f/parler_env/bin/python3', '-c', code],
                capture_output=True, text=True, timeout=15
            )
            gt_out = (result.stdout or result.stderr).strip()
            if gt_out:
                out_lines.append(gt_out)
        except Exception as e:
            out_lines.append(f"❌ Google: {e}")

        out_text = '\n'.join(out_lines).strip()
        dict_result.delete('1.0', tk.END)
        dict_result.insert(tk.END, out_text)
        dict_lookup_btn.config(state='normal', text='🔍 Übersetzen')

    threading.Thread(target=task, daemon=True).start()

dict_lookup_btn.config(command=dict_lookup)

# --- CSV Import ---
csv_frame = tk.Frame(main, bg=BG2, bd=1, relief='solid', highlightbackground='#2a2a4e', highlightthickness=1)
csv_frame.pack(fill='x', pady=(0, 8))

csv_inner = tk.Frame(csv_frame, bg=BG2)
csv_inner.pack(fill='x', padx=12, pady=8)

tk.Label(csv_inner, text='📥 Vokabeln aus CSV importieren', font=('Helvetica', 11, 'bold'),
         fg=ACCENT, bg=BG2).pack(anchor='w')

csv_row1 = tk.Frame(csv_inner, bg=BG2)
csv_row1.pack(fill='x', pady=(6, 0))

tk.Label(csv_row1, text='CSV-Datei:', font=('Helvetica', 9), fg=FG, bg=BG2).pack(side='left')
csv_path_var = tk.StringVar()
csv_path_entry = tk.Entry(csv_row1, textvariable=csv_path_var, font=('Helvetica', 9),
                           bg='#0a0a1a', fg=FG, insertbackground=FG, bd=1, relief='solid', width=35)
csv_path_entry.pack(side='left', padx=(6, 8))
csv_path_entry.bind('<Button-3>', lambda e: show_context_menu(e, csv_path_entry))

def csv_browse():
    path = filedialog.askopenfilename(title='CSV-Datei auswählen', filetypes=[('CSV files', '*.csv')])
    if path:
        csv_path_var.set(path)

csv_browse_btn = tk.Button(csv_row1, text='📂 Durchsuchen', bg='#37474f', fg='#fff',
    activebackground='#455a64', activeforeground='#fff',
    font=('Helvetica', 9, 'bold'), bd=0, padx=12, pady=4, cursor='hand2', command=csv_browse)
csv_browse_btn.pack(side='left')

csv_row2 = tk.Frame(csv_inner, bg=BG2)
csv_row2.pack(fill='x', pady=(6, 0))

tk.Label(csv_row2, text='Kurs:', font=('Helvetica', 9), fg=FG, bg=BG2).pack(side='left')
csv_course_var = tk.StringVar(value='Lagune 1')
csv_course_menu = ttk.Combobox(csv_row2, textvariable=csv_course_var, values=[
    'Lagune 1', 'Lagune 2', 'Lagune 3',
    'Tangram Aktuell 1', 'Tangram Aktuell 2', 'Tangram Aktuell 3',
    'Menschen A1', 'Menschen A2', 'EM B2', 'C1',
], width=18, state='readonly')
csv_course_menu.pack(side='left', padx=(6, 12))

tk.Label(csv_row2, text='Spalten: palabra,traduccion,english,french,plural,wortart,artikel', font=('Helvetica', 7), fg='#666', bg=BG2).pack(side='left')

csv_row3 = tk.Frame(csv_inner, bg=BG2)
csv_row3.pack(fill='x', pady=(6, 0))

csv_import_btn = tk.Button(csv_row3, text='▶ Importieren', bg='#e65100', fg='#fff',
    activebackground='#ef6c00', activeforeground='#fff',
    font=('Helvetica', 9, 'bold'), bd=0, padx=14, pady=4, cursor='hand2')
csv_import_btn.pack(side='left')

csv_status = tk.Label(csv_row3, text='', font=('Helvetica', 8), fg='#aaa', bg=BG2)
csv_status.pack(side='left', padx=(10, 0))

def run_csv_import():
    path = csv_path_var.get()
    if not path or not os.path.exists(path):
        csv_status.config(text='❌ Datei nicht gefunden!')
        return
    course_name = csv_course_var.get()

    def task():
        csv_import_btn.config(state='disabled', text='⏳ Importiere...')
        csv_status.config(text='')
        root.update()

        filepath = path
        book_name = course_name
        script = f"""
import psycopg2, csv, sys
conn = psycopg2.connect(host='/var/run/postgresql', user='f', dbname='deutsch')
cur = conn.cursor()
inserted = skipped = errors = 0
with open('{filepath}', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in reader:
        palabra = (row.get('palabra') or row.get('wort') or '').strip()
        if not palabra:
            continue
        try:
            cur.execute(
                "INSERT INTO vocabulario (palabra, artikel, wortart, traduccion, english, french, plural, kontext, source_file) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) "
                "ON CONFLICT DO NOTHING",
                (palabra,
                 row.get('artikel', ''),
                 row.get('wortart', ''),
                 row.get('traduccion') or row.get('ubersetzung_es', ''),
                 row.get('english', ''),
                 row.get('french', ''),
                 row.get('plural', ''),
                 row.get('kontext', ''),
                 'csv_import_{book_name}')
            )
            if cur.rowcount > 0:
                inserted += 1
            else:
                skipped += 1
        except Exception as e:
            errors += 1
conn.commit()
conn.close()
print(f"Inserted: {{inserted}} | Skipped: {{skipped}} | Errors: {{errors}}")
"""
        import subprocess
        result = subprocess.run(
            ['/home/f/parler_env/bin/python3', '-c', script],
            capture_output=True, text=True, timeout=60
        )
        out = (result.stdout or result.stderr).strip()
        csv_status.config(text=f'✅ {out}')
        log(f'CSV Import: {os.path.basename(path)} → {course_name}: {out}')
        csv_import_btn.config(state='normal', text='▶ Importieren')

    threading.Thread(target=task, daemon=True).start()

csv_import_btn.config(command=run_csv_import)

# Log area
log_label = tk.Label(main, text='Server Logs', font=('Helvetica', 9, 'bold'), fg='#888', bg=BG, anchor='w')
log_label.pack(fill='x')

log_area = scrolledtext.ScrolledText(main, bg='#0a0a1a', fg='#ccc', insertbackground='#ccc',
    font=('Courier', 9), bd=0, height=14, wrap='word')
log_area.pack(fill='both', expand=True)
log_area.insert(tk.END, 'Launcher ready. Start the backend and frontend servers below.\n')

# Footer
footer = tk.Frame(root, bg='#0d0d1a', height=28)
footer.pack(fill='x')
footer.pack_propagate(False)
tk.Label(footer, text='© Deutsch Lern App  —  v1.0', font=('Helvetica', 8), fg='#555', bg='#0d0d1a').pack()

# Start polling
update_status()
root.protocol('WM_DELETE_WINDOW', on_close)
root.mainloop()
