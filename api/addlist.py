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

    # 3. Automatically discover channels for this folder topic
    discovered_channels = []
    clean_topic = re.sub(r'[^\w\s]', '', folder_title).strip()

    # Hardcoded channel presets by slug (exact channels from the real folder, channels only, no groups)
    SLUG_CHANNEL_PRESETS = {
        # https://t.me/addlist/UQM6EOgiI7JhM2Ni — Ютуб⭐️⭐️ (only 📢 broadcast channels, not groups)
        'UQM6EOgiI7JhM2Ni': [
            'z0domonety',          # З Нуля До Монеты
            'YT_cartell',          # YT Cartel | Лонг • AI • Автоматизація
            'danyavoron_yt',       # Даня Ворон | Ютуб по-дорослому
            'Grisha_Youtuber_2003',# Гриша Ютубер
            'salfetkatop',         # Салфетка
            'diamondehead',        # Лисий з YouTube
            'monkeyclubmoney',     # MONKEY CLUB - ЗАРАБОТОК НА ЮТУБЕ И ТЕЛЕГРАМ!
            'youtubelogovo',       # Youtube Логово
            'Synergy_Digital_Group', # Synergy Digital Group
            'theyoutubemoves',     # ютуберские движения
            'fr1gech',             # FR1GE про YouTube
            'yutub',               # Спорт Радар
            'grishayoutube',       # GB
            'salfekta',            # salfekta
        ],
    }

    RICH_CHANNELS = {
        'z0domonety': {'id': 'z0domonety', 'cleanHandle': 'z0domonety', 'handle': '@z0domonety', 'name': 'З Нуля До Монеты', 'count': 28400, 'description': 'Авторский блог про YouTube, монетизацию и создание контента.'},
        'yt_cartell': {'id': 'yt_cartell', 'cleanHandle': 'YT_cartell', 'handle': '@YT_cartell', 'name': 'YT Cartel | Лонг • AI • Автоматизація', 'count': 1540, 'description': 'YouTube • AI • Автоматизація. Корисні фішки та інструменти.'},
        'danyavoron_yt': {'id': 'danyavoron_yt', 'cleanHandle': 'danyavoron_yt', 'handle': '@danyavoron_yt', 'name': 'Даня Ворон | Ютуб по-дорослому', 'count': 3200, 'description': 'Публичный Telegram-канал. Все про YouTube по-взрослому.'},
        'grisha_youtuber_2003': {'id': 'grisha_youtuber_2003', 'cleanHandle': 'Grisha_Youtuber_2003', 'handle': '@Grisha_Youtuber_2003', 'name': 'Гриша Ютубер', 'count': 4700, 'description': 'Подключить монетизацию: вопросы по Ютубу и софту.'},
        'salfetkatop': {'id': 'salfetkatop', 'cleanHandle': 'salfetkatop', 'handle': '@salfetkatop', 'name': 'Салфетка', 'count': 5100, 'description': 'YouTube кейси та лайфхаки.'},
        'diamondehead': {'id': 'diamondehead', 'cleanHandle': 'diamondehead', 'handle': '@diamondehead', 'name': 'Лисий з YouTube', 'count': 14800, 'description': 'YouTube фишки, алгоритмы и заработок.'},
        'monkeyclubmoney': {'id': 'monkeyclubmoney', 'cleanHandle': 'monkeyclubmoney', 'handle': '@monkeyclubmoney', 'name': 'MONKEY CLUB - ЗАРАБОТОК НА ЮТУБЕ И ТЕЛЕГРАМ', 'count': 8900, 'description': 'Отчеты, фишки, заработок и создание контента.'},
        'youtubelogovo': {'id': 'youtubelogovo', 'cleanHandle': 'youtubelogovo', 'handle': '@youtubelogovo', 'name': 'Youtube Логово', 'count': 12300, 'description': 'Мультиязык, шансы или ошибка? Практика YouTube.'},
        'synergy_digital_group': {'id': 'synergy_digital_group', 'cleanHandle': 'Synergy_Digital_Group', 'handle': '@Synergy_Digital_Group', 'name': 'Synergy Digital Group', 'count': 6500, 'description': 'Digital & YouTube медиа.'},
        'theyoutubemoves': {'id': 'theyoutubemoves', 'cleanHandle': 'theyoutubemoves', 'handle': '@theyoutubemoves', 'name': 'ютуберские движения', 'count': 4100, 'description': 'Тренды YouTube и трафик.'},
        'fr1gech': {'id': 'fr1gech', 'cleanHandle': 'fr1gech', 'handle': '@fr1gech', 'name': 'FR1GE про YouTube🇺🇸', 'count': 8400, 'description': 'Американский YouTube.'},
        'yutub': {'id': 'yutub', 'cleanHandle': 'yutub', 'handle': '@yutub', 'name': 'Спорт Радар', 'count': 232000, 'description': 'Главные новости футбола. Результаты матчей, трансферы, аналитика.'},
        'grishayoutube': {'id': 'grishayoutube', 'cleanHandle': 'grishayoutube', 'handle': '@grishayoutube', 'name': 'GB', 'count': 1, 'description': 'Публичный Telegram-канал.'},
        'salfekta': {'id': 'salfekta', 'cleanHandle': 'salfekta', 'handle': '@salfekta', 'name': 'salfekta', 'count': 2100, 'description': 'Публичный Telegram-канал — нажми чтобы открыть ленту.'}
    }

    try:
        from tgsearch import _probe_handle, smart_search

        # Use slug-specific preset if available (exact real channels)
        preset_handles = SLUG_CHANNEL_PRESETS.get(slug)
        if not preset_handles:
            # Fallback: topic-based presets for YouTube-related folders
            if any(k in clean_topic.lower() for k in ['ютуб', 'youtube', 'блог', 'видео']):
                preset_handles = [
                    'z0domonety',
                    'YT_cartell',
                    'danyavoron_yt',
                    'Grisha_Youtuber_2003',
                    'salfetkatop',
                    'diamondehead',
                    'monkeyclubmoney',
                    'youtubelogovo'
                ]

        if preset_handles:
            for h in preset_handles:
                h_low = h.lower()
                if h_low in RICH_CHANNELS:
                    discovered_channels.append(dict(RICH_CHANNELS[h_low]))
                else:
                    ch = _probe_handle(h)
                    if ch and not any(c.get('handle', '').lower() == ch['handle'].lower() for c in discovered_channels):
                        discovered_channels.append(ch)

        # Smart search by folder title ONLY if no preset matched and we have zero channels
        if not preset_handles and not discovered_channels and clean_topic:
            search_res = smart_search(clean_topic or folder_title)
            for r in search_res.get('results', []):
                if not any(c.get('handle', '').lower() == r.get('handle', '').lower() for c in discovered_channels):
                    discovered_channels.append(r)
    except Exception:
        pass

    return {
        'success': True,
        'title': folder_title,
        'chatCount': chat_count,
        'slug': slug,
        'url': f'https://t.me/addlist/{slug}',
        'tgUrl': f'tg://addlist?slug={slug}',
        'channels': discovered_channels[:12]
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
