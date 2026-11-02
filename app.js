// TG Search & Parser App
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

// State
let catalog = new Map();
let currentResults = [];
let savedChannels = JSON.parse(localStorage.getItem('tg_saved_channels') || '[]');
let activeType = 'channel';
let activeCat = 'all';
let currentQuery = '';
let isSearching = false;
let currentChannelData = null;
let currentPostsData = [];

// Fallback initial recommendations so page has content immediately
const INITIAL_PROMPTS = ['новости', 'технологии', 'дизайн', 'разработка', 'нейросети', 'крипта'];

// Toast notification
function notify(text, duration = 2500) {
  const toast = $('#toast');
  const toastText = $('#toastText');
  toastText.textContent = text;
  toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.classList.remove('show');
  }, duration);
}

// Copy to clipboard helper
async function copyToClipboard(text, successMsg = 'Скопировано в буфер!') {
  try {
    await navigator.clipboard.writeText(text);
    notify(successMsg);
  } catch (err) {
    // Fallback
    const input = document.createElement('textarea');
    input.value = text;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
    notify(successMsg);
  }
}

// Number formatting
function formatSubs(count) {
  if (!count && count !== 0) return '—';
  const n = Number(count);
  if (isNaN(n)) return String(count);
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toLocaleString('ru-RU');
}

