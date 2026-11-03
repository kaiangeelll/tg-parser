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
let isAscendingOrder = true; // true = TG style (top: older, bottom: newer), false = newest first
let filterPostText = '';

// Fallback initial recommendations
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

// Format message text with in-app Telegram links interception
function formatPostHtml(rawText, currentHandle) {
  if (!rawText) return '<span style="color: var(--text-dim); font-style: italic;">[Медиа / запись без текста]</span>';
  
  const curH = (currentHandle || '').toLowerCase().replace(/^@/, '');
  let safe = esc(rawText);

  // 1. In-app links to specific posts: https://t.me/channel/123
  safe = safe.replace(/https?:\/\/t\.me\/([A-Za-z0-9_]+)\/(\d+)/gi, (match, ch, pid) => {
    if (ch.toLowerCase() === curH) {
      return `<a href="#post-bubble-${pid}" class="tg-inapp-jump" data-jump-post="${pid}">💬 Сообщение #${pid}</a>`;
    } else {
      return `<a href="#" class="tg-inapp-channel" data-open-channel="${ch}" data-open-post="${pid}">↗ @${ch} #${pid}</a>`;
    }
  });

  // 2. In-app links to channels: https://t.me/channel
  safe = safe.replace(/https?:\/\/t\.me\/([A-Za-z0-9_]{3,32})(?![/\w])/gi, (match, ch) => {
    if (ch.toLowerCase() === 's') return match;
    return `<a href="#" class="tg-inapp-channel" data-open-channel="${ch}">↗ @${ch}</a>`;
  });

  // 3. User mentions: @channel
  safe = safe.replace(/(^|[^A-Za-z0-9_])@([A-Za-z0-9_]{4,32})/gi, (match, prefix, ch) => {
    return `${prefix}<a href="#" class="tg-inapp-channel" data-open-channel="${ch}">@${ch}</a>`;
  });

  // 4. Regular external web links
  safe = safe.replace(/(https?:\/\/(?!t\.me\/)[^\s<>"']+)/gi, (match) => {
    return `<a href="${match}" target="_blank" rel="noopener" style="color: var(--accent); text-decoration: underline;">${match}</a>`;
  });

  // Strip trailing reaction lines (e.g. _**🔥**_ 36 _**👍**_ 27)
  safe = safe.replace(/(?:\s*_[*]{2}[^*]+[*]{2}_\s*[\d.,KMB]*)+\s*$/gi, '');
  safe = safe.replace(/\n+\s*(?:_\*\*[^\n*]+\*\*_\s*|\d+[KMB]?\s*)+\s*$/gi, '');

  return safe.trim();
}

// Normalize channel record
function normalizeChannel(raw) {
  const handleRaw = raw.handle || raw.slug || '';
  const cleanHandle = String(handleRaw).replace(/^@/, '').replace(/^(?:https?:\/\/)?(?:www\.)?t\.me\//i, '').trim();
  const id = cleanHandle.toLowerCase() || Math.random().toString(36).slice(2);
  
  const existing = catalog.get(id) || {};
  const isDirectProbe = raw._source === 'direct_probe';
  const isAiMatched = raw._source === 'ai_matched';

  const channel = {
    ...existing,
    ...raw,
    id,
    handle: cleanHandle ? '@' + cleanHandle : '@unknown',
    cleanHandle,
    name: raw.name || raw.title || cleanHandle || 'Канал',
    count: raw.memberCount ?? raw.count ?? existing.count ?? null,
    description: raw.summary || raw.description || existing.description || (isAiMatched ? 'Канал найден через CarteLink ИИ анализ.' : (isDirectProbe ? 'Публичный Telegram-канал — нажми чтобы открыть ленту.' : 'Публичный Telegram-канал.')),
    category: Array.isArray(raw.categories) && raw.categories.length ? raw.categories.join(', ') : (raw.category || raw.type || (isAiMatched ? 'ИИ совпадение' : (isDirectProbe ? 'Канал (прямой поиск)' : 'Канал'))),
    url: raw.telegramUrl || raw.url || `https://t.me/${cleanHandle}`,
    avatar: raw.avatar || raw.avatarUrl || raw.photo || existing.avatar || null,
    isDirectProbe,
    isAiMatched,
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

// Render cards list
function renderCards() {
  const list = currentResults;
  const cardsList = $('#cardsList');
  const resultsCount = $('#resultsCount');
  
  if (isSearching) {
    resultsCount.textContent = 'поиск...';
    cardsList.innerHTML = `
      <div class="empty-box">
        <div class="empty-icon">🔍</div>
        <div>Ищем в каталоге и проверяем точные имена каналов...</div>
      </div>
    `;
    return;
  }

  resultsCount.textContent = `${list.length} найдено`;

  if (!list.length) {
    cardsList.innerHTML = `
      <div class="empty-box">
        <div class="empty-icon">🔍</div>
        <div>Ничего не найдено.<br>Попробуй по-другому: <b>«новости»</b>, <b>«@ник»</b>, <b>«t.me/username»</b> или напиши имя канала латиницей.</div>
      </div>
    `;
    return;
  }

  cardsList.innerHTML = list.map(c => {
    const saved = isSaved(c.id);
    const initial = (c.name || c.cleanHandle || '?')[0].toUpperCase();
    const avatarHtml = c.avatar 
      ? `<img src="${esc(c.avatar)}" alt="${esc(c.name)}" loading="lazy" onerror="this.style.display='none'; this.parentElement.innerText='${initial}';">` 
      : initial;

    return `
      <article class="channel-card" data-channel-id="${esc(c.id)}">
        <div class="channel-avatar">
          ${avatarHtml}
        </div>

        <div class="channel-info">
          <div class="channel-name-row">
            <span class="channel-title">${esc(c.name)}</span>
            ${c.isDirectProbe ? '' : `<svg class="verified-icon" viewBox="0 0 24 24" fill="currentColor"><path d="m12 2 2.4 2.8 3.7-.5 1 3.5 3.3 1.7-1 3.5 1.7 3.3-2.8 2.4.5 3.7-3.5 1-1.7 3.3-3.5-1-3.3 1.7-2.4-2.8-3.7.5-1-3.5-3.3-1.7 1-3.5-1.7-3.3 2.8-2.4-.5-3.7 3.5-1 1.7-3.3 3.5 1 3.3-1.7z"/></svg>`}
          </div>

          <div class="channel-handle-row">
            <span>${esc(c.handle)}</span>
            ${c.isAiMatched ? `<span class="channel-cat-pill" style="color:#38d39f;border-color:rgba(56,211,159,0.4);background:rgba(56,211,159,0.1);">🤖 Найдено ИИ</span>` : `<span class="channel-cat-pill">${esc(c.category)}</span>`}
          </div>

          <div class="channel-desc">${esc(c.description)}</div>
        </div>

        <div class="channel-stats">
          <div class="channel-subs">${c.count != null ? esc(formatSubs(c.count)) : '—'}</div>
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
    if (data.ai_used) {
      $('#resultsHeading').innerHTML = `Результаты: «${esc(input)}» <span style="font-size:11.5px;color:#38d39f;font-weight:700;margin-left:8px;background:rgba(56,211,159,0.12);padding:2px 8px;border-radius:10px;">🤖 ИИ активен</span>`;
    }
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
    const fallbackChannel = normalizeChannel({ handle, name: handle });
    currentResults = [fallbackChannel];
    openChannelModal(fallbackChannel.id);
  } finally {
    isSearching = false;
    $('#searchBtn').disabled = false;
    renderCards();
  }
}

// Helper to update channel avatar across DOM elements
function updateChannelAvatarInDom(cleanHandle, avatarUrl) {
  if (!cleanHandle || !avatarUrl) return;
  const id = cleanHandle.toLowerCase();
  const ch = catalog.get(id);
  if (ch) ch.avatar = avatarUrl;
  const saved = savedChannels.find(s => s.id === id);
  if (saved) {
    saved.avatar = avatarUrl;
    localStorage.setItem('tg_saved_channels', JSON.stringify(savedChannels));
  }

  // Update modal avatar
  const modalAvatar = $('#modalChannelHead')?.querySelector('.modal-avatar');
  if (modalAvatar) {
    modalAvatar.innerHTML = `<img src="${esc(avatarUrl)}" alt="" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none';">`;
  }

  // Update card avatar in search results
  const card = document.querySelector(`.channel-card[data-channel-id="${id}"]`);
  if (card) {
    const cardAvatar = card.querySelector('.channel-avatar');
    if (cardAvatar) {
      cardAvatar.innerHTML = `<img src="${esc(avatarUrl)}" alt="" loading="lazy" onerror="this.style.display='none';">`;
    }
  }
}

// Open Channel Modal
async function openChannelModal(id) {
  const channel = catalog.get(id) || savedChannels.find(c => c.id === id);
  if (!channel) return;

  currentChannelData = channel;
  currentPostsData = [];
  filterPostText = '';
  $('#modalSearchPosts').value = '';

  const initial = (channel.name || channel.cleanHandle || '?')[0].toUpperCase();
  const avatarHtml = channel.avatar 
    ? `<img src="${esc(channel.avatar)}" alt="${esc(channel.name)}" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none'; this.parentElement.innerText='${initial}';">` 
    : initial;

  $('#modalChannelHead').innerHTML = `
    <div class="modal-avatar" style="width:52px;height:52px;border-radius:14px;overflow:hidden;flex-shrink:0;">${avatarHtml}</div>
    <div style="min-width:0;">
      <div class="modal-title" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:340px;">${esc(channel.name)}</div>
      <div class="modal-handle">${esc(channel.handle)} ${channel.count != null ? '· ' + formatSubs(channel.count) + ' подписчиков' : ''}</div>
    </div>
  `;

  if (channel.description) {
    $('#modalChannelDesc').textContent = channel.description;
    $('#modalChannelDesc').style.display = 'block';
  } else {
    $('#modalChannelDesc').style.display = 'none';
  }

  $('#modalOpenTelegram').href = channel.url || `https://t.me/${channel.cleanHandle}`;
  $('#postsContainer').innerHTML = `
    <div class="empty-box" style="padding: 40px 0;">
      <div class="empty-icon">⏳</div>
      <div>Загружаем ленту сообщений канала...</div>
    </div>
  `;

  $('#channelModal').classList.add('open');

  try {
    const res = await fetch(`/api/posts?handle=${encodeURIComponent(channel.cleanHandle)}&all=1`);
    const data = await res.json();
    
    if (data.channel) {
      if (data.channel.avatar) {
        channel.avatar = data.channel.avatar;
        updateChannelAvatarInDom(channel.cleanHandle, data.channel.avatar);
      }
      if (data.channel.name && (!channel.name || channel.name === channel.cleanHandle)) {
        channel.name = data.channel.name;
        const titleEl = $('#modalChannelHead')?.querySelector('.modal-title');
        if (titleEl) titleEl.textContent = channel.name;
      }
    }

    if (data.posts && data.posts.length) {
      currentPostsData = data.posts;
      renderPosts();
      
      // Auto-scroll to the bottom in Telegram mode (newest messages at the bottom)
      setTimeout(() => {
        const container = $('#postsContainer');
        if (isAscendingOrder) {
          container.scrollTop = container.scrollHeight;
        } else {
          container.scrollTop = 0;
        }
      }, 100);

      notify(`Загружены все сообщения (${currentPostsData.length} постов)`);
    } else {
      $('#postsContainer').innerHTML = `
        <div class="empty-box" style="padding: 40px 0;">
          <div class="empty-icon">📭</div>
          <div>Лента сообщений канала пуста или является приватной.</div>
        </div>
      `;
    }
  } catch (err) {
    $('#postsContainer').innerHTML = `
      <div class="empty-box" style="padding: 40px 0;">
        <div class="empty-icon">⚠️</div>
        <div>Не удалось загрузить сообщения: ${esc(err.message)}</div>
      </div>
    `;
  }
}

// Refresh channel posts (fetching latest from Telegram)
let isRefreshing = false;
async function refreshChannelPosts() {
  if (!currentChannelData || isRefreshing) return;
  isRefreshing = true;
  const icon = $('#refreshIcon');
  if (icon) icon.classList.add('spinning');
  $('#refreshBtnText').textContent = 'Обновление...';

  try {
    const res = await fetch(`/api/posts?handle=${encodeURIComponent(currentChannelData.cleanHandle)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Ошибка обновления');

    if (data.channel && data.channel.avatar) {
      currentChannelData.avatar = data.channel.avatar;
      updateChannelAvatarInDom(currentChannelData.cleanHandle, data.channel.avatar);
    }

    if (data.posts && data.posts.length) {
      const existingIds = new Set(currentPostsData.map(p => String(p.id)));
      let added = 0;
      data.posts.forEach(np => {
        if (!existingIds.has(String(np.id))) {
          currentPostsData.push(np);
          added++;
        }
      });
      renderPosts();
      notify(added > 0 ? `Обновлено! Добавлено ${added} новых постов` : 'Лента проверена: вы видите самые свежие посты');
    } else {
      notify('Лента проверена: новых постов нет');
    }
  } catch (err) {
    notify('Ошибка обновления: ' + err.message);
  } finally {
    isRefreshing = false;
    if (icon) icon.classList.remove('spinning');
    $('#refreshBtnText').textContent = 'Обновить';
  }
}

// Load older posts (pagination)
let isLoadingOlder = false;
async function loadOlderPosts() {
  if (!currentChannelData || isLoadingOlder || !currentPostsData.length) return;
  isLoadingOlder = true;
  const btn = $('#btnLoadOlderPosts');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ Загрузка более ранних постов...';
  }

  const numericIds = currentPostsData
    .map(p => parseInt(p.id, 10))
    .filter(n => !isNaN(n) && n > 0);
  const minId = numericIds.length ? Math.min(...numericIds) : null;

  if (!minId || minId <= 1) {
    notify('Вы дошли до самого первого поста канала!');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '✅ Все посты канала загружены';
    }
    isLoadingOlder = false;
    return;
  }

  try {
    const res = await fetch(`/api/posts?handle=${encodeURIComponent(currentChannelData.cleanHandle)}&before=${minId}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Ошибка загрузки');

    const olderPosts = data.posts || [];
    const existingIds = new Set(currentPostsData.map(p => String(p.id)));
    const newItems = olderPosts.filter(p => !existingIds.has(String(p.id)));

    if (newItems.length) {
      currentPostsData.push(...newItems);
      renderPosts();
      notify(`Загружено ещё ${newItems.length} ранних постов (всего: ${currentPostsData.length})`);
    } else {
      notify('Более ранних постов не найдено');
      if (btn) {
        btn.disabled = true;
        btn.textContent = '✅ Все посты канала загружены';
      }
    }
  } catch (err) {
    notify('Не удалось загрузить старые посты: ' + err.message);
    if (btn) {
      btn.disabled = false;
      btn.textContent = '📥 Попробовать снова';
    }
  } finally {
    isLoadingOlder = false;
  }
}

// Render posts in chat view
function renderPosts() {
  const container = $('#postsContainer');
  let list = [...currentPostsData];

  // Filter text
  if (filterPostText) {
    const f = filterPostText.toLowerCase();
    list = list.filter(p => (p.text || '').toLowerCase().includes(f) || String(p.id).includes(f));
  }

  // Sort: isAscendingOrder (true = oldest first, false = newest first)
  list.sort((a, b) => {
    const numA = parseInt(a.id, 10) || 0;
    const numB = parseInt(b.id, 10) || 0;
    return isAscendingOrder ? (numA - numB) : (numB - numA);
  });

  if (!list.length) {
    container.innerHTML = `
      <div class="empty-box" style="padding: 40px 0;">
        <div class="empty-icon">🔍</div>
        <div>По запросу «${esc(filterPostText)}» в ленте ничего не найдено.</div>
      </div>
    `;
    return;
  }

  const paginationButtonHtml = `
    <div class="load-older-wrap" style="text-align: center; padding: 20px 0;">
      <button id="btnLoadOlderPosts" class="btn-pill primary" style="margin: 0 auto; padding: 11px 26px; font-weight: 700; cursor: pointer; box-shadow: 0 4px 16px rgba(47, 129, 247, 0.25);">
        📥 Загрузить более ранние сообщения
      </button>
    </div>
  `;

  let htmlOutput = isAscendingOrder ? paginationButtonHtml : '';
  let lastDatePill = '';

  const authorInitial = (currentChannelData?.name || currentChannelData?.cleanHandle || '?')[0].toUpperCase();
  const authorAvatarImg = currentChannelData?.avatar 
    ? `<img src="${esc(currentChannelData.avatar)}" alt="" loading="lazy" onerror="this.style.display='none'; this.parentElement.innerText='${authorInitial}';">`
    : authorInitial;

  list.forEach(p => {
    // Date divider pill when date changes
    const dateLabel = p.dateOnly || (p.date ? p.date.split(',')[0].trim() : '');
    if (dateLabel && dateLabel !== lastDatePill) {
      lastDatePill = dateLabel;
      htmlOutput += `<div class="chat-date-divider"><span>${esc(dateLabel)}</span></div>`;
    }

    const formattedBody = formatPostHtml(p.text, currentChannelData ? currentChannelData.cleanHandle : '');
    
    // Filter out reaction images and small emoji stickers
    const validImages = (p.images || []).filter(img => !/reaction|emoji|thumb_reaction/i.test(img));
    
    let mediaHtml = '';
    if (validImages.length) {
      mediaHtml = `
        <div class="post-media-grid">
          ${validImages.map(img => `<img src="${esc(img)}" alt="" loading="lazy" onclick="window.open('${esc(img)}', '_blank')">`).join('')}
        </div>
      `;
    }

    htmlOutput += `
      <div class="post-bubble" id="post-bubble-${esc(p.id)}">
        <div class="post-bubble-header">
          <div class="post-author-row">
            <div class="post-author-avatar">
              ${authorAvatarImg}
            </div>
            <span class="post-author-name">${esc(currentChannelData ? currentChannelData.name : 'Канал')}</span>
            <span class="post-id-badge">#${esc(p.id)}</span>
          </div>
          <div class="post-bubble-meta">
            <span class="post-date-tag">📅 ${esc(p.date || 'Недавно')}</span>
            ${p.views ? `<span>👁 ${esc(p.views)}</span>` : ''}
          </div>
        </div>

        ${mediaHtml}

        <div class="post-bubble-text">${formattedBody}</div>

        <div class="post-bubble-footer">
          <div class="post-bubble-footer-left">
            <a href="${esc(p.url || '#')}" target="_blank" rel="noopener" style="color: var(--tg-cyan); text-decoration: none; font-weight: 600;">
              В Telegram ↗
            </a>
          </div>
          <div>
            <button class="btn-post-copy" data-copy-post="${esc(p.text || '')}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              Копировать
            </button>
          </div>
        </div>
      </div>
    `;
  });

  if (!isAscendingOrder) {
    htmlOutput += paginationButtonHtml;
  }

  container.innerHTML = htmlOutput;

  // Bind pagination button
  const loadBtn = $('#btnLoadOlderPosts');
  if (loadBtn) {
    loadBtn.onclick = loadOlderPosts;
  }
}

// Export JSON
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
  a.download = `${currentChannelData.cleanHandle}_feed.json`;
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
  const text = currentPostsData.map(p => {
    return `[#${p.id} | ${p.date || ''} | ${p.views ? p.views + ' просм.' : ''}]\n${p.text || ''}\n`;
  }).join('\n----------------------------------------\n\n');

  copyToClipboard(text, `Все ${currentPostsData.length} постов скопированы!`);
}

// Jump to internal post inside chat
async function jumpToPost(postId) {
  let target = document.getElementById(`post-bubble-${postId}`);
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.remove('highlighted');
    void target.offsetWidth;
    target.classList.add('highlighted');
    notify(`Переход к сообщению #${postId}`);
    return;
  }

  // If not in current view, attempt to fetch range around that post ID
  if (currentChannelData) {
    notify(`Загружаем сообщение #${postId}...`);
    try {
      const res = await fetch(`/api/posts?handle=${encodeURIComponent(currentChannelData.cleanHandle)}&before=${parseInt(postId, 10) + 12}`);
      const data = await res.json();
      if (data.posts && data.posts.length) {
        const existingIds = new Set(currentPostsData.map(p => String(p.id)));
        data.posts.forEach(np => {
          if (!existingIds.has(String(np.id))) currentPostsData.push(np);
        });
        renderPosts();
        target = document.getElementById(`post-bubble-${postId}`);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          target.classList.add('highlighted');
          notify(`Переход к сообщению #${postId}`);
          return;
        }
      }
    } catch (e) {}
  }
  notify(`Сообщение #${postId} не найдено или удалено.`);
}

// Event Listeners Setup
function initEvents() {
  $('#searchBtn').onclick = () => performSearch();
  $('#searchInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') performSearch();
  });

  $('#typeSwitch').onclick = e => {
    const btn = e.target.closest('.type-btn');
    if (!btn) return;
    $$('#typeSwitch .type-btn').forEach(b => b.classList.toggle('active', b === btn));
    activeType = btn.dataset.type;
    performSearch();
  };

  $('#categoryTags').onclick = e => {
    const btn = e.target.closest('.tag-btn');
    if (!btn) return;
    $$('#categoryTags .tag-btn').forEach(b => b.classList.toggle('active', b === btn));
    activeCat = btn.dataset.cat;
    if (activeCat !== 'all') {
      $('#searchInput').value = btn.textContent.trim();
    }
    performSearch();
  };

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

  $('#savedList').onclick = e => {
    const item = e.target.closest('[data-channel-id]');
    if (item) {
      openChannelModal(item.dataset.channelId);
    }
  };

  $('#clearSavedBtn').onclick = () => {
    if (!savedChannels.length) return;
    savedChannels = [];
    localStorage.removeItem('tg_saved_channels');
    renderSaved();
    renderCards();
    notify('Подборка очищена');
  };

  // Close modal
  $('#closeChannelModal').onclick = () => $('#channelModal').classList.remove('open');
  $('#channelModal').onclick = e => {
    if (e.target === $('#channelModal')) $('#channelModal').classList.remove('open');
  };

  // Refresh posts button
  const refreshBtn = $('#modalRefreshPosts');
  if (refreshBtn) {
    refreshBtn.onclick = refreshChannelPosts;
  }

  // Order switch
  $('#modalOrderToggle').onclick = () => {
    isAscendingOrder = !isAscendingOrder;
    $('#orderToggleText').textContent = isAscendingOrder ? '⬆ Снизу новые (как в TG)' : '⬇ Сверху новые';
    renderPosts();
    setTimeout(() => {
      const c = $('#postsContainer');
      if (isAscendingOrder) {
        c.scrollTop = c.scrollHeight;
      } else {
        c.scrollTop = 0;
      }
    }, 50);
  };

  // Search within posts
  $('#modalSearchPosts').addEventListener('input', e => {
    filterPostText = e.target.value.trim();
    renderPosts();
  });

  // Action buttons
  $('#modalCopyAllPosts').onclick = copyAllPosts;
  $('#modalDownloadJson').onclick = exportChannelJson;

  // Jump to bottom button
  const postsBox = $('#postsContainer');
  postsBox.addEventListener('scroll', () => {
    const diff = postsBox.scrollHeight - postsBox.scrollTop - postsBox.clientHeight;
    $('#btnScrollBottom').classList.toggle('show', diff > 280);
  });

  $('#btnScrollBottom').onclick = () => {
    postsBox.scrollTo({ top: postsBox.scrollHeight, behavior: 'smooth' });
  };

  // Intercept clicks inside chat (jumping to post or opening another channel)
  postsBox.onclick = e => {
    // Copy post text
    const copyBtn = e.target.closest('[data-copy-post]');
    if (copyBtn) {
      e.preventDefault();
      copyToClipboard(copyBtn.dataset.copyPost, 'Текст сообщения скопирован!');
      copyBtn.classList.add('copied');
      setTimeout(() => copyBtn.classList.remove('copied'), 1500);
      return;
    }

    // In-app jump to another post in same channel
    const jumpBtn = e.target.closest('.tg-inapp-jump');
    if (jumpBtn) {
      e.preventDefault();
      const pid = jumpBtn.dataset.jumpPost;
      jumpToPost(pid);
      return;
    }

    // In-app open another channel
    const chBtn = e.target.closest('.tg-inapp-channel');
    if (chBtn) {
      e.preventDefault();
      const targetCh = chBtn.dataset.openChannel;
      if (targetCh) {
        fetchSingleChannel(targetCh);
      }
      return;
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

  $$('.copy-code-btn').forEach(btn => {
    btn.onclick = () => {
      const el = document.getElementById(btn.dataset.target);
      if (el) copyToClipboard(el.textContent, 'Код скопирован!');
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
  
  const initialTopic = INITIAL_PROMPTS[Math.floor(Math.random() * INITIAL_PROMPTS.length)];
  $('#searchInput').value = initialTopic;
  await performSearch(initialTopic);
}

document.addEventListener('DOMContentLoaded', init);
