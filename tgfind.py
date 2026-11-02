import json
import re
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

UPSTREAM = 'https://tgfind.net/api/mcp'
USER_AGENT = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
              'AppleWebKit/537.36 (KHTML, like Gecko) '
              'Chrome/131.0.0.0 Safari/537.36')
STOP = {'найти','канал','каналы','тг','telegram','есть','такой','чел','мне','покажи',
        'поиск','ищу','пожалуйста','варианты','или','там','вот','что','бы','как','кто',
        'про','на','и','в','из','для'}
TRANSLIT = str.maketrans({'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo',
    'ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p',
    'р':'r','с':'s','т':'t','у':'u','ф':'f','х':'kh','ц':'ts','ч':'ch','ш':'sh',
    'щ':'shch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya'})
SYNONYMS = {'ютубер':['youtube','blogger','youtuber'],'ютуб':['youtube'],
    'блогер':['blogger','youtuber'],'гриша':['grisha','grish'],'грег':['greg'],
    'технологии':['technology','tech'],'новости':['news'],'игры':['gaming','games']}

import time

def rpc(method, params=None, retries=1):
    body=json.dumps({'jsonrpc':'2.0','id':1,'method':method,'params':params or {}},ensure_ascii=False).encode('utf-8')
    req=urllib.request.Request(UPSTREAM,data=body,headers={
        'Content-Type':'application/json','Accept':'application/json, text/event-stream',
        'User-Agent':USER_AGENT,'Origin':'https://tgfind.net','Referer':'https://tgfind.net/'})
    
    last_err = None
    for attempt in range(retries + 1):
        try:
            with urllib.request.urlopen(req,timeout=12) as response:
                payload=response.read().decode('utf-8')
            if payload.lstrip().startswith('data:'):
                payload='\n'.join(line[5:].strip() for line in payload.splitlines() if line.startswith('data:'))
            envelope=json.loads(payload)
            if envelope.get('error'):
                raise RuntimeError(envelope['error'].get('message','Каталог вернул ошибку'))
            result=envelope.get('result',{})
            if result.get('isError'):
                raise RuntimeError('Каталог не смог выполнить запрос')
            for item in result.get('content',[]):
                if item.get('type')=='text':
                    try: return json.loads(item.get('text','{}'))
                    except json.JSONDecodeError: pass
            return result
        except urllib.error.HTTPError as e:
            last_err = e
            if e.code in (403, 429) and attempt < retries:
                time.sleep(1.0)
                continue
            raise
        except Exception as e:
            last_err = e
            if attempt < retries:
                time.sleep(0.5)
                continue
            raise
    if last_err:
        raise last_err

def search_terms(query):
    tokens=re.findall(r'[\w@-]{2,}',query.lower(),flags=re.UNICODE)
    terms=[]
    for token in tokens:
        clean=token.lstrip('@')
        if clean in STOP: continue
        for value in [clean,clean.translate(TRANSLIT),*SYNONYMS.get(clean,[])]:
            value=value.strip()
            if len(value)>1 and value not in terms: terms.append(value)
    return terms[:8] or [query.strip()[:80]]

_CACHE = {}

def search_directory(query, item_type='channel', category=None):
    clean_q = query.strip()
    cache_key = (clean_q.lower(), item_type, category)
    if cache_key in _CACHE:
        return _CACHE[cache_key]

    type_val = item_type if item_type in ('channel', 'group', 'bot') else 'channel'
    terms = search_terms(clean_q)
    
    # Prioritize exact query first
    search_list = [clean_q]
    for t in terms:
        if t.lower() != clean_q.lower() and t not in search_list:
            search_list.append(t)
            
    records = {}
    # Fetch primary term first
    last_err = None
    for term in search_list[:2]:
        try:
            call_args = {'query': term, 'type': type_val, 'limit': 20}
            if category:
                call_args['category'] = category
            data = rpc('tools/call', {'name': 'search_directory', 'arguments': call_args})
            for row in data.get('results', []):
                key = (row.get('handle') or row.get('slug') or '').lower()
                if key:
                    records[key] = row
            if len(records) >= 15:
                break
        except urllib.error.HTTPError as e:
            last_err = e
            break
        except Exception as e:
            last_err = e
            pass

    if not records and last_err:
        # If upstream completely blocked or failed, give clean response
        if getattr(last_err, 'code', None) in (403, 429):
            return {
                'results': [],
                'source': 'TGFind public directory',
                'terms': terms,
                'rateLimited': True,
                'warning': 'Каталог временно ограничил частые запросы. Подожди 3-5 секунд и попробуй снова.'
            }

    words = [w for w in re.findall(r'[\w@-]{2,}', clean_q.lower(), flags=re.UNICODE) if w not in STOP]
    def score(row):
        name = (row.get('name') or '').lower()
        handle = (row.get('handle') or '').lower()
        summary = (row.get('summary') or '').lower()
        points = 0
        for word in words:
            variants = [word, word.translate(TRANSLIT), *SYNONYMS.get(word, [])]
            if any(v and v in name for v in variants): points += 6
            elif any(v and v in handle for v in variants): points += 5
            elif any(v and v in summary for v in variants): points += 2
        return points

    results = sorted(records.values(), key=lambda row: (-score(row), -(row.get('memberCount') or 0)))[:30]
    out = {'results': results, 'source': 'TGFind public directory', 'terms': terms}
    
    # Store in cache
    if len(_CACHE) > 100:
        _CACHE.clear()
    _CACHE[cache_key] = out
    return out

def get_channel(handle):
    return rpc('tools/call',{'name':'get_resource','arguments':{'handle':handle}})

class HandlerMixin:
    def send_json(self, status, payload):
        data = json.dumps(payload, ensure_ascii=False).encode('utf-8')
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

    def parse_body(self):
        length = int(self.headers.get('Content-Length', '0'))
        if length > 8192:
            raise ValueError('Слишком длинный запрос')
        return json.loads(self.rfile.read(length) or b'{}')

    def upstream_error(self, error):
        code = getattr(error, 'code', None)
        if code == 403:
            return 'Каталог временно блокирует запрос. Попробуй ещё раз чуть позже.'
        if code == 429:
            return 'Слишком много запросов. Подожди немного и попробуй снова.'
        return 'Публичный каталог временно недоступен. Попробуй ещё раз.'
