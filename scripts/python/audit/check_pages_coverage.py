#!/usr/bin/env python3
"""Audit PDF -> page image coverage and size totals."""

import argparse
import os
import re


def norm(s: str) -> str:
    s = s.lower()
    s = re.sub(r'[^a-z0-9]+', '_', s)
    s = re.sub(r'_+', '_', s).strip('_')
    return s


def count_files(dir_path, exts):
    return len([f for f in os.listdir(dir_path) if f.lower().endswith(exts)])


def dir_size(dir_path):
    total = 0
    for root, _, files in os.walk(dir_path):
        for f in files:
            try:
                total += os.path.getsize(os.path.join(root, f))
            except FileNotFoundError:
                pass
    return total


def human(n):
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if n < 1024:
            return f"{n:.1f}{unit}"
        n /= 1024
    return f"{n:.1f}PB"


def main():
    parser = argparse.ArgumentParser(description='Audit pages coverage')
    parser.add_argument('--de', default='/home/f/deutsch-app/de', help='Courses base dir')
    parser.add_argument('--pages', default='/home/f/deutsch-app/pages', help='Pages base dir')
    parser.add_argument('--sample', type=int, default=10, help='Sample size')
    args = parser.parse_args()

    pdf_dirs = []
    for dirpath, _, _ in os.walk(args.de):
        if os.path.basename(dirpath).lower() == 'pdf':
            pdf_dirs.append(dirpath)

    pages_dirs = [d for d in os.listdir(args.pages) if os.path.isdir(os.path.join(args.pages, d))]
    pages_map = {}
    for d in pages_dirs:
        pages_map[norm(d)] = d

    matched = []
    missing_pages = []

    for pdf_dir in pdf_dirs:
        rel = os.path.relpath(pdf_dir, args.de)
        rel_no_pdf = os.path.dirname(rel)
        key = norm(rel_no_pdf)
        pages_dir = pages_map.get(key)
        if pages_dir:
            matched.append((pdf_dir, os.path.join(args.pages, pages_dir)))
        else:
            missing_pages.append(pdf_dir)

    unmatched_pages = []
    pdf_keys = {norm(os.path.dirname(os.path.relpath(d, args.de))) for d in pdf_dirs}
    for d in pages_dirs:
        if norm(d) not in pdf_keys:
            unmatched_pages.append(d)

    incomplete = []
    for pdf_dir, pages_dir in matched:
        pdf_count = count_files(pdf_dir, ('.pdf',))
        img_count = count_files(pages_dir, ('.png', '.jpg', '.jpeg'))
        if img_count < pdf_count:
            incomplete.append((pdf_dir, pages_dir, pdf_count, img_count))

    pages_size = dir_size(args.pages)
    pdf_size = 0
    for pdf_dir in pdf_dirs:
        for f in os.listdir(pdf_dir):
            if f.lower().endswith('.pdf'):
                try:
                    pdf_size += os.path.getsize(os.path.join(pdf_dir, f))
                except FileNotFoundError:
                    pass

    print('PDF dirs:', len(pdf_dirs))
    print('Pages dirs:', len(pages_dirs))
    print('Matched:', len(matched))
    print('Missing pages dirs:', len(missing_pages))
    print('Unmatched pages dirs:', len(unmatched_pages))
    print('Incomplete (images < pdf pages):', len(incomplete))
    print(f"Pages size: {human(pages_size)}")
    print(f"PDF size: {human(pdf_size)}")

    if missing_pages:
        print('\nSample missing pages dirs:')
        for d in missing_pages[:args.sample]:
            print('  ', d)

    if unmatched_pages:
        print('\nSample unmatched pages dirs:')
        for d in unmatched_pages[:args.sample]:
            print('  ', d)

    if incomplete:
        print('\nSample incomplete:')
        for item in incomplete[:args.sample]:
            print('  ', item)


if __name__ == '__main__':
    main()
