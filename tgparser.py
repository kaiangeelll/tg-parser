"""
tgparser.py — Telegram channel parser using direct preview & Jina fallback.
Parses full public channel messages, media, dates, views, and links.
"""

import re
import html
import urllib.request
import urllib.error

USER_AGENT = (
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
    'AppleWebKit/537.36 (KHTML, like Gecko) '
    'Chrome/131.0.0.0 Safari/537.36'
)
JINA_BASE = 'https://r.jina.ai/'

def _fetch(url: str, timeout: int = 12) -> str:
    req = urllib.request.Request(
        url,
        headers={
            'User-Agent': USER_AGENT,
            'Accept': 'text/plain,text/html,*/*',
            'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
        }
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode('utf-8', errors='ignore')

def parse_telegram_preview(handle: str, before: str | int = None) -> dict:
    handle = handle.lstrip('@').strip()
    handle = re.sub(r'^(?:https?://)?(?:www\.)?t\.me/', '', handle, flags=re.IGNORECASE)
    handle = handle.split('/')[0].split('?')[0].strip()

    direct_url = f'https://t.me/s/{handle}'
    if before:
        direct_url += f'?before={before}'
    
    # Try direct fetch first (works on Vercel / unblocked network)
    try:
        html_doc = _fetch(direct_url, timeout=5)
        if 'tgme_widget_message' in html_doc:
            return _parse_html_preview(handle, html_doc)
    except Exception:
        pass

    # Fallback to Jina reader mirror
    try:
        jina_url = f'{JINA_BASE}{direct_url}'
        md = _fetch(jina_url, timeout=12)
        return _parse_jina_preview(handle, md)
    except Exception as e:
        raise RuntimeError(f'Не удалось загрузить посты канала @{handle}: {e}')

def _parse_html_preview(handle: str, html_doc: str) -> dict:
    title_m = re.search(r'<div[^>]*class="[^"]*tgme_channel_info_header_title[^"]*"[^>]*>[\s\S]*?<span[^>]*dir="auto">([\s\S]*?)</span>', html_doc)
    title = html.unescape(re.sub(r'<[^>]+>', '', title_m.group(1))).strip() if title_m else handle

    avatar_m = re.search(r'<img[^>]*class="[^"]*tgme_page_photo_image[^"]*"[^>]*src="([^"]+)"', html_doc)
    avatar = avatar_m.group(1) if avatar_m else None

    sub_m = re.search(r'<div[^>]*class="[^"]*tgme_channel_info_counter[^"]*"[^>]*>[\s\S]*?<span[^>]*class="[^"]*counter_value[^"]*"[^>]*>([\s\S]*?)</span>[\s\S]*?<span[^>]*class="[^"]*counter_type[^"]*"[^>]*>([\s\S]*?)</span>', html_doc)
    subscribers = ''
    if sub_m:
        subscribers = f'{html.unescape(sub_m.group(1))} {html.unescape(sub_m.group(2))}'.strip()

    desc_m = re.search(r'<div[^>]*class="[^"]*tgme_channel_info_description[^"]*"[^>]*>([\s\S]*?)</div>', html_doc)
    description = html.unescape(re.sub(r'<br\s*/?>', '\n', desc_m.group(1))) if desc_m else ''
    description = re.sub(r'<[^>]+>', '', description).strip()

    message_chunks = re.findall(r'(<div[^>]*class="[^"]*tgme_widget_message\b[^"]*"[^>]*data-post="([^"]+)"[\s\S]*?)(?=<div[^>]*class="[^"]*tgme_widget_message\b|\Z)', html_doc)
    
    posts = []
    for chunk, post_id in message_chunks:
        num_id = post_id.split('/')[-1] if '/' in post_id else post_id
        
        # Remove reactions container completely so reaction emoji icons are never parsed as images or text
        clean_chunk = re.sub(
            r'<div[^>]*class="[^"]*tgme_widget_message_reactions\b[\s\S]*?(?=<div[^>]*class="[^"]*tgme_widget_message_footer\b|<div[^>]*class="[^"]*tgme_widget_message_info\b|\Z)',
            '',
            chunk,
            flags=re.IGNORECASE
        )
        clean_chunk = re.sub(r'<[^>]*class="[^"]*(?:tgme_reaction|reaction_emoji)[^"]*"[\s\S]*?</div>', '', clean_chunk, flags=re.IGNORECASE)

        text_m = re.search(r'<div[^>]*class="[^"]*tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)</div>', clean_chunk)
        text = ''
        if text_m:
            text = html.unescape(re.sub(r'<br\s*/?>', '\n', text_m.group(1)))
            text = re.sub(r'<[^>]+>', '', text).strip()

        time_m = re.search(r'<time[^>]*datetime="([^"]+)"[^>]*>([\s\S]*?)</time>', clean_chunk)
        date_iso = time_m.group(1) if time_m else ''
        date_text = html.unescape(time_m.group(2)).strip() if time_m else ''

        views_m = re.search(r'<span[^>]*class="[^"]*tgme_widget_message_views[^"]*"[^>]*>([\s\S]*?)</span>', clean_chunk)
        views = html.unescape(views_m.group(1)).strip() if views_m else ''

        # Extract only real post media photos (NEVER match reaction icons)
        photos = re.findall(r'class="[^"]*(?:tgme_widget_message_photo_wrap|media_photo)[^"]*"[^>]*style="[^"]*background-image:url\(\'([^\']+)\'\)', clean_chunk)
        # Filter out anything with reaction or emoji in url
        photos = [u for u in photos if not re.search(r'reaction|emoji|thumb_reaction', u, re.IGNORECASE)]

        videos = re.findall(r'<video[^>]*src="([^"]+)"', clean_chunk)

        posts.append({
            'id': num_id,
            'postId': post_id,
            'url': f'https://t.me/{post_id}',
            'text': text,
            'date': date_text or date_iso,
            'datetime': date_iso,
            'views': views,
            'images': photos[:6],
            'videos': videos[:2]
        })

    # Sort chronological (oldest top -> newest bottom)
    try:
        posts.sort(key=lambda p: int(p['id']))
    except Exception:
        pass

    return {
        'channel': {
            'handle': f'@{handle}',
            'name': title,
            'avatar': avatar,
            'subscribers': subscribers,
            'description': description,
            'url': f'https://t.me/{handle}',
        },
        'count': len(posts),
        'posts': posts,
        'source': 'direct_telegram'
    }

def _parse_jina_preview(handle: str, md: str) -> dict:
    handle_lower = handle.lower().lstrip('@')
    
    # Title
    title_m = re.search(r'^Title:\s*(.+)$', md, re.MULTILINE)
    channel_name = title_m.group(1).strip() if title_m else handle

    # Avatar
    avatar_url = None
    avatar_m = re.search(r'\[_?!\[Image \d+\]\(([^)]+)\)_?\]\(https?://t\.me/' + re.escape(handle_lower) + r'\)', md, re.IGNORECASE)
    if avatar_m:
        avatar_url = re.sub(r'\\([_\-])', r'\1', avatar_m.group(1))

    # Strip header metadata
    md_body = re.sub(r'^(?:Title|URL Source|Markdown Content):[^\n]*\n+', '', md, flags=re.MULTILINE)

    # Find all post links for this channel
    pattern = re.compile(r'https?://t\.me/' + re.escape(handle_lower) + r'/(\d+)', re.IGNORECASE)
    matches = list(pattern.finditer(md_body))

    seen_ids = set()
    unique_anchors = []
    for m in matches:
        pid = m.group(1)
        if pid not in seen_ids:
            seen_ids.add(pid)
            unique_anchors.append(m)

    posts = []
    for i, m in enumerate(unique_anchors):
        pid = m.group(1)
        start_idx = m.end()
        end_idx = unique_anchors[i + 1].start() if i + 1 < len(unique_anchors) else len(md_body)
        block = md_body[start_idx:end_idx]

        # Extract images (exclude reactions and avatar)
        raw_imgs = re.findall(r'!\[[^\]]*\]\((https?://[^)]+)\)', block)
        images = []
        for img in raw_imgs:
            clean_img = re.sub(r'\\([_\-])', r'\1', img)
            if clean_img != avatar_url and clean_img not in images:
                if not re.search(r'reaction|emoji|thumb_reaction', clean_img, re.IGNORECASE):
                    images.append(clean_img)

        # Views
        views_m = re.search(r'([\d.,]+[KMB]?)\s+views', block, re.IGNORECASE)
        views = views_m.group(1) if views_m else ''

        # Time
        time_m = re.search(r'\[?(\d{1,2}:\d{2})\]?', block)
        time_str = time_m.group(1) if time_m else ''

        # Date
        date_m = re.search(r'\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}(?:,\s*\d{4})?)', block, re.IGNORECASE)
        date_str = f'{date_m.group(1)} {date_m.group(2)}' if date_m else ''

        if date_str and time_str:
            display_date = f'{date_str}, {time_str}'
        elif date_str:
            display_date = date_str
        elif time_str:
            display_date = f'{time_str}'
        else:
            display_date = 'Недавно'

        # Clean text
        clean_text = block
        clean_text = re.sub(r'\[_?!\[Image \d+\]\([^)]+\)_?\]\([^)]+\)\s*', '', clean_text)
        clean_text = re.sub(r'!\[[^\]]*\]\([^)]+\)\s*', '', clean_text)
        # Strip all reactions lines (e.g. _**🔥**_ 36 _**👍**_ 27 _**❤️**_ 4 or 19.4K 46.7K)
        clean_text = re.sub(r'(?:_\*\*[^\n*]+\*\*_\s*)+[\d\s.,KMB]+', '', clean_text)
        clean_text = re.sub(r'_[*]{2}.*?[*]{2}_\s*(?:\d+[KMB]?\s*)+', '', clean_text)
        clean_text = re.sub(r'_?\*+[\s\S]*?\*+_?\s*(?:\d+[KMB]?\s*)+', '', clean_text)
        clean_text = re.sub(r'\n+\s*(?:_\*\*[^\n*]+\*\*_\s*|\d+[KMB]?\s*)+\s*$', '', clean_text)
        clean_text = re.sub(r'[\d.,]+[KMB]?\s+views.*$', '', clean_text, flags=re.MULTILINE)
        clean_text = re.sub(r'\\([_*\[\]()~`>#+\-=|{}.!])', r'\1', clean_text)
        clean_text = re.sub(r'\*\*(.+?)\*\*', r'\1', clean_text)
        clean_text = re.sub(r'_(.+?)_', r'\1', clean_text)
        clean_text = re.sub(r'\n{3,}', '\n\n', clean_text).strip()

        posts.append({
            'id': pid,
            'postId': f'{handle}/{pid}',
            'url': f'https://t.me/{handle}/{pid}',
            'text': clean_text,
            'date': display_date,
            'time': time_str,
            'dateOnly': date_str,
            'views': views,
            'images': images[:6],
            'videos': []
        })

    # Chronological sort: oldest at the top, newest at the bottom (like Telegram chat)
    try:
        posts.sort(key=lambda p: int(p['id']))
    except Exception:
        pass

    return {
        'channel': {
            'handle': f'@{handle}',
            'name': channel_name,
            'avatar': avatar_url,
            'subscribers': '',
            'description': '',
            'url': f'https://t.me/{handle}',
        },
        'count': len(posts),
        'posts': posts,
        'source': 'jina_mirror'
    }
