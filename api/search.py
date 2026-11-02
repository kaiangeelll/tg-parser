import sys
import os
from pathlib import Path

# Add root directory to sys.path so modules can be imported in Vercel Serverless
root_dir = str(Path(__file__).resolve().parent.parent)
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

from http.server import BaseHTTPRequestHandler
import json
import urllib.error
from tgfind import HandlerMixin, search_directory

class handler(HandlerMixin, BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            body = self.parse_body()
            query = str(body.get('query', '')).strip()
            item_type = str(body.get('type', 'channel')).strip()
            category = body.get('category')
            if not query:
                return self.send_json(400, {'error': 'Введи имя или тему канала'})
            if len(query) > 120:
                return self.send_json(400, {'error': 'Сократи запрос до 120 символов'})
            return self.send_json(200, search_directory(query, item_type=item_type, category=category))
        except urllib.error.HTTPError as error:
            return self.send_json(502, {'error': self.upstream_error(error)})
        except Exception as error:
            return self.send_json(502, {'error': str(error) or 'Не удалось выполнить поиск'})

    def do_OPTIONS(self):
        super().do_OPTIONS()

