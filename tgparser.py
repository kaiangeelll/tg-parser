import re
import urllib.request
import urllib.error
import html
from datetime import datetime

USER_AGENT = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
              'AppleWebKit/537.36 (KHTML, like Gecko) '
              'Chrome/131.0.0.0 Safari/537.36')

def clean_html_text(text):
    if not text:
        return ''
    # Replace <br> and <br/> with newline
    text = re.sub(r'<br\s*/?>', '\n', text, flags=re.IGNORECASE)
    # Strip remaining HTML tags
    text = re.sub(r'<[^>]+>', '', text)
    # Unescape HTML entities
    text = html.unescape(text)
    return text.strip()

def fetch_html(url, timeout=7):
    req = urllib.request.Request(
        url,
        headers={
            'User-Agent': USER_AGENT,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7'
        }
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode('utf-8', errors='ignore')

def parse_telegram_preview(handle):
    handle = handle.lstrip('@').strip()
    direct_url = f'https://t.me/s/{handle}'
    
    html_doc = None
    fetch_mode = 'direct'
    try:
        html_doc = fetch_html(direct_url, timeout=6)
    except Exception:
        # Fallback to Jina reader mirror if direct t.me is blocked/timed out on client network
        try:
            mirror_url = f'https://r.jina.ai/{direct_url}'
            md_text = fetch_html(mirror_url, timeout=10)
            return parse_markdown_fallback(handle, md_text)
        except Exception as e:
            raise RuntimeError(f'Не удалось получить посты канала @{handle}: {e}')

    return extract_posts_from_html(handle, html_doc)

def extract_posts_from_html(handle, html_doc):
    # Extract channel info
    title_match = re.search(r'<div[^>]*class="[^"]*tgme_channel_info_header_title[^"]*"[^>]*>[\s\S]*?<span[^>]*dir="auto">([\s\S]*?)</span>', html_doc)
    title = clean_html_text(title_match.group(1)) if title_match else handle
    
    avatar_match = re.search(r'<img[^>]*class="[^"]*tgme_page_photo_image[^"]*"[^>]*src="([^"]+)"', html_doc)
    avatar = avatar_match.group(1) if avatar_match else None
    
    sub_match = re.search(r'<div[^>]*class="[^"]*tgme_channel_info_counter[^"]*"[^>]*>[\s\S]*?<span[^>]*class="[^"]*counter_value[^"]*"[^>]*>([\s\S]*?)</span>[\s\S]*?<span[^>]*class="[^"]*counter_type[^"]*"[^>]*>([\s\S]*?)</span>', html_doc)
    subscribers = ''
    if sub_match:
        subscribers = f'{clean_html_text(sub_match.group(1))} {clean_html_text(sub_match.group(2))}'.strip()
    
    desc_match = re.search(r'<div[^>]*class="[^"]*tgme_channel_info_description[^"]*"[^>]*>([\s\S]*?)</div>', html_doc)
    description = clean_html_text(desc_match.group(1)) if desc_match else ''

    # Extract posts
    # Posts are wrapped in tgme_widget_message
    message_chunks = re.findall(r'(<div[^>]*class="[^"]*tgme_widget_message\b[^"]*"[^>]*data-post="([^"]+)"[\s\S]*?)(?=<div[^>]*class="[^"]*tgme_widget_message\b|\Z)', html_doc)
    
    posts = []
    for chunk, post_id in message_chunks:
        # Text
        text_match = re.search(r'<div[^>]*class="[^"]*tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)</div>', chunk)
        text = clean_html_text(text_match.group(1)) if text_match else ''
        
        # Time
        time_match = re.search(r'<time[^>]*datetime="([^"]+)"[^>]*>([\s\S]*?)</time>', chunk)
        date_iso = time_match.group(1) if time_match else ''
        date_text = clean_html_text(time_match.group(2)) if time_match else ''
        
        # Views
        views_match = re.search(r'<span[^>]*class="[^"]*tgme_widget_message_views[^"]*"[^>]*>([\s\S]*?)</span>', chunk)
        views = clean_html_text(views_match.group(1)) if views_match else ''
        
        # Images
        photo_matches = re.findall(r"background-image:url\('([^']+)'\)", chunk)
        
        num_id = post_id.split('/')[-1] if '/' in post_id else post_id
        post_url = f'https://t.me/{post_id}'
        
        if text or photo_matches:
            posts.append({
                'id': num_id,
                'postId': post_id,
                'url': post_url,
                'text': text,
                'date': date_text or date_iso,
                'datetime': date_iso,
                'views': views,
                'images': photo_matches[:4]
            })

    # Reverse so latest posts come first
    posts.reverse()

    return {
        'channel': {
            'handle': f'@{handle}',
            'name': title,
            'avatar': avatar,
            'subscribers': subscribers,
            'description': description,
            'url': f'https://t.me/{handle}'
        },
        'count': len(posts),
        'posts': posts,
        'source': 'telegram_preview'
    }

def parse_markdown_fallback(handle, md_text):
    # Parse jina markdown fallback if direct t.me was blocked locally
    lines = md_text.splitlines()
    title = handle
    avatar = None
    for line in lines[:10]:
        if line.startswith('Title:'):
            title = line.replace('Title:', '').strip()
            break
            
    # Search for post images and paragraphs
    # In markdown, posts are separated by dates/views or images
    raw_posts = []
    current_post = []
    
    for line in lines:
        if line.strip().startswith('---') or (re.search(r'^\d+(\.\d+)?[KM]?\s+\d{2}:\d{2}', line.strip())):
            if current_post:
                p_text = '\n'.join(current_post).strip()
                if p_text and len(p_text) > 10:
                    raw_posts.append(p_text)
                current_post = []
        else:
            current_post.append(line)
            
    if current_post:
        p_text = '\n'.join(current_post).strip()
        if p_text and len(p_text) > 10:
            raw_posts.append(p_text)
            
    posts = []
    for idx, p in enumerate(raw_posts[:20]):
        posts.append({
            'id': str(idx + 1),
            'postId': f'{handle}/{idx+1}',
            'url': f'https://t.me/{handle}',
            'text': p[:1500],
            'date': 'Недавно',
            'datetime': datetime.utcnow().isoformat(),
            'views': '',
            'images': []
        })
        
    return {
        'channel': {
            'handle': f'@{handle}',
            'name': title,
            'avatar': avatar,
            'subscribers': '',
            'description': '',
            'url': f'https://t.me/{handle}'
        },
        'count': len(posts),
        'posts': posts,
        'source': 'mirror'
    }
