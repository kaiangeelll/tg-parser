import sys
import os
from pathlib import Path

root_dir = str(Path(__file__).resolve().parent.parent)
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

from http.server import BaseHTTPRequestHandler
import urllib.error
from tgfind import HandlerMixin, rpc as tgfind_rpc
from tgsearch import smart_search


class handler(HandlerMixin, BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            body = self.parse_body()
            query = str(body.get('query', '')).strip()
            item_type = str(body.get('type', 'channel')).strip()
            category = body.get('category') or None

            if not query:
                return self.send_json(400, {'error': 'Введи имя или тему канала'})
            if len(query) > 120:
                return self.send_json(400, {'error': 'Сократи запрос до 120 символов'})

            # Handle Telegram folder share links: t.me/addlist/...
            if 'addlist' in query.lower():
                try:
                    from api.addlist import parse_telegram_addlist
                    addlist_data = parse_telegram_addlist(query)
                    return self.send_json(200, {
                        'is_addlist': True,
                        'addlist': addlist_data,
                        'results': [{
                            'handle': f"addlist_{addlist_data['slug'][:12]}",
                            'name': addlist_data['title'],
                            'summary': f"Папка Telegram с {addlist_data['chatCount']} чатами. Нажмите чтобы импортировать в ваши папки.",
                            'memberCount': addlist_data['chatCount'],
                            'categories': ['Папка Telegram', 'Addlist'],
                            'telegramUrl': addlist_data['url'],
                            '_source': 'telegram_addlist',
                            'isAddlist': True,
                            'addlistData': addlist_data
                        }]
                    })
                except Exception:
                    pass

            result = smart_search(
                query,
                item_type=item_type,
                category=category,
                tgfind_rpc=tgfind_rpc,
            )
            return self.send_json(200, result)

        except urllib.error.HTTPError as error:
            return self.send_json(502, {'error': self.upstream_error(error)})
        except Exception as error:
            return self.send_json(502, {'error': str(error) or 'Не удалось выполнить поиск'})

    def do_OPTIONS(self):
        super().do_OPTIONS()
