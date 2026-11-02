# 🚀 TG Search & Parser — Поиск и парсер Telegram-каналов

Современное веб-приложение для поиска публичных каналов, групп и ботов Telegram, чтения их ленты сообщений, парсинга постов и мгновенного копирования контента. Имеет открытый REST API с поддержкой CORS для интеграции с другими сайтами.

![Telegram Parser](https://img.shields.io/badge/Telegram-Parser-2481cc?style=for-the-badge&logo=telegram&logoColor=white)
![Vercel Ready](https://img.shields.io/badge/Vercel-Ready-black?style=for-the-badge&logo=vercel&logoColor=white)
![Python 3](https://img.shields.io/badge/Python-3.9+-3776ab?style=for-the-badge&logo=python&logoColor=white)

---

## ✨ Возможности

- 🔎 **Умный поиск**:
  - По названию, ключевым словам или тематике.
  - По точному `@username` или ссылке `t.me/...`.
  - Фильтры по типу: **Каналы**, **Группы**, **Боты**.
  - Быстрые тематические теги: *Новости, IT, Крипта, Бизнес, Дизайн, Игры, Образование*.
- 📰 **Читалка & Парсер постов**:
  - Просмотр последних сообщений любого канала в реальном времени.
  - Отображение даты публикации, количества просмотров и медиа.
  - Кнопка **«Скопировать текст»** на каждом посте в один клик.
  - Кнопка **«Скопировать все посты»** — формирует единый структурированный текст.
  - Кнопка **«Экспорт в JSON»** — выгрузка полного дампа канала и сообщений.
- ⚡ **API для интеграции с твоим сайтом**:
  - Все эндпоинты отдают чистый JSON.
  - Включён CORS (`Access-Control-Allow-Origin: *`) — запросы работают из браузера с любого домена без прокси.
- 🎨 **Современный интерфейс**:
  - Премиальный дизайн с эффектом стеклянного размытия (Glassmorphism).
  - Тёмная и светлая темы с сохранением настроек.
  - Адаптивность для телефонов, планшетов и ПК.
  - Локальная подборка избранных каналов (`localStorage`).

---

## 🛠️ Запуск локально

1. Запусти `start.bat` (или выполни `python server.py`).
2. Открой в браузере: **http://127.0.0.1:8765**

Требования: установленный Python 3 (сторонние pip-библиотеки не требуются, всё работает на стандартной библиотеке Python).

---

## 🌐 Деплой на Vercel через Git

Проект полностью настроен под Vercel Serverless:
- Конфигурация в `vercel.json`
- Серверные функции в папке `api/` (`api/search.py`, `api/channel.py`, `api/posts.py`)
- Статический фронтенд в корне (`index.html`, `style.css`, `app.js`)

### Шаги для публикации:
1. Запушь репозиторий в GitHub:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   gh repo create tg-parser --public --source=. --push
   ```
2. Открой [vercel.com/new](https://vercel.com/new).
3. Выбери репозиторий `tg-parser` и нажми **Deploy**.
4. Всё готово! Сайт получит свой публичный адрес вида `https://tg-parser-***.vercel.app`.

---

## 🔌 Документация API для твоего другого сайта

Сервер поддерживает прямые запросы с других сайтов благодаря CORS.

### 1. Поиск каналов (`POST /api/search`)
```javascript
const response = await fetch('https://твой-сайт.vercel.app/api/search', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: 'криптовалюта',
    type: 'channel' // 'channel' | 'group' | 'bot'
  })
});
const data = await response.json();
console.log(data.results);
```

### 2. Парсинг постов канала (`GET /api/posts`)
```javascript
const response = await fetch('https://твой-сайт.vercel.app/api/posts?handle=durov');
const data = await response.json();
console.log(data.posts); // Массив постов: [{ id, text, date, views, url }]
```

### 3. Получение инфо о канале (`GET /api/channel`)
```javascript
const response = await fetch('https://твой-сайт.vercel.app/api/channel?handle=durov');
const data = await response.json();
console.log(data.channel); // Информация о канале
```
