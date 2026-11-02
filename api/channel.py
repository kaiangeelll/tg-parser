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
import urllib.error
from tgfind import HandlerMixin, get_channel

class handler(HandlerMixin, BaseHTTPRequestHandler):
    def do_GET(self):
        handle = parse_qs(urlparse(self.path).query).get('handle', [''])[0].lstrip('@').strip()
        handle = re.sub(r'^(?:https?:\/\/)?(?:www\.)?t\.me\/', '', handle, flags=re.IGNORECASE)
        handle = handle.split('/')[0].split('?')[0].strip()

        if not re.fullmatch(r'[A-Za-z0-9_]{3,32}', handle):
            return self.send_json(400, {'error': 'Некорректное публичное имя канала'})
        try:
            channel = get_channel(handle)
            if not channel or not channel.get('handle'):
                return self.send_json(404, {'error': 'Канал не найден в публичном каталоге'})
            return self.send_json(200, {'channel': channel})
        except urllib.error.HTTPError as error:
            return self.send_json(502, {'error': self.upstream_error(error)})
        except Exception:
            return self.send_json(502, {'error': 'Не удалось загрузить канал из каталога'})

    def do_OPTIONS(self):
        super().do_OPTIONS()

