import sys
from pathlib import Path

# Add root directory to sys.path so modules can be imported in Vercel Serverless
root_dir = str(Path(__file__).resolve().parent.parent)
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import urllib.request
import json
import re
import html
from tgfind import HandlerMixin

USER_AGENT = (
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
    'AppleWebKit/537.36 (KHTML, like Gecko) '
    'Chrome/131.0.0.0 Safari/537.36'
)

def parse_telegram_addlist(url_or_slug: str) -> dict:
    raw = url_or_slug.strip()
    slug_m = re.search(r'(?:addlist/|slug=)([A-Za-z0-9_-]+)', raw)
    slug = slug_m.group(1) if slug_m else raw.strip()
    slug = re.sub(r'[^A-Za-z0-9_-]', '', slug)
    if not slug:
        raise ValueError('Некорректная ссылка на папку Telegram (отсутствует slug)')

    # Try telegram.me first, then t.me
    page_html = ''
    for domain in ['telegram.me', 't.me']:
        try:
            req_url = f'https://{domain}/addlist/{slug}'
            req = urllib.request.Request(req_url, headers={'User-Agent': USER_AGENT})
            with urllib.request.urlopen(req, timeout=5) as resp:
                page_html = resp.read().decode('utf-8', errors='ignore')
            if 'Telegram Chats' in page_html or 'tgme_page' in page_html:
                break
        except Exception:
            continue

    if not page_html:
        raise RuntimeError('Не удалось загрузить страницу папки Telegram')

    # 1. Folder title
    title_m = re.search(r'<meta property="og:title" content="Telegram Chats:\s*([^"]+)">', page_html)
    if not title_m:
        title_m = re.search(r'from the <strong>([^<]+)</strong> list', page_html)
    folder_title = html.unescape(title_m.group(1)).strip() if title_m else f'Папка {slug[:8]}'

    # 2. Chat count
    count_m = re.search(r'<b>(\d+)\s*chats?</b>', page_html)
    chat_count = int(count_m.group(1)) if count_m else 0

    return {
        'success': True,
        'title': folder_title,
        'chatCount': chat_count,
        'slug': slug,
        'url': f'https://t.me/addlist/{slug}',
        'tgUrl': f'tg://addlist?slug={slug}'
    }

class handler(HandlerMixin, BaseHTTPRequestHandler):
    def do_GET(self):
        query_params = parse_qs(urlparse(self.path).query)
        target = query_params.get('url', [''])[0].strip() or query_params.get('slug', [''])[0].strip()
        if not target:
            return self.send_json(400, {'error': 'Укажите параметр ?url= или ?slug='})

        try:
            res = parse_telegram_addlist(target)
            return self.send_json(200, res)
        except Exception as e:
            return self.send_json(502, {'error': str(e)})

    def do_POST(self):
        content_len = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_len).decode('utf-8', errors='ignore') if content_len > 0 else '{}'
        try:
            body = json.loads(post_data or '{}')
        except Exception:
            body = {}

        target = body.get('url') or body.get('slug') or ''
        if not target:
            return self.send_json(400, {'error': 'Передайте {"url": "..."} или {"slug": "..."}'})

        try:
            res = parse_telegram_addlist(target)
            return self.send_json(200, res)
        except Exception as e:
            return self.send_json(502, {'error': str(e)})

    def do_OPTIONS(self):
        super().do_OPTIONS()
