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

# Curated alias directory for popular creators / specific channels requested by users
_KNOWN_CHANNELS = {
    'гриша ютубер': ['Grisha_Youtuber_2003', 'grishayoutube', 'grishayoutuber'],
    'гриша_ютубер': ['Grisha_Youtuber_2003'],
    'гриша ютуб': ['Grisha_Youtuber_2003'],
    'grisha youtuber': ['Grisha_Youtuber_2003'],
    'grisha_youtuber': ['Grisha_Youtuber_2003'],
    'салфекта': ['salfekta', 'salfektaa'],
    'салфекта тг': ['salfekta', 'salfektaa'],
    'salfekta': ['salfekta', 'salfektaa'],
    'даня ворон': ['danyavoron_yt', 'danyavoron'],
    'даняворон': ['danyavoron_yt'],
    'danya voron': ['danyavoron_yt'],
    'yt cartel': ['YT_cartell', 'yt_cartell', 'ytcartell'],
    'yt_cartel': ['YT_cartell', 'yt_cartell', 'ytcartell'],
    'yt_cartell': ['YT_cartell'],
    'ytcartel': ['YT_cartell'],
    'ytcartell': ['YT_cartell'],
    'картель': ['YT_cartell'],
    'ют картель': ['YT_cartell'],
    'картель ютуб': ['YT_cartell'],
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
    E.g. "Гриша Ютубер" → ['Grisha_Youtuber_2003', 'grisha_youtuber', 'grishayoutuber', ...]
         "Salfekta"      → ['salfekta', 'salfekt', ...]
    """
    raw = query.strip()
    # Already looks like a handle/link — skip
    if raw.startswith('@') or raw.startswith('t.me') or raw.startswith('http'):
        return []

    norm_q = re.sub(r'[\s_\-]+', ' ', raw.lower()).strip()
    candidates = []

    # Strategy 0: Curated known creator handles
    if norm_q in _KNOWN_CHANNELS:
        candidates.extend(_KNOWN_CHANNELS[norm_q])
    for k, v in _KNOWN_CHANNELS.items():
        if k in norm_q or norm_q in k:
            for item in v:
                if item not in candidates:
                    candidates.append(item)

    parts = re.split(r'[\s_\-]+', raw)
    parts_lat = [_translit(p.lower()) if _is_cyrillic(p) else p.lower() for p in parts]

    # Strategy A: just concatenate all parts
    joined = ''.join(parts_lat)
    if len(joined) >= 3:
        candidates.append(joined)

    # Strategy B: join with underscore
    underscored = '_'.join(p for p in parts_lat if p)
    if underscored != joined and len(underscored) >= 3:
        candidates.append(underscored)

    # Strategy C: if query looks like "Гриша Ютубер" → try with common year / official suffixes
    if len(parts_lat) >= 2:
        candidates.append(f'{underscored}_official')
        candidates.append(f'{underscored}_yt')
        candidates.append(f'{parts_lat[0]}_{parts_lat[1][:3]}')
        candidates.append(parts_lat[0])
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

    # Strategy F: letter doubling and typo variations (e.g. cartel -> cartell)
    if 'cartel' in raw.lower():
        candidates.extend(['YT_cartell', 'yt_cartell', 'ytcartell'])
    for p in [joined, underscored, raw.lower()]:
        if p.endswith('l'):
            candidates.append(f'{p}l')
        elif p.endswith('ll'):
            candidates.append(p[:-1])
        if p.endswith('s'):
            candidates.append(f'{p}s')
        elif p.endswith('ss'):
            candidates.append(p[:-1])

    # Deduplicate, keep valid handle chars only, length 3-32
    seen = set()
    result = []
    for c in candidates:
        clean = re.sub(r'[^a-zA-Z0-9_]', '', c)
        if len(clean) >= 3 and clean.lower() not in seen:
            seen.add(clean.lower())
            result.append(clean)

    return result[:14]


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


def _probe_direct_html(handle: str, timeout: int = 3) -> dict | None:
    """Try direct Telegram preview fetch (fast on cloud/Vercel and local)."""
    for domain in ['telegram.me', 't.me']:
        try:
            url = f'https://{domain}/s/{handle}'
            req = urllib.request.Request(
                url,
                headers={
                    'User-Agent': USER_AGENT,
                    'Accept': 'text/html,application/xhtml+xml',
                    'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8'
                }
            )
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                html_doc = resp.read().decode('utf-8', errors='ignore')
            if 'tgme_page_title' not in html_doc and 'tgme_channel_info' not in html_doc:
                continue

            # Title
            t_m = re.search(r'<div[^>]*class="[^"]*tgme_channel_info_header_title[^"]*"[^>]*>[\s\S]*?<span[^>]*dir="auto">([\s\S]*?)</span>', html_doc)
            title = re.sub(r'<[^>]+>', '', t_m.group(1)).strip() if t_m else handle

            # Avatar (can be inside <i class="tgme_page_photo_image"> or <div class="tgme_page_photo">)
            a_m = re.search(r'class="[^"]*tgme_page_photo[^"]*"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"', html_doc)
            if not a_m:
                a_m = re.search(r'<img[^>]*class="[^"]*tgme_page_photo_image[^"]*"[^>]*src="([^"]+)"', html_doc)
            avatar = a_m.group(1) if a_m else None

            # Subscribers
            sub_m = re.search(r'<span[^>]*class="[^"]*counter_value[^"]*"[^>]*>([\s\S]*?)</span>', html_doc)
            sub_count = None
            if sub_m:
                raw = re.sub(r'<[^>]+>', '', sub_m.group(1)).replace(' ', '').replace(',', '.')
                try:
                    if 'K' in raw.upper():
                        sub_count = int(float(raw.upper().replace('K', '')) * 1000)
                    elif 'M' in raw.upper():
                        sub_count = int(float(raw.upper().replace('M', '')) * 1_000_000)
                    else:
                        sub_count = int(float(raw))
                except Exception:
                    pass

            # Description
            d_m = re.search(r'<div[^>]*class="[^"]*tgme_channel_info_description[^"]*"[^>]*>([\s\S]*?)</div>', html_doc)
            desc = re.sub(r'<[^>]+>', '', d_m.group(1)).strip() if d_m else ''

            return {
                'handle': handle,
                'name': title,
                'summary': desc,
                'avatar': avatar,
                'memberCount': sub_count,
                'categories': [],
                'telegramUrl': f'https://t.me/{handle}',
                '_source': 'direct_probe',
            }
        except Exception:
            continue
    return None


def _probe_handle(handle: str) -> dict | None:
    """Probes channel using direct Telegram preview first, with Jina reader fallback."""
    direct = _probe_direct_html(handle, timeout=3)
    if direct:
        return direct
    return _probe_handle_via_jina(handle, timeout=6)


def _probe_handle_via_jina(handle: str, timeout: int = 7) -> dict | None:
    """
    Try to fetch via Jina reader mirror using telegram.me.
    Returns a dict compatible with TGFind result format, or None if not found.
    """
    url = f'{JINA_MIRROR}https://telegram.me/s/{handle}'
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

    # Extract avatar
    avatar_match = re.search(r'\[_?!\[Image \d+\]\((https?://[^\)]+)\)_?\]\(https?://t\.me/', text)
    avatar = avatar_match.group(1) if avatar_match else None
    if avatar:
        avatar = re.sub(r'\\([_\-])', r'\1', avatar)

    # Extract description: clean text block
    clean_body = re.sub(r'^(?:Title|URL Source|Markdown Content):[^\n]*\n+', '', text, flags=re.MULTILINE)
    clean_body = re.sub(r'\[_?!\[Image \d+\]\([^)]+\)_?\]\([^)]+\)', '', clean_body)
    clean_body = re.sub(r'!\[[^\]]*\]\([^)]+\)', '', clean_body)
    clean_body = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', clean_body)
    clean_body = re.sub(r'[*_`#~>\[\]]', '', clean_body)
    lines = [line.strip() for line in clean_body.split('\n') if line.strip() and not line.strip().startswith('http')]
    description = lines[0][:200] if lines else 'Публичный Telegram-канал с видео и постами.'

    return {
        'handle': handle,
        'name': title,
        'summary': description,
        'avatar': avatar,
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
            # Append AI suggested handles after curated / exact candidates
            for h in ai_info.get('handles', []):
                if h not in handle_candidates:
                    handle_candidates.append(h)
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

    probed_handles = handle_candidates[:12]
    if looks_like_name and probed_handles:
        with ThreadPoolExecutor(max_workers=min(len(probed_handles), 8)) as pool:
            future_map = {
                pool.submit(_probe_handle, h): h
                for h in probed_handles
            }
            try:
                for future in as_completed(future_map, timeout=6):
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
            except TimeoutError:
                pass

    # ----------- LOCAL RE-RANKING -----------
    clean_q_lower = re.sub(r'[\s_\-]+', ' ', query.lower()).strip()
    words = [w for w in re.findall(r'[\w@-]{2,}', query.lower(), flags=re.UNICODE) if w not in _STOP]
    curated_handles = [h.lower() for h in _KNOWN_CHANNELS.get(clean_q_lower, [])]
    is_plain_name = not query.strip().startswith('@')

    def score(row: dict) -> int:
        name = (row.get('name') or '').lower()
        handle = (row.get('handle') or '').lower()
        summary = (row.get('summary') or '').lower()
        pts = 0

        # Exact title / display name match (the title displayed next to avatar)
        name_clean = re.sub(r'[\s_\-]+', ' ', name).strip()
        if name_clean == clean_q_lower:
            pts += 60
        elif clean_q_lower and clean_q_lower in name_clean:
            pts += 40
        elif name_clean and name_clean in clean_q_lower:
            pts += 30

        # Curated creator handles for this specific name
        if handle in curated_handles or any(ch in handle for ch in curated_handles):
            pts += 45

        # Check words in name (primary) vs in handle (secondary)
        for word in words:
            word_lat = _translit(word)
            variants = [word]
            if word_lat and word_lat != word:
                variants.append(word_lat)

            # Prioritize display name over handle when query has no @
            if any(v in name for v in variants):
                pts += (20 if is_plain_name else 10)
            elif any(v in handle for v in variants):
                pts += (5 if is_plain_name else 10)
            elif any(v in summary for v in variants):
                pts += 2

        # Bonus for AI and direct matched handles
        if row.get('_source') == 'ai_matched':
            pts += 5
        elif row.get('_source') == 'direct_probe':
            pts += 5
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
