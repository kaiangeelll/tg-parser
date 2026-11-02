"""
tgsearch.py — Smart multi-strategy search engine for Telegram channels.

Strategy:
  1. TGFind directory search (keyword/category based) — always runs first.
  2. Handle-guess probe via tgparser (direct t.me preview) — runs for name-style queries
     to find channels NOT in the TGFind index.
  3. Results are merged, deduplicated, and re-ranked locally.
"""

import json
import re
import time
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed

# ---------------------------------------------------------------------------
# Transliteration (RU → Latin) for generating latin variants of cyrillic names
# ---------------------------------------------------------------------------
_CYR2LAT = str.maketrans({
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd',
    'е': 'e', 'ё': 'yo', 'ж': 'zh', 'з': 'z', 'и': 'i',
    'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n',
    'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't',
    'у': 'u', 'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch',
    'ш': 'sh', 'щ': 'shch', 'ъ': '', 'ы': 'y', 'ь': '',
    'э': 'e', 'ю': 'yu', 'я': 'ya',
})
_STOP = {
    'найти', 'канал', 'каналы', 'тг', 'telegram', 'есть', 'такой', 'чел', 'мне',
    'покажи', 'поиск', 'ищу', 'пожалуйста', 'варианты', 'или', 'там', 'вот', 'что',
    'бы', 'как', 'кто', 'про', 'на', 'и', 'в', 'из', 'для', 'это', 'тот', 'тот',
    'по', 'со', 'за', 'от', 'до', 'об', 'ты', 'вы', 'он', 'она', 'они', 'мы', 'me',
    'the', 'a', 'an', 'of', 'in', 'at', 'by', 'to', 'is',
}

USER_AGENT = (
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
    'AppleWebKit/537.36 (KHTML, like Gecko) '
    'Chrome/131.0.0.0 Safari/537.36'
)
JINA_MIRROR = 'https://r.jina.ai/'


def _translit(s: str) -> str:
    return s.translate(_CYR2LAT)


def _is_cyrillic(s: str) -> bool:
    return bool(re.search(r'[а-яёА-ЯЁ]', s))


def _handle_candidates(query: str) -> list[str]:
    """
    Generate plausible Telegram @handle candidates from a name-like query.
    E.g. "Гриша Ютубер" → ['grishaytubr', 'grisha_youtuber', 'grishayoutuber', ...]
         "Salfekta"      → ['salfekta', 'salfekt', ...]
    """
    raw = query.strip()
    # Already looks like a handle/link — skip
    if raw.startswith('@') or raw.startswith('t.me') or raw.startswith('http'):
        return []

    parts = re.split(r'[\s_\-]+', raw)
    parts_lat = [_translit(p.lower()) if _is_cyrillic(p) else p.lower() for p in parts]
    
    candidates = []

    # Strategy A: just concatenate all parts
    joined = ''.join(parts_lat)
    if len(joined) >= 3:
        candidates.append(joined)

    # Strategy B: join with underscore
    underscored = '_'.join(p for p in parts_lat if p)
    if underscored != joined and len(underscored) >= 3:
        candidates.append(underscored)

    # Strategy C: if query looks like "Гриша Ютубер" → try first-word alone
    if len(parts_lat) >= 2:
        candidates.append(parts_lat[0])
        # Also try first+second truncated
        short = parts_lat[0] + parts_lat[1][:4]
        if short not in candidates:
            candidates.append(short)

    # Strategy D: the raw query as-is if it has no spaces (already handle-like)
    if ' ' not in raw and '_' not in raw:
        candidates.append(raw.lower())

    # Strategy E: strip common suffixes like "youtuber"→"youtube", "ютубер"→"ytb"
    # and rebuild
    SUFFIX_MAP = {
        'youtuber': 'youtube', 'ютубер': 'ytubr', 'ютуб': 'ytb',
        'blogger': 'blog', 'блогер': 'blog', 'channel': 'ch',
    }
    remapped = []
    for p in parts_lat:
        remapped.append(SUFFIX_MAP.get(p, p))
    joined_remap = ''.join(remapped)
    if joined_remap not in candidates and len(joined_remap) >= 3:
        candidates.append(joined_remap)

    # Deduplicate, keep valid handle chars only, length 3-32
    seen = set()
    result = []
    for c in candidates:
        clean = re.sub(r'[^a-z0-9_]', '', c)
        if len(clean) >= 3 and clean not in seen:
            seen.add(clean)
            result.append(clean)

    return result[:6]


