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

RU_MONTHS = [
    '', 'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
]

def _format_date(date_iso: str, date_text: str = '') -> tuple[str, str, str]:
    """Returns (full_date_with_time, date_only, time_str) e.g. ('18 мая 2024, 16:20', '18 мая 2024', '16:20')"""
    if date_iso:
        m = re.match(r'(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})', date_iso)
        if m:
            y, mo, d, hh, mm = m.group(1), int(m.group(2)), int(m.group(3)), m.group(4), m.group(5)
            mo_str = RU_MONTHS[mo] if 1 <= mo <= 12 else str(mo)
            date_only = f'{d} {mo_str} {y}'
            full = f'{d} {mo_str} {y}, {hh}:{mm}'
            return full, date_only, f'{hh}:{mm}'
    if date_text:
        return date_text, date_text, date_text
    return 'Недавно', '', ''

def _fetch(url: str, timeout: int = 12, extra_headers: dict = None) -> str:
    headers = {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,text/plain,*/*',
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
    }
    if extra_headers:
        headers.update(extra_headers)
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode('utf-8', errors='ignore')

def parse_telegram_preview(handle: str, before: str | int = None, fetch_all: bool = False) -> dict:
    handle = handle.lstrip('@').strip()
    handle = re.sub(r'^(?:https?://)?(?:www\.)?t\.me/', '', handle, flags=re.IGNORECASE)
    handle = handle.split('/')[0].split('?')[0].strip()

    def fetch_single(before_param=None):
        for domain in ['telegram.me', 't.me']:
            direct_url = f'https://{domain}/s/{handle}'
            if before_param:
                direct_url += f'?before={before_param}'
            
            # 1. Try direct fetch first (works locally and on Vercel)
            try:
                html_doc = _fetch(direct_url, timeout=5)
                if 'tgme_widget_message' in html_doc:
                    return _parse_html_preview(handle, html_doc)
            except Exception:
                pass

        # 2. Fallback to Jina with X-Return-Format: html
        try:
            jina_url = f'{JINA_BASE}https://telegram.me/s/{handle}'
            if before_param:
                jina_url += f'?before={before_param}'
            html_doc = _fetch(jina_url, timeout=12, extra_headers={'X-Return-Format': 'html'})
            if 'tgme_widget_message' in html_doc:
                return _parse_html_preview(handle, html_doc)
            return _parse_jina_preview(handle, html_doc)
        except Exception as e:
            raise RuntimeError(f'Не удалось загрузить посты канала @{handle}: {e}')

    first_res = fetch_single(before)
    if not fetch_all or not first_res.get('posts'):
        return first_res

    # Auto-fetch older pages to load all posts of the channel
    all_posts = list(first_res['posts'])
    seen_ids = {p['id'] for p in all_posts}
    
    for _ in range(5):
        num_ids = [int(p['id']) for p in all_posts if p['id'].isdigit()]
        if not num_ids:
            break
        min_id = min(num_ids)
        if min_id <= 1:
            break

        try:
            older_res = fetch_single(before_param=min_id)
            older_posts = [p for p in older_res.get('posts', []) if p['id'] not in seen_ids]
            if not older_posts:
                break
            for p in older_posts:
                seen_ids.add(p['id'])
                all_posts.append(p)
        except Exception:
            break

    # Sort chronological (oldest top -> newest bottom)
    try:
        all_posts.sort(key=lambda p: int(p['id']))
    except Exception:
        pass

    first_res['posts'] = all_posts
    first_res['count'] = len(all_posts)
    return first_res

def _parse_html_preview(handle: str, html_doc: str) -> dict:
    title_m = re.search(r'<div[^>]*class="[^"]*tgme_channel_info_header_title[^"]*"[^>]*>[\s\S]*?<span[^>]*dir="auto">([\s\S]*?)</span>', html_doc)
    title = html.unescape(re.sub(r'<[^>]+>', '', title_m.group(1))).strip() if title_m else handle

    # Multi-pattern avatar detection
    avatar_m = re.search(r'class="[^"]*tgme_page_photo[^"]*"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"', html_doc)
    if not avatar_m:
        avatar_m = re.search(r'<img[^>]+src="([^"]+)"[^>]*class="[^"]*tgme_page_photo_image', html_doc)
    if not avatar_m:
        avatar_m = re.search(r'class="[^"]*tgme_page_photo_image[^"]*"[^>]*<img[^>]+src="([^"]+)"', html_doc)
    if not avatar_m:
        avatar_m = re.search(r'<i[^>]*class="[^"]*tgme_widget_message_user_photo[^"]*"[^>]*>\s*<img[^>]+src="([^"]+)"', html_doc)
    if not avatar_m:
        avatar_m = re.search(r'<div[^>]*class="[^"]*tgme_channel_info[^"]*"[\s\S]*?<img[^>]+src="([^"]+)"', html_doc)
    avatar = avatar_m.group(1) if avatar_m else None
    if avatar:
        avatar = re.sub(r'\\([_\-])', r'\1', avatar)

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
        clean_chunk = re.sub(r'<div[^>]*class="[^"]*(?:reactions|reaction)[^"]*"[\s\S]*?</div>', '', clean_chunk, flags=re.IGNORECASE)
        clean_chunk = re.sub(r'<span[^>]*class="[^"]*tgme_reaction[^"]*"[\s\S]*?</span>', '', clean_chunk, flags=re.IGNORECASE)

        # Detect true round video notes (кружочки) / voice messages only (never false-flag normal posts)
        is_round_video = bool(re.search(r'tgme_widget_message_roundvideo|roundvideo', clean_chunk, re.IGNORECASE))
        is_voice = bool(re.search(r'tgme_widget_message_voice|voice_message', clean_chunk, re.IGNORECASE))
        is_media_note = (is_round_video or is_voice)

        # Remove unsupported media placeholders so they never leak into post text
        clean_chunk = re.sub(r'<div[^>]*class="[^"]*message_media_not_supported[^"]*"[\s\S]*?</div>', '', clean_chunk, flags=re.IGNORECASE)
        clean_chunk = re.sub(r'<div[^>]*class="[^"]*media_not_supported[^"]*"[\s\S]*?</div>', '', clean_chunk, flags=re.IGNORECASE)

        # Target ONLY real message body: class="... js-message_text ..." (NEVER reply text)
        text_m = re.search(r'<div[^>]*class="[^"]*\bjs-message_text\b[^"]*"[^>]*>([\s\S]*?)(?=<div[^>]*class="[^"]*tgme_widget_message_footer|\Z)', clean_chunk)
        if not text_m:
            for tm in re.finditer(r'<div[^>]*class="[^"]*tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)(?=<div[^>]*class="[^"]*tgme_widget_message_footer|\Z)', clean_chunk):
                if 'js-message_reply_text' not in tm.group(0):
                    text_m = tm
                    break

        text = ''
        if text_m:
            raw_text = text_m.group(1)
            raw_text = re.sub(r'</div>\s*</div>\s*$', '', raw_text)
            text = html.unescape(re.sub(r'<br\s*/?>', '\n', raw_text))
            text = re.sub(r'<tg-emoji[^>]*>(?:<i[^>]*>[\s\S]*?</i>)?(.*?)</tg-emoji>', r'\1', text)
            text = re.sub(r'<[^>]+>', '', text).strip()
            text = re.sub(r'(?i)(?:Please open Telegram to view this post|This media is not supported[^\n]*|Media is too big)', '', text).strip()

        time_m = re.search(r'<time[^>]*datetime="([^"]+)"[^>]*>([\s\S]*?)</time>', clean_chunk)
        date_iso = time_m.group(1) if time_m else ''
        date_text = html.unescape(time_m.group(2)).strip() if time_m else ''
        full_date, date_only, time_str = _format_date(date_iso, date_text)

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
            'date': full_date,
            'dateOnly': date_only,
            'time': time_str,
            'datetime': date_iso,
            'views': views,
            'images': photos[:6],
            'videos': videos[:2],
            'isMediaNote': is_media_note
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

        # Extract images (strictly exclude reactions, emoji stickers, and avatar)
        raw_imgs = re.findall(r'!\[([^\]]*)\]\((https?://[^)]+)\)', block)
        images = []
        for alt, img in raw_imgs:
            clean_img = re.sub(r'\\([_\-])', r'\1', img)
            alt_clean = alt.strip()
            # Exclude if alt contains emoji like 🔥, 👍, ❤️ or reaction/emoji keywords
            is_reaction = (
                bool(re.search(r'reaction|emoji|thumb_reaction|sticker', clean_img, re.IGNORECASE)) or
                bool(re.search(r'reaction|emoji|sticker', alt_clean, re.IGNORECASE)) or
                bool(re.search(r'[\U00010000-\U0010ffff\u2600-\u27bf]', alt_clean))
            )
            if not is_reaction and clean_img != avatar_url and clean_img not in images:
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
