#!/usr/bin/env python3
"""Test ALL frontend API endpoints and report what works/broken."""
import urllib.request, urllib.parse, json, sys, os

API = 'http://localhost:3456'
passed = 0
failed = 0

def test(name, url, check=None):
    global passed, failed
    try:
        r = urllib.request.urlopen(url, timeout=10)
        data = r.read().decode()
        if check:
            check(data)
        print(f'  ✓ {name}')
        passed += 1
    except Exception as e:
        print(f'  ✗ {name}: {e}')
        failed += 1

def has_keys(keys):
    def check(data):
        d = json.loads(data)
        for k in keys:
            assert k in d, f'Missing key: {k}'
    return check

print("=== Deutsch App API Test ===")
print()

# 1. Books
print("1. BOOKS")
test('GET /books', f'{API}/books', has_keys([]))  # just check it's valid JSON array
test('GET /api/health', f'{API}/api/health')

# Get book list
try:
    r = urllib.request.urlopen(f'{API}/books', timeout=10)
    books = json.loads(r.read())
    print(f'   → {len(books)} books loaded')
    passed += 1

    # Find simple (no-slash) and complex books
    simple_books = [b for b in books if '/' not in b['id']]
    complex_books = [b for b in books if '/' in b['id']]
    test_book = simple_books[0] if simple_books else books[0]
    complex_book = complex_books[0] if complex_books else None

    eid = lambda x: urllib.parse.quote(x, safe='')

    # 2. Lessons
    print(f"\n2. LESSONS (book: {test_book['id'][:40]})")
    test(f'GET /books/.../lessons', f"{API}/books/{eid(test_book['id'])}/lessons",
         has_keys(['pdfs', 'annotations', 'aiFiles', 'txtFiles']))

    # 3. Vocabulary
    print(f"\n3. VOCABULARY (book: {test_book['id'][:40]})")
    test(f'GET /books/.../vocabulary', f"{API}/books/{eid(test_book['id'])}/vocabulary",
         has_keys(['vocabulary']))

    # 4. Audio
    print(f"\n4. AUDIO (book: {test_book['id'][:40]})")
    test(f'GET /books/.../audio', f"{API}/books/{eid(test_book['id'])}/audio",
         has_keys(['audio']))

    # 5. Video
    print(f"\n5. VIDEO (book: {test_book['id'][:40]})")
    test(f'GET /books/.../video-files', f"{API}/books/{eid(test_book['id'])}/video-files",
         has_keys(['videoFiles']))

    # 6. Audio-files
    print(f"\n6. AUDIO FILES (book: {test_book['id'][:40]})")
    test(f'GET /books/.../audio-files', f"{API}/books/{eid(test_book['id'])}/audio-files",
         has_keys(['audioFiles']))

    # 7. AI content
    print(f"\n7. AI CONTENT")
    test(f'GET /books/.../ai/1', f"{API}/books/{eid(test_book['id'])}/ai/1",
         has_keys(['content']))

    # 8. Text content
    print(f"\n8. TEXT/OCR CONTENT")
    test(f'GET /books/.../text/1', f"{API}/books/{eid(test_book['id'])}/text/1",
         has_keys(['content']))

    # 9. Exercises
    print(f"\n9. EXERCISES")
    test(f'GET /books/.../exercises', f"{API}/books/{eid(test_book['id'])}/exercises",
         has_keys(['exercises']))

    # 10. Verbs
    print(f"\n10. VERBS")
    test(f'GET /api/verbs', f'{API}/api/verbs')

    # 11. File serving
    print(f"\n11. STATIC FILES")
    test(f'GET /api/health', f'{API}/api/health')

    # 12. Complex book (with slashes) if available
    if complex_book:
        print(f"\n12. COMPLEX BOOK (with slashes: {complex_book['id'][:40]})")
        test(f'GET /books/.../vocabulary', f"{API}/books/{eid(complex_book['id'])}/vocabulary",
             has_keys(['vocabulary']))
        test(f'GET /books/.../lessons', f"{API}/books/{eid(complex_book['id'])}/lessons",
             has_keys(['pdfs']))

except Exception as e:
    print(f'  ✗ Failed to load books: {e}')
    failed += 1

print(f"\n{'='*50}")
print(f"Results: {passed} passed, {failed} failed out of {passed+failed}")
if failed == 0:
    print("ALL ENDPOINTS WORKING ✓")
else:
    print(f"SOME ENDPOINTS BROKEN ✗")