def _search_terms(query: str) -> list[str]:
    """Return keyword search terms for TGFind directory."""
    tokens = re.findall(r'[\w@-]{2,}', query.lower(), flags=re.UNICODE)
    terms = []
    for token in tokens:
        clean = token.lstrip('@')
        if clean in _STOP:
            continue
        variants = [clean, _translit(clean)]
        for v in variants:
            v = v.strip()
            if len(v) > 1 and v not in terms:
                terms.append(v)
    return terms[:8] or [query.strip()[:80]]


def _probe_handle_via_jina(handle: str, timeout: int = 7) -> dict | None:
    """
    Try to fetch t.me/s/{handle} via Jina reader mirror and parse basic info.
    Returns a dict compatible with TGFind result format, or None if not found.
    """
    url = f'{JINA_MIRROR}https://t.me/s/{handle}'
    req = urllib.request.Request(
        url, headers={'User-Agent': USER_AGENT, 'Accept': 'text/plain'}
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            text = resp.read().decode('utf-8', errors='ignore')
    except Exception:
        return None

    # Parse title from markdown
    title_match = re.search(r'^Title:\s*(.+)$', text, re.MULTILINE)
    if not title_match:
        return None

    title = title_match.group(1).strip()
    # If title is generic/error page, skip
    if not title:
        return None
    # "Telegram: Contact @xyz" means channel doesn't really exist as a public channel
    if re.match(r'^Telegram\s*:', title, re.IGNORECASE):
        return None
    # "Page not found", "404", etc.
    bad_titles = {'telegram', 'page not found', '404', 'not found', 'error'}
    if title.lower().strip() in bad_titles:
        return None

    # Try to extract subscriber count — various patterns
    sub_count = None
    # Pattern 1: "1.5K subscribers", "10K members"
    subs_match = re.search(
        r'([\d][\d\s]*[.,]?[\d]*\s*[KMkm]?)\s*(?:subscribers?|members?|подписчиков|участников)',
        text, re.IGNORECASE
    )
    if subs_match:
        raw = subs_match.group(1).strip().upper().replace(' ', '').replace(',', '.')
        try:
            if 'K' in raw:
                sub_count = int(float(raw.replace('K', '')) * 1000)
            elif 'M' in raw:
                sub_count = int(float(raw.replace('M', '')) * 1_000_000)
            else:
                sub_count = int(float(raw))
        except Exception:
            pass

    # Extract description: first meaningful text block
    desc_match = re.search(
        r'(?:Markdown Content:|URL Source:[^\n]+)\s*\n\s*\n([\s\S]{10,400})',
        text
    )
    description = ''
    if desc_match:
        raw_desc = desc_match.group(1).strip()
        # Clean markdown links and images
        raw_desc = re.sub(r'!\[[^\]]*\]\([^)]*\)', '', raw_desc)
        raw_desc = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', raw_desc)
        raw_desc = re.sub(r'[*_`#\[\]]', '', raw_desc)
        raw_desc = re.sub(r'\n{3,}', '\n\n', raw_desc)
        # Take first sentence or up to 200 chars
        first_line = raw_desc.split('\n')[0].strip()[:220]
        description = first_line if len(first_line) > 10 else raw_desc[:200].strip()

    return {
        'handle': handle,
        'name': title,
        'summary': description,
        'memberCount': sub_count,
        'categories': [],
        'telegramUrl': f'https://t.me/{handle}',
        '_source': 'direct_probe',
    }


import ai_engine

def smart_search(query: str, item_type: str = 'channel', category: str | None = None,
                 tgfind_rpc=None) -> dict:
    """
    Multi-strategy search combining AI predictions (CarteLink / OpenAI),
    TGFind directory, and direct Telegram channel probing.
    """
    records: dict[str, dict] = {}
    terms = _search_terms(query)
    handle_candidates = _handle_candidates(query)

    # ----------- STRATEGY 0: AI Query Intelligence -----------
    ai_info = {'ai_used': False, 'handles': [], 'keywords': []}
    try:
        ai_info = ai_engine.get_ai_suggestions(query, timeout=3)
        if ai_info.get('ai_used'):
            # Prepend AI predicted handles (highest confidence)
            for h in ai_info.get('handles', []):
                if h not in handle_candidates:
                    handle_candidates.insert(0, h)
            # Add AI suggested keywords
            for kw in ai_info.get('keywords', []):
                if kw not in terms:
                    terms.append(kw)
    except Exception:
        pass

    # ----------- STRATEGY 1: TGFind keyword search -----------
    type_val = item_type if item_type in ('channel', 'group', 'bot') else 'channel'
    search_queries = [query.strip()]
    for t in terms:
        if t.lower() != query.strip().lower() and t not in search_queries:
            search_queries.append(t)

    for q in search_queries[:3]:
        try:
            args = {'query': q, 'type': type_val, 'limit': 20}
            if category:
                args['category'] = category
            data = tgfind_rpc('tools/call', {'name': 'search_directory', 'arguments': args})
            for row in data.get('results', []):
                key = (row.get('handle') or row.get('slug') or '').lower()
                if key:
                    records[key] = row
            if len(records) >= 20:
                break
        except urllib.error.HTTPError as e:
            if e.code in (403, 429):
                break
        except Exception:
            pass

    # ----------- STRATEGY 2: Direct handle probing -----------
    # Run if query looks like a name or if AI generated candidate handles
    looks_like_name = (
        ai_info.get('ai_used')
        or bool(re.search(r'[A-ZА-Я]', query))
        or '_' in query
        or len(query.split()) <= 4
    )

    probed_handles = handle_candidates[:8]
    if looks_like_name and probed_handles:
        with ThreadPoolExecutor(max_workers=min(len(probed_handles), 5)) as pool:
            future_map = {
                pool.submit(_probe_handle_via_jina, h, 6): h
                for h in probed_handles
            }
            for future in as_completed(future_map, timeout=12):
                try:
                    result = future.result()
                    if result:
                        key = result['handle'].lower()
                        if key not in records:
                            if key in ai_info.get('handles', []):
                                result['_source'] = 'ai_matched'
                            records[key] = result
                except Exception:
                    pass

    # ----------- LOCAL RE-RANKING -----------
    words = [w for w in re.findall(r'[\w@-]{2,}', query.lower(), flags=re.UNICODE) if w not in _STOP]

    def score(row: dict) -> int:
        name = (row.get('name') or '').lower()
        handle = (row.get('handle') or '').lower()
        summary = (row.get('summary') or '').lower()
        pts = 0
        for word in words:
            word_lat = _translit(word)
            for variant in [word, word_lat]:
                if not variant:
                    continue
                if variant in name:
                    pts += 8
                    break
                elif variant in handle:
                    pts += 7
                    break
            else:
                if any(variant in summary for variant in [word, word_lat]):
                    pts += 2
        # Bonus for AI and direct matched handles
        if row.get('_source') == 'ai_matched':
            pts += 6
        elif row.get('_source') == 'direct_probe':
            pts += 3
        return pts

    results = sorted(
        records.values(),
        key=lambda r: (-score(r), -(r.get('memberCount') or 0))
    )[:30]

    return {
        'results': results,
        'source': 'AI + TGFind + direct probe',
        'terms': terms,
        'ai_used': ai_info.get('ai_used', False),
        'ai_model': ai_info.get('model', 'CarteLink AI (8317)'),
        'handle_candidates_tried': probed_handles,
    }
