"""
ai_engine.py — AI-powered Telegram Channel Intelligence Engine.
Connects to local OpenAI-compatible server at http://127.0.0.1:8317/v1 (CarteLink / LocalAI)
or any configured OpenAI endpoint to analyze queries and predict exact channels.
"""

import os
import json
import re
import urllib.request
import urllib.error

DEFAULT_BASE_URL = os.environ.get('AI_BASE_URL', 'http://127.0.0.1:8317/v1').rstrip('/')
DEFAULT_API_KEY = os.environ.get('AI_API_KEY', 'cl-885f43fbc6f028319aa6e6c7b71e8f1a792953512598f8e3')
DEFAULT_MODEL = os.environ.get('AI_MODEL', 'gemini-3.5-flash-lite')

def get_ai_suggestions(query: str, timeout: int = 4) -> dict:
    """
    Asks the AI to predict exact Telegram handles and synonyms for a given query.
    Returns: { 'handles': list[str], 'keywords': list[str], 'ai_used': bool }
    """
    clean_q = query.strip()
    if not clean_q or len(clean_q) > 100:
        return {'handles': [], 'keywords': [], 'ai_used': False}

    # If it's already a direct link or handle, no need for heavy AI prompt
    if clean_q.startswith('@') or clean_q.startswith('t.me') or clean_q.startswith('http'):
        return {'handles': [], 'keywords': [], 'ai_used': False}

    prompt = (
        f'Ты эксперт по Telegram. Пользователь ищет каналы по запросу: "{clean_q}".\n'
        'Предскажи наиболее вероятные реальные публичные @username каналов (латиницей, 3-32 символа, без @) '
        'и ключевые слова для каталогов.\n'
        'Ответь ТОЛЬКО валидным JSON без лишних слов:\n'
        '{"handles": ["nick1", "nick2", "nick3", "nick4", "nick5", "nick6"], "keywords": ["kw1", "kw2"]}'
    )

    payload = {
        'model': DEFAULT_MODEL,
        'messages': [{'role': 'user', 'content': prompt}],
        'temperature': 0.1,
        'max_tokens': 200
    }

    url = f'{DEFAULT_BASE_URL}/chat/completions'
    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {DEFAULT_API_KEY}'
    }

    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode('utf-8'),
            headers=headers
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            raw_text = data['choices'][0]['message']['content'].strip()
            
            # Extract JSON block if wrapped in ```json
            json_m = re.search(r'\{[\s\S]*\}', raw_text)
            if json_m:
                parsed = json.loads(json_m.group(0))
                handles = [
                    re.sub(r'[^a-zA-Z0-9_]', '', str(h).replace('@', '')).lower()
                    for h in parsed.get('handles', [])
                    if len(str(h).strip()) >= 3
                ]
                keywords = [str(k).strip() for k in parsed.get('keywords', []) if str(k).strip()]
                return {
                    'handles': handles[:8],
                    'keywords': keywords[:5],
                    'ai_used': True,
                    'model': DEFAULT_MODEL
                }
    except Exception:
        # Fallback silently if AI server is offline or unreachable
        pass

    return {'handles': [], 'keywords': [], 'ai_used': False}
