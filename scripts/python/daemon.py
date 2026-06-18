#!/usr/bin/env python3
"""Start backend and frontend as persistent daemon processes."""
import subprocess, sys, os, time, json, urllib.request

BACKEND_DIR = '/home/f/deutsch-app/backend'
FRONTEND_DIR = '/home/f/deutsch-app/app'
PORT_BE = 3456
PORT_FE = 5173

def start_daemon(cmd, cwd, logfile, name):
    with open(logfile, 'w') as log:
        proc = subprocess.Popen(
            cmd,
            cwd=cwd,
            stdout=log,
            stderr=log,
            start_new_session=True,
        )
    print(f'  {name}: PID {proc.pid}')
    return proc

def wait_for(url, name, timeout=8):
    for i in range(timeout):
        try:
            urllib.request.urlopen(url, timeout=2)
            print(f'  {name}: ready ✓')
            return True
        except Exception:
            time.sleep(1)
    print(f'  {name}: NOT ready ✗')
    return False

def test_endpoints():
    results = {}
    API = f'http://localhost:{PORT_BE}'
    
    # Books
    try:
        r = urllib.request.urlopen(f'{API}/books', timeout=5)
        books = json.loads(r.read())
        results['books'] = f'{len(books)} books'
        test_book = None
        for b in books:
            if '/' not in b['id']:
                test_book = b['id']
                break
        if not test_book:
            test_book = books[0]['id']
        
        eid = lambda x: urllib.parse.quote(x, safe='')
        import urllib.parse
        
        for ep, key in [('/vocabulary', 'vocabulary'), ('/lessons', 'pdfs'),
                         ('/audio', 'audio'), ('/video-files', 'videoFiles'),
                         ('/exercises', 'exercises')]:
            try:
                r2 = urllib.request.urlopen(f'{API}/books/{eid(test_book)}{ep}', timeout=5)
                d = json.loads(r2.read())
                items = d.get(key, [])
                results[key] = f'{len(items)} items'
            except Exception as ex:
                results[key] = f'ERROR: {ex}'
        
        # Verbs
        try:
            rv = urllib.request.urlopen(f'{API}/api/verbs', timeout=5)
            verbs = json.loads(rv.read())
            verbs_count = len(verbs) if isinstance(verbs, list) else len(verbs.get('verbs', []))
            results['verbs'] = f'{verbs_count} verbs'
        except Exception as ex:
            results['verbs'] = f'ERROR: {ex}'
            
    except Exception as ex:
        results['error'] = str(ex)
    
    return results

if __name__ == '__main__':
    import urllib.parse
    
    # Kill existing
    os.system(f'fuser -k {PORT_BE}/tcp 2>/dev/null')
    os.system(f'fuser -k {PORT_FE}/tcp 2>/dev/null')
    time.sleep(1)
    
    print('Building frontend...')
    env = os.environ.copy()
    env['VITE_API_URL'] = f'http://localhost:{PORT_BE}'
    env['VITE_PG_API_URL'] = f'http://localhost:{PORT_BE}'
    env['VITE_USE_PG'] = 'true'
    
    build = subprocess.run(
        ['npx', 'vite', 'build'],
        cwd=FRONTEND_DIR,
        env=env,
        capture_output=True, text=True
    )
    if build.returncode != 0:
        print(f'  BUILD FAILED: {build.stderr[:500]}')
        sys.exit(1)
    print(f'  Build OK ({len(build.stdout.splitlines())} lines)')
    
    print('Starting backend...')
    be = start_daemon(['node', 'server.js'], BACKEND_DIR, '/tmp/backend.log', 'Backend')
    wait_for(f'http://localhost:{PORT_BE}/api/health', 'Backend')
    
    print('Starting frontend...')
    fe = start_daemon(
        ['npx', 'vite', 'preview', '--port', str(PORT_FE), '--host'],
        FRONTEND_DIR, '/tmp/frontend.log', 'Frontend'
    )
    wait_for(f'http://localhost:{PORT_FE}', 'Frontend')
    
    print('\nTesting endpoints...')
    results = test_endpoints()
    for k, v in results.items():
        print(f'  {k}: {v}')
    
    print(f'\nPIDs: backend={be.pid} frontend={fe.pid}')
    print(f'Kill: kill {be.pid} {fe.pid}')
    print(f'Frontend: http://localhost:{PORT_FE}')
    print(f'Backend:  http://localhost:{PORT_BE}')
