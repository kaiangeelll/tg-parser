import sys
import os
from pathlib import Path

# Add root directory to sys.path so modules can be imported in Vercel Serverless
root_dir = str(Path(__file__).resolve().parent.parent)
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import re
from tgfind import HandlerMixin
from tgparser import parse_telegram_preview

class handler(HandlerMixin, BaseHTTPRequestHandler):
    def do_GET(self):
        query_params = parse_qs(urlparse(self.path).query)
        handle = query_params.get('handle', [''])[0].lstrip('@').strip()
        
        # Clean potential t.me/ links
        handle = re.sub(r'^(?:https?:\/\/)?(?:www\.)?t\.me\/', '', handle, flags=re.IGNORECASE)
        handle = handle.split('/')[0].split('?')[0].strip()

        if not re.fullmatch(r'[A-Za-z0-9_]{3,32}', handle):
            return self.send_json(400, {'error': 'Некорректное публичное имя канала или ссылка'})
            
        try:
            data = parse_telegram_preview(handle)
            return self.send_json(200, data)
        except Exception as e:
            return self.send_json(502, {'error': str(e) or 'Не удалось загрузить посты канала'})

    def do_OPTIONS(self):
        super().do_OPTIONS()
