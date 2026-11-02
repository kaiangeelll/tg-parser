from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs
from pathlib import Path
import json
import re
import urllib.error
import tgfind
import tgparser
import tgsearch

ROOT = Path(__file__).resolve().parent

class Handler(BaseHTTPRequestHandler):
    def send_json(self, status, obj):
        data = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        
        # API: /api/channel
        if parsed.path == '/api/channel':
            handle = parse_qs(parsed.query).get('handle', [''])[0].lstrip('@').strip()
            handle = re.sub(r'^(?:https?:\/\/)?(?:www\.)?t\.me\/', '', handle, flags=re.IGNORECASE)
            handle = handle.split('/')[0].split('?')[0].strip()
            
            if not re.fullmatch(r'[A-Za-z0-9_]{3,32}', handle):
                return self.send_json(400, {'error': 'Некорректное публичное имя канала'})
            try:
                data = tgfind.get_channel(handle)
                if not data or not data.get('handle'):
                    return self.send_json(404, {'error': 'Канал не найден в публичном каталоге'})
                return self.send_json(200, {'channel': data})
            except urllib.error.HTTPError as e:
                return self.send_json(502, {'error': f'Каталог ответил ошибкой {e.code}'})
            except Exception as e:
                return self.send_json(502, {'error': str(e)})

        # API: /api/posts
        if parsed.path == '/api/posts':
            handle = parse_qs(parsed.query).get('handle', [''])[0].lstrip('@').strip()
            handle = re.sub(r'^(?:https?:\/\/)?(?:www\.)?t\.me\/', '', handle, flags=re.IGNORECASE)
            handle = handle.split('/')[0].split('?')[0].strip()
            
            if not re.fullmatch(r'[A-Za-z0-9_]{3,32}', handle):
                return self.send_json(400, {'error': 'Некорректное публичное имя канала'})
            try:
                data = tgparser.parse_telegram_preview(handle)
                return self.send_json(200, data)
            except Exception as e:
                return self.send_json(502, {'error': str(e)})

        # Static files
        clean_path = parsed.path.lstrip('/')
        if not clean_path or clean_path == 'index.html':
            clean_path = 'index.html'

        file_path = ROOT / clean_path
        if file_path.exists() and file_path.is_file():
            mime = 'text/plain'
            if clean_path.endswith('.html'):
                mime = 'text/html; charset=utf-8'
            elif clean_path.endswith('.js'):
                mime = 'text/javascript; charset=utf-8'
            elif clean_path.endswith('.css'):
                mime = 'text/css; charset=utf-8'
            elif clean_path.endswith('.json'):
                mime = 'application/json; charset=utf-8'
            elif clean_path.endswith('.svg'):
                mime = 'image/svg+xml'

            data = file_path.read_bytes()
            self.send_response(200)
            self.send_header('Content-Type', mime)
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return

        self.send_error(404)

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == '/api/search':
            try:
                length = int(self.headers.get('Content-Length', '0'))
                body = json.loads(self.rfile.read(length) or b'{}')
                query = str(body.get('query', '')).strip()
                item_type = str(body.get('type', 'channel')).strip()
                category = body.get('category')
                
                if not query:
                    return self.send_json(400, {'error': 'Введи имя или тему канала'})
                if len(query) > 120:
                    return self.send_json(400, {'error': 'Сократи запрос до 120 символов'})
                    
                data = tgsearch.smart_search(
                    query,
                    item_type=item_type,
                    category=category,
                    tgfind_rpc=tgfind.rpc,
                )
                return self.send_json(200, data)
            except urllib.error.HTTPError as e:
                return self.send_json(502, {'error': f'Каталог временно недоступен ({e.code})'})
            except Exception as e:
                return self.send_json(502, {'error': f'Ошибка поиска: {e}'})

        self.send_error(404)

    def log_message(self, fmt, *args):
        # Concise logging
        print('%s - %s' % (self.address_string(), fmt % args))

if __name__ == '__main__':
    port = 8765
    server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    print(f'Telegram Channel Search & Parser: http://127.0.0.1:{port}')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
