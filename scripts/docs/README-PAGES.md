# Pages Pipeline

Goal: convert PDFs to page images, OCR, AI annotations, then drop PDFs.

## Current layout

- Each book has `pdf/`, `txt/`, `ai/`, and now `pages/` next to the PDF folder.
- `/home/f/deutsch-app/pages` has been moved into each book folder.

## Coverage checks

Run:

```bash
./scripts/shell/check_pages_coverage.sh
```

This reports:
- missing `pages/` for any `pdf/`
- incomplete image sets (images < pdf pages)
- total size of pages vs pdfs

## Notes

- `delfin/pdf` currently has no `pages/` folder.
- Several Schritte books have incomplete image sets.
- Total sizes (current): pages ~6.5GB, pdf ~8.0GB
