#!/mnt/storage/venv/bin/python
"""
German plural formation engine. Handles all plural patterns:
  - Suffix only: -e, -er, -en, -n, -s, -se
  - Umlaut + suffix: a->ä + -e, o->ö + -er, u->ü + -en, etc.
  - No change (hyphen/-): article switches to 'die'
  - Irregular: explicit plural_form overrides
  - Edge cases: words ending in -e, -er, -el, -chen, -lein
"""
import sys, json, re, os

UMLAUT_MAP = {
    'ä': ('a', 'au'), 'Ä': ('A', 'Au'),
    'ö': ('o', 'Ö'),  'Ö': ('O',),
    'ü': ('u', 'Ü'),  'Ü': ('U',),
}

def apply_umlaut(word: str, umlaut_char: str) -> str:
    if not umlaut_char:
        return word
    mapping = UMLAUT_MAP.get(umlaut_char)
    if not mapping:
        return word
    word_lower = word.lower()
    for src in mapping:
        src_lower = src.lower()
        if src_lower == 'au' and 'au' in word_lower:
            idx = word_lower.rfind('au')
            before = word[:idx]
            au_part = word[idx:idx+2]
            after = word[idx+2:]
            new_au = 'äu' if au_part.islower() else ('Äu' if au_part[0].isupper() and au_part[1].islower() else 'ÄU')
            return before + new_au + after
        if src_lower in word_lower:
            idx = word_lower.rfind(src_lower)
            target = umlaut_char.upper() if word[idx].isupper() else umlaut_char
            return word[:idx] + target + word[idx+1:]
    return word

def build_plural(word: str, article: str, umlaut: str, suffix: str) -> str:
    if suffix in ('-', '–', '—', ''):
        return word
    result = apply_umlaut(word, umlaut)
    if suffix.startswith('er') or suffix.startswith('er'):
        result += suffix
    elif suffix.startswith('e') and word.endswith('e') and len(word) > 1:
        result = result[:-1] + suffix
    elif suffix == 'n' and word.endswith('e') and len(word) > 1:
        result = result + 'n'
    elif suffix == 'en' and word.endswith('e') and len(word) > 1:
        if word.endswith('in'):
            result += 'nen'
        else:
            result = result[:-1] + 'en'
    elif suffix == 's':
        result += 's'
    elif suffix.startswith('e') and not word.endswith('e'):
        result += suffix
    else:
        result += suffix
    if umlaut and not suffix:
        result = apply_umlaut(word, umlaut)
    return result

def plural_pattern_to_text(umlaut: str, suffix: str) -> str:
    parts = []
    if umlaut:
        parts.append(f"Umlaut {umlaut}")
    if suffix and suffix not in ('-', '–'):
        if suffix.startswith('er'):
            parts.append(f"+{suffix}")
        elif suffix.startswith('e'):
            parts.append(f"+{suffix}")
        elif suffix.startswith('en'):
            parts.append(f"+{suffix}")
        elif suffix == 'n':
            parts.append(f"+{suffix}")
        elif suffix == 's':
            parts.append(f"+{suffix}")
        elif suffix == 'se':
            parts.append(f"+{suffix}")
        else:
            parts.append(f"+{suffix}")
    if not parts:
        parts.append("= Singular")
    return " ".join(parts)

def plural_rule_explanation(article: str, word: str, umlaut: str, suffix: str) -> str:
    if suffix in ('-', '–'):
        return f"Plural gleich (Artikel → die): {word}"
    if umlaut and suffix:
        return f"Vokaländerung ({umlaut}) + Endung {suffix}"
    if umlaut:
        return f"Vokaländerung ({umlaut})"
    if suffix:
        return f"Endung {suffix}"
    return "unregelmäßig"

# All German plural suffixes for reference
PLURAL_SUFFIXES = ['-', 'e', 'en', 'n', 'er', 's', 'se', 'nen', 'ie']
UMLAUT_CHARS = ['ä', 'ö', 'ü', 'Ä', 'Ö', 'Ü']

if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == 'build':
        word = sys.argv[2] if len(sys.argv) > 2 else ''
        article = sys.argv[3] if len(sys.argv) > 3 else ''
        umlaut = sys.argv[4] if len(sys.argv) > 4 else ''
        suffix = sys.argv[5] if len(sys.argv) > 5 else ''
        result = build_plural(word, article, umlaut, suffix)
        print(json.dumps({
            'singular': f"{article} {word}" if article else word,
            'plural': f"die {result}",
            'umlaut': umlaut,
            'suffix': suffix,
            'pattern': plural_pattern_to_text(umlaut, suffix),
            'explanation': plural_rule_explanation(article, word, umlaut, suffix),
        }, ensure_ascii=False))
    elif len(sys.argv) > 1 and sys.argv[1] == 'parse':
        text = sys.argv[2] if len(sys.argv) > 2 else ''
        from import_goethe_wortschatz import parse_noun_plural, build_plural
        info = parse_noun_plural(text)
        plural = build_plural(info['word'], '', info.get('umlaut',''), info.get('suffix',''))
        print(json.dumps({**info, 'plural_form': plural}, ensure_ascii=False))
    else:
        print(json.dumps({"error": "Usage: plural_engine.py build <word> <article> <umlaut> <suffix>"}))