// Escape HTML
function esc(str = '') {
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

// Normalize channel record
function normalizeChannel(raw) {
  const handleRaw = raw.handle || raw.slug || '';
  const cleanHandle = String(handleRaw).replace(/^@/, '').replace(/^(?:https?:\/\/)?(?:www\.)?t\.me\//i, '').trim();
  const id = cleanHandle.toLowerCase() || Math.random().toString(36).slice(2);
  
  const existing = catalog.get(id) || {};
  const channel = {
    ...existing,
    ...raw,
    id,
    handle: cleanHandle ? '@' + cleanHandle : '@unknown',
    cleanHandle,
    name: raw.name || raw.title || cleanHandle || 'Канал',
    count: raw.memberCount ?? raw.count ?? existing.count ?? null,
    description: raw.summary || raw.description || existing.description || 'Публичный Telegram-канал.',
    category: Array.isArray(raw.categories) ? raw.categories.join(', ') : (raw.category || raw.type || 'Канал'),
    url: raw.telegramUrl || raw.url || `https://t.me/${cleanHandle}`,
    avatar: raw.avatar || raw.photo || null
  };
  
  catalog.set(id, channel);
  return channel;
}

// Saved channels management
function isSaved(id) {
  return savedChannels.some(c => c.id === id);
}

function toggleSave(id) {
  const channel = catalog.get(id);
  if (!channel) return;
  
  if (isSaved(id)) {
    savedChannels = savedChannels.filter(c => c.id !== id);
    notify(`Удалено из подборки: ${channel.handle}`);
  } else {
    savedChannels.unshift(channel);
    notify(`Сохранено: ${channel.handle}`);
  }
  
  localStorage.setItem('tg_saved_channels', JSON.stringify(savedChannels));
  renderSaved();
  renderCards();
}

// Render cards
function renderCards() {
  const list = currentResults;
  const cardsList = $('#cardsList');
  const resultsCount = $('#resultsCount');
  
  if (isSearching) {
    resultsCount.textContent = 'поиск...';
    cardsList.innerHTML = `
      <div class="empty-box">
        <div class="empty-icon">⏳</div>
        <div>Ищем в каталоге публичных каналов...</div>
      </div>
    `;
    return;
  }

  resultsCount.textContent = `${list.length} найдено`;

  if (!list.length) {
    cardsList.innerHTML = `
      <div class="empty-box">
        <div class="empty-icon">🔍</div>
        <div>Ничего не найдено по этому запросу.<br>Попробуй другое слово, например: «новости», «крипта», «python» или прямую ссылку <b>t.me/username</b></div>
      </div>
    `;
    return;
  }

  cardsList.innerHTML = list.map(c => {
    const saved = isSaved(c.id);
    const initial = (c.name || c.cleanHandle || '?')[0].toUpperCase();
    const avatarHtml = c.avatar 
      ? `<img src="${esc(c.avatar)}" alt="" loading="lazy">` 
      : initial;

    return `
      <article class="channel-card" data-channel-id="${esc(c.id)}">
        <div class="channel-avatar">
          ${avatarHtml}
        </div>

        <div class="channel-info">
          <div class="channel-name-row">
            <span class="channel-title">${esc(c.name)}</span>
            <svg class="verified-icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="m12 2 2.4 2.8 3.7-.5 1 3.5 3.3 1.7-1 3.5 1.7 3.3-2.8 2.4.5 3.7-3.5 1-1.7 3.3-3.5-1-3.3 1.7-2.4-2.8-3.7.5-1-3.5-3.3-1.7 1-3.5-1.7-3.3 2.8-2.4-.5-3.7 3.5-1 1.7-3.3 3.5 1 3.3-1.7z"/>
            </svg>
          </div>

          <div class="channel-handle-row">
            <span>${esc(c.handle)}</span>
            <span class="channel-cat-pill">${esc(c.category)}</span>
          </div>

          <div class="channel-desc">${esc(c.description)}</div>
        </div>

        <div class="channel-stats">
          <div class="channel-subs">${esc(formatSubs(c.count))}</div>
          <div class="channel-subs-label">подписчиков</div>
        </div>

        <div class="channel-actions">
          <button class="btn-card-action ${saved ? 'active' : ''}" data-action="save" data-id="${esc(c.id)}" title="${saved ? 'Удалить из сохранённых' : 'Сохранить'}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="${saved ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
              <path d="m19 21-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
            </svg>
          </button>
          <button class="btn-card-action" data-action="copy" data-text="${esc(c.handle)}" title="Скопировать ник">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
          </button>
        </div>
      </article>
    `;
  }).join('');
}

// Render saved channels in sidebar
function renderSaved() {
  const container = $('#savedList');
  if (!savedChannels.length) {
    container.innerHTML = `
      <div style="text-align: center; color: var(--text-dim); padding: 18px 0; font-size: 12.5px;">
        Здесь появятся каналы,<br>которые ты добавишь в избранное
      </div>
    `;
    return;
  }

  container.innerHTML = savedChannels.map(c => {
    const initial = (c.name || c.cleanHandle || '?')[0].toUpperCase();
    return `
      <div class="saved-item" data-channel-id="${esc(c.id)}">
        <div class="saved-avatar">${initial}</div>
        <div class="saved-name">${esc(c.name)}</div>
        <div class="saved-subs">${esc(formatSubs(c.count))}</div>
      </div>
    `;
  }).join('');
}

// Search API
async function performSearch(queryText = '') {
  const input = queryText || $('#searchInput').value.trim();
  if (!input) {
    notify('Введи название, ключевое слово или ник канала');
    return;
  }

  // Check if input is a direct link or @handle
  const isDirect = input.startsWith('@') || /^https?:\/\//i.test(input) || /^t\.me\//i.test(input);
  if (isDirect) {
    await fetchSingleChannel(input);
    return;
  }

  currentQuery = input;
  isSearching = true;
  $('#searchBtn').disabled = true;
  $('#resultsHeading').textContent = `Результаты: «${input}»`;
  renderCards();

  try {
    const res = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: input,
        type: activeType,
        category: activeCat === 'all' ? null : activeCat
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Ошибка поиска');

    if (data.warning && (!data.results || !data.results.length)) {
      notify(data.warning, 4000);
    }

    currentResults = (data.results || []).map(normalizeChannel);
    if (!currentResults.length && !data.warning) {
      notify('По запросу ничего не найдено');
    }
  } catch (err) {
    notify(err.message || 'Ошибка соединения с сервером');
    $('#cardsList').innerHTML = `
      <div class="empty-box">
        <div class="empty-icon">⚠️</div>
        <div>${esc(err.message)}</div>
      </div>
    `;
  } finally {
    isSearching = false;
    $('#searchBtn').disabled = false;
    renderCards();
  }
}

// Fetch single channel by handle/link
async function fetchSingleChannel(value) {
  let handle = value.replace(/^(?:https?:\/\/)?(?:www\.)?t\.me\//i, '').replace(/^@/, '').split('/')[0].split('?')[0].trim();
  if (!handle) return;

  isSearching = true;
  $('#searchBtn').disabled = true;
  $('#resultsHeading').textContent = `Канал @${handle}`;
  renderCards();

  try {
    const res = await fetch(`/api/channel?handle=${encodeURIComponent(handle)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Канал не найден');

    const channel = normalizeChannel(data.channel);
    currentResults = [channel];
    openChannelModal(channel.id);
  } catch (err) {
    // If not in catalog, still allow direct opening in reader
    const fallbackChannel = normalizeChannel({ handle, name: handle });
    currentResults = [fallbackChannel];
    openChannelModal(fallbackChannel.id);
  } finally {
    isSearching = false;
    $('#searchBtn').disabled = false;
    renderCards();
  }
}

// Load posts for channel & open modal
async function openChannelModal(id) {
  const channel = catalog.get(id) || savedChannels.find(c => c.id === id);
  if (!channel) return;

  currentChannelData = channel;
  currentPostsData = [];

  const initial = (channel.name || channel.cleanHandle || '?')[0].toUpperCase();
  const avatarHtml = channel.avatar 
    ? `<img src="${esc(channel.avatar)}" alt="">` 
    : initial;

  $('#modalChannelHead').innerHTML = `
    <div class="modal-avatar">${avatarHtml}</div>
    <div>
      <div class="modal-title">${esc(channel.name)}</div>
      <div class="modal-handle">${esc(channel.handle)} · ${esc(formatSubs(channel.count))} подписчиков</div>
    </div>
  `;

  $('#modalChannelDesc').textContent = channel.description || 'Описание отсутствует.';
  $('#modalOpenTelegram').href = channel.url || `https://t.me/${channel.cleanHandle}`;
  $('#postsStatus').textContent = 'загружаю посты (парсер)...';
  $('#postsContainer').innerHTML = `
    <div class="empty-box" style="padding: 24px 0;">
      <div class="empty-icon">⏳</div>
      <div>Парсим свежие сообщения канала...</div>
    </div>
  `;

  $('#channelModal').classList.add('open');

  // Fetch posts from /api/posts
  try {
    const res = await fetch(`/api/posts?handle=${encodeURIComponent(channel.cleanHandle)}`);
    const data = await res.json();
    
    if (data.posts && data.posts.length) {
      currentPostsData = data.posts;
      $('#postsStatus').textContent = `${data.posts.length} постов загружено`;
      renderPosts(data.posts, channel);
    } else {
      $('#postsStatus').textContent = 'сообщений не найдено';
      $('#postsContainer').innerHTML = `
        <div class="empty-box" style="padding: 24px 0;">
          <div class="empty-icon">📭</div>
          <div>Лента канала пуста или является приватной.</div>
        </div>
      `;
    }
  } catch (err) {
    $('#postsStatus').textContent = 'не удалось получить посты';
    $('#postsContainer').innerHTML = `
      <div class="empty-box" style="padding: 24px 0;">
        <div class="empty-icon">⚠️</div>
        <div>Не удалось загрузить сообщения: ${esc(err.message)}</div>
      </div>
    `;
  }
}

// Render posts in modal
function renderPosts(posts, channel) {
  const container = $('#postsContainer');
  container.innerHTML = posts.map(p => {
    return `
      <div class="post-card">
        <div class="post-meta">
          <div class="post-meta-left">
            <span>#${esc(p.id)}</span>
            <span>${esc(p.date || 'Недавно')}</span>
          </div>
          ${p.views ? `
            <div class="post-views">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              <span>${esc(p.views)}</span>
            </div>
          ` : ''}
        </div>

        <div class="post-text">${esc(p.text || '[Медиа/Фото без текста]')}</div>

        <div class="post-actions">
          <button class="btn-post-copy" data-copy-post="${esc(p.text || '')}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            Скопировать текст
          </button>
          <a class="btn-post-copy" href="${esc(p.url || channel.url)}" target="_blank" rel="noopener">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            Пост в TG
          </a>
        </div>
      </div>
    `;
  }).join('');
}

// Download JSON export
function exportChannelJson() {
  if (!currentChannelData) return;
  const payload = {
    exportedAt: new Date().toISOString(),
    channel: currentChannelData,
    posts: currentPostsData
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${currentChannelData.cleanHandle}_parsed.json`;
  a.click();
  URL.revokeObjectURL(url);
  notify('JSON файл скачан!');
}

// Copy all posts
function copyAllPosts() {
  if (!currentPostsData || !currentPostsData.length) {
    notify('Нет постов для копирования');
    return;
  }
  const text = currentPostsData.map((p, idx) => {
    return `[Пост #${p.id} | ${p.date || ''} | ${p.views ? p.views + ' просм.' : ''}]\n${p.text || ''}\n`;
  }).join('\n----------------------------------------\n\n');

  copyToClipboard(text, `Все ${currentPostsData.length} постов скопированы!`);
}

// Event Listeners Setup
function initEvents() {
  // Search submit
  $('#searchBtn').onclick = () => performSearch();
  $('#searchInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') performSearch();
  });

  // Type switchers
  $('#typeSwitch').onclick = e => {
    const btn = e.target.closest('.type-btn');
    if (!btn) return;
    $$('#typeSwitch .type-btn').forEach(b => b.classList.toggle('active', b === btn));
    activeType = btn.dataset.type;
    performSearch();
  };

  // Category tags
  $('#categoryTags').onclick = e => {
    const btn = e.target.closest('.tag-btn');
    if (!btn) return;
    $$('#categoryTags .tag-btn').forEach(b => b.classList.toggle('active', b === btn));
    activeCat = btn.dataset.cat;
    
    // Auto-search tag
    if (activeCat !== 'all') {
      $('#searchInput').value = btn.textContent.trim();
    }
    performSearch();
  };

  // Cards list click (delegation)
  $('#cardsList').onclick = e => {
    const actionBtn = e.target.closest('[data-action]');
    if (actionBtn) {
      e.stopPropagation();
      const action = actionBtn.dataset.action;
      if (action === 'save') {
        toggleSave(actionBtn.dataset.id);
      } else if (action === 'copy') {
        copyToClipboard(actionBtn.dataset.text, 'Ник канала скопирован!');
      }
      return;
    }

    const card = e.target.closest('[data-channel-id]');
    if (card) {
      openChannelModal(card.dataset.channelId);
    }
  };

  // Saved list click
  $('#savedList').onclick = e => {
    const item = e.target.closest('[data-channel-id]');
    if (item) {
      openChannelModal(item.dataset.channelId);
    }
  };

  // Clear saved
  $('#clearSavedBtn').onclick = () => {
    if (!savedChannels.length) return;
    savedChannels = [];
    localStorage.removeItem('tg_saved_channels');
    renderSaved();
    renderCards();
    notify('Подборка очищена');
  };

  // Modal actions
  $('#closeChannelModal').onclick = () => $('#channelModal').classList.remove('open');
  $('#channelModal').onclick = e => {
    if (e.target === $('#channelModal')) $('#channelModal').classList.remove('open');
  };

  $('#modalCopyHandle').onclick = () => {
    if (currentChannelData) copyToClipboard(currentChannelData.handle, 'Ник канала скопирован!');
  };
  $('#modalCopyLink').onclick = () => {
    if (currentChannelData) copyToClipboard(currentChannelData.url, 'Ссылка на канал скопирована!');
  };
  $('#modalCopyAllPosts').onclick = copyAllPosts;
  $('#modalDownloadJson').onclick = exportChannelJson;

  // Copy post text click inside modal
  $('#postsContainer').onclick = e => {
    const copyBtn = e.target.closest('[data-copy-post]');
    if (copyBtn) {
      const text = copyBtn.dataset.copyPost;
      copyToClipboard(text, 'Текст поста скопирован!');
      copyBtn.classList.add('copied');
      setTimeout(() => copyBtn.classList.remove('copied'), 1500);
    }
  };

  // API modal
  const openApi = () => $('#apiModal').classList.add('open');
  const closeApi = () => $('#apiModal').classList.remove('open');
  $('#openApiModal').onclick = openApi;
  $('#promoApiBtn').onclick = openApi;
  $('#closeApiModal').onclick = closeApi;
  $('#apiModal').onclick = e => {
    if (e.target === $('#apiModal')) closeApi();
  };

  // Copy code blocks
  $$('.copy-code-btn').forEach(btn => {
    btn.onclick = () => {
      const targetId = btn.dataset.target;
      const el = document.getElementById(targetId);
      if (el) {
        copyToClipboard(el.textContent, 'Код скопирован!');
      }
    };
  });

  // Theme toggle
  const savedTheme = localStorage.getItem('tg_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  $('#themeToggle').onclick = () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('tg_theme', next);
    notify(`Включена ${next === 'dark' ? 'тёмная' : 'светлая'} тема`);
  };
}

// Initial load
async function init() {
  initEvents();
  renderSaved();
  
  // Pick random trending topic for initial display
  const initialTopic = INITIAL_PROMPTS[Math.floor(Math.random() * INITIAL_PROMPTS.length)];
  $('#searchInput').value = initialTopic;
  await performSearch(initialTopic);
}

document.addEventListener('DOMContentLoaded', init);
