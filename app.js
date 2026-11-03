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

// Folders State
let folders = JSON.parse(localStorage.getItem('tg_folders') || 'null');
if (!folders || !folders.length) {
  folders = [
    { id: 'all', name: 'Все каналы', icon: '📁', isDefault: true }
  ];
  localStorage.setItem('tg_folders', JSON.stringify(folders));
}
let activeFolderId = 'all';
let currentSectionTab = 'search'; // 'search' or 'folders'
let filterInFolderText = '';
let channelForFolderAssignment = null;

// Migrate saved channels to ensure folderIds exists
savedChannels = savedChannels.map(c => {
  if (!c.folderIds || !Array.isArray(c.folderIds) || !c.folderIds.length) {
    c.folderIds = ['all'];
  }
  return c;
});
localStorage.setItem('tg_saved_channels', JSON.stringify(savedChannels));

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
function formatPostHtml(rawText, currentHandle, isMediaNote = false) {
  if (!rawText) {
    if (isMediaNote) {
      return `
        <div class="media-note-banner">
          <span class="media-note-icon">📹</span>
          <div class="media-note-info">
            <strong>Видеосообщение (кружочек) / Голосовое</strong>
            <small>Telegram скрывает кружочки и голосовые заметки в веб-виджетах</small>
          </div>
        </div>
      `;
    }
    return '<span style="color: var(--text-dim); font-style: italic;">[Медиа / запись без текста]</span>';
  }
  
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

  // Strip trailing reaction lines (e.g. _**🔥**_ 36 _**👍**_ 27 or 🔥 36 👍 28)
  safe = safe.replace(/(?:\s*(?:_[*]{2}[^*]+[*]{2}_|[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}])\s*[\d.,KMB]*)+\s*$/gu, '');
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

// Saved channels & Folders persistence
function isSaved(id) {
  return savedChannels.some(c => c.id === id);
}

function saveFolders() {
  localStorage.setItem('tg_folders', JSON.stringify(folders));
  localStorage.setItem('tg_saved_channels', JSON.stringify(savedChannels));
  updateBadges();
}

function updateBadges() {
  const badge = $('#myChannelsBadge');
  if (badge) {
    badge.textContent = savedChannels.length;
  }
}

function switchSection(tabName) {
  currentSectionTab = tabName;
  $$('.section-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tabName));
  const sView = $('#viewSearch');
  const fView = $('#viewFolders');
  if (sView) sView.classList.toggle('active', tabName === 'search');
  if (fView) fView.classList.toggle('active', tabName === 'folders');

  if (tabName === 'folders') {
    renderFoldersView();
  }
}

function toggleSave(id) {
  const channel = catalog.get(id) || savedChannels.find(c => c.id === id);
  if (!channel) return;
  
  if (isSaved(id)) {
    savedChannels = savedChannels.filter(c => c.id !== id);
    notify(`Удалено из сохранённых: ${channel.handle}`);
  } else {
    if (!channel.folderIds || !channel.folderIds.length) {
      channel.folderIds = ['all'];
      if (activeFolderId && activeFolderId !== 'all') {
        channel.folderIds.push(activeFolderId);
      }
    }
    savedChannels.unshift(channel);
    notify(`Сохранено: ${channel.handle}`);
  }
  
  saveFolders();
  renderCards();
  if (currentSectionTab === 'folders') {
    renderFoldersView();
  }
}

// Single Channel Card Component (used in Search and Folders)
function renderSingleChannelCard(c, inFolderView = false) {
  const saved = isSaved(c.id);
  const initial = (c.name || c.cleanHandle || '?')[0].toUpperCase();
  const avatarHtml = c.avatar 
    ? `<img src="${esc(c.avatar)}" alt="${esc(c.name)}" loading="lazy" onerror="this.style.display='none'; this.parentElement.innerText='${initial}';">` 
    : initial;

  // Folder tags
  const chFolderIds = c.folderIds || ['all'];
  const folderTagsHtml = folders
    .filter(f => f.id !== 'all' && chFolderIds.includes(f.id))
    .map(f => `<span class="channel-cat-pill" style="color:var(--accent);border-color:rgba(56,139,253,0.3);background:rgba(56,139,253,0.08);">📁 ${esc(f.name)}</span>`)
    .join('');

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
          ${folderTagsHtml}
        </div>

        <div class="channel-desc">${esc(c.description)}</div>
      </div>

      <div class="channel-stats">
        <div class="channel-subs">${c.count != null ? esc(formatSubs(c.count)) : '—'}</div>
        <div class="channel-subs-label">подписчиков</div>
      </div>

      <div class="channel-actions">
        <button class="btn-card-action" data-action="folder" data-id="${esc(c.id)}" title="Управление папками">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
        </button>
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
        ${inFolderView && activeFolderId !== 'all' ? `
          <button class="btn-card-action" data-action="remove-from-folder" data-id="${esc(c.id)}" title="Убрать из этой папки" style="color:#ff5252;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        ` : ''}
      </div>
    </article>
  `;
}

// Render cards list in Search tab
function renderCards() {
  const list = currentResults;
  const cardsList = $('#cardsList');
  const resultsCount = $('#resultsCount');
  if (!cardsList) return;
  
  if (isSearching) {
    if (resultsCount) resultsCount.textContent = 'поиск...';
    cardsList.innerHTML = `
      <div class="empty-box" style="grid-column: 1 / -1;">
        <div class="empty-icon">🔍</div>
        <div>Ищем в каталоге и проверяем точные имена каналов...</div>
      </div>
    `;
    return;
  }

  if (resultsCount) resultsCount.textContent = `${list.length} найдено`;

  if (!list.length) {
    cardsList.innerHTML = `
      <div class="empty-box" style="grid-column: 1 / -1;">
        <div class="empty-icon">🔍</div>
        <div>Ничего не найдено.<br>Попробуй по-другому: <b>«новости»</b>, <b>«@ник»</b>, <b>«t.me/username»</b> или ссылку на папку <b>«t.me/addlist/...»</b>.</div>
      </div>
    `;
    return;
  }

  cardsList.innerHTML = list.map(c => renderSingleChannelCard(c, false)).join('');
}

// Render folder tabs & folder view
function renderFolderTabs() {
  const container = $('#folderTabsList');
  if (!container) return;

  container.innerHTML = folders.map(f => {
    let count = 0;
    if (f.id === 'all') {
      count = savedChannels.length;
    } else {
      count = savedChannels.filter(c => (c.folderIds || []).includes(f.id)).length;
    }
    const countDisplay = (f.source === 'addlist' && count === 0 && f.chatCount) 
      ? `TG: ${f.chatCount}` 
      : count;

    return `
      <div class="folder-pill ${f.id === activeFolderId ? 'active' : ''}" data-folder-id="${esc(f.id)}">
        <span>${esc(f.icon || '📁')}</span>
        <span>${esc(f.name)}</span>
        <span class="folder-pill-count">${esc(countDisplay)}</span>
      </div>
    `;
  }).join('');
}

function renderFoldersView() {
  renderFolderTabs();
  updateBadges();

  const folder = folders.find(f => f.id === activeFolderId) || folders[0];
  const banner = $('#folderActiveBanner');
  const cardsList = $('#folderCardsList');
  if (!banner || !cardsList) return;

  // Channels in current folder
  let list = activeFolderId === 'all' 
    ? [...savedChannels] 
    : savedChannels.filter(c => (c.folderIds || []).includes(activeFolderId));

  if (filterInFolderText) {
    const f = filterInFolderText.toLowerCase();
    list = list.filter(c => (c.name || '').toLowerCase().includes(f) || (c.handle || '').toLowerCase().includes(f) || (c.description || '').toLowerCase().includes(f));
  }

  let tgLinkBtn = '';
  if (folder.url || folder.slug) {
    const tgUrl = folder.url || `https://t.me/addlist/${folder.slug}`;
    tgLinkBtn = `
      <a href="${esc(tgUrl)}" target="_blank" rel="noopener" class="btn-pill" style="color: var(--tg-cyan); border-color: rgba(41, 182, 246, 0.4); background: rgba(41, 182, 246, 0.1);">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        Открыть папку в TG ↗
      </a>
    `;
  }

  let actionsHtml = `
    <div class="modal-search-box">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      <input type="text" id="folderChannelSearchInput" placeholder="Поиск в этой папке..." value="${esc(filterInFolderText)}">
    </div>
    ${(folder.source === 'addlist' || folder.slug) ? `
      <button class="btn-pill" id="btnSyncFolderAddlist" title="Загрузить или обновить каналы из этой Telegram папки">
        ⚡ Загрузить из TG
      </button>
    ` : ''}
    ${tgLinkBtn}
  `;

  if (!folder.isDefault) {
    actionsHtml += `
      <button class="btn-icon" id="btnRenameFolder" title="Переименовать папку" data-id="${esc(folder.id)}">✏️</button>
      <button class="btn-icon" id="btnDeleteFolder" title="Удалить папку" data-id="${esc(folder.id)}" style="color: #ff5252;">🗑️</button>
    `;
  }

  banner.innerHTML = `
    <div class="folder-banner-top">
      <div class="folder-banner-left">
        <div class="folder-banner-title-row">
          <span style="font-size: 24px;">${esc(folder.icon || '📁')}</span>
          <span class="folder-banner-title">${esc(folder.name)}</span>
          ${folder.source === 'addlist' ? '<span class="channel-cat-pill" style="color:var(--tg-cyan);border-color:rgba(41,182,246,0.3);background:rgba(41,182,246,0.08);">🔗 Telegram Addlist</span>' : ''}
        </div>
        <div class="folder-banner-meta">
          <span>Каналов сохранено: <b>${list.length}</b></span>
          ${folder.chatCount ? `<span>В Telegram списке: <b>${folder.chatCount} чатов</b></span>` : ''}
        </div>
      </div>
      <div class="folder-banner-actions">
        ${actionsHtml}
      </div>
    </div>
    <div class="folder-quick-add-bar">
      <div class="folder-quick-add-input-wrap">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        <input type="text" id="folderQuickAddInput" placeholder="Вставьте @ники каналов через пробел (@YT_cartell @danyavoron_yt)...">
      </div>
      <button class="btn-pill primary" id="btnFolderQuickAdd">+ Добавить в папку</button>
    </div>
  `;

  const syncBtn = $('#btnSyncFolderAddlist');
  if (syncBtn) {
    syncBtn.onclick = () => syncAddlistFolder(folder.id);
  }

  const quickAddBtn = $('#btnFolderQuickAdd');
  const quickAddInp = $('#folderQuickAddInput');
  const handleQuickAdd = () => {
    if (!quickAddInp) return;
    const text = quickAddInp.value.trim();
    if (!text) {
      notify('Вставьте @ники или ссылки на каналы');
      return;
    }
    const matches = text.match(/(?:https?:\/\/)?(?:www\.)?(?:t\.me\/|@)?([A-Za-z0-9_]{3,32})/gi) || [];
    const handles = [...new Set(matches.map(m => m.replace(/^(?:https?:\/\/)?(?:www\.)?t\.me\//i, '').replace(/^@/, '').trim()).filter(h => h && !['addlist', 'joinchat', 'c', 's'].includes(h.toLowerCase())))];

    if (!handles.length) {
      notify('Не найдены корректные имена каналов');
      return;
    }

    notify(`Добавляем ${handles.length} каналов...`);
    handles.forEach(h => {
      const norm = normalizeChannel({ handle: h, name: h });
      if (!norm.folderIds) norm.folderIds = ['all'];
      if (!norm.folderIds.includes(folder.id)) norm.folderIds.push(folder.id);

      catalog.set(norm.id, norm);
      const existing = savedChannels.find(c => c.id === norm.id);
      if (existing) {
        if (!existing.folderIds) existing.folderIds = ['all'];
        if (!existing.folderIds.includes(folder.id)) existing.folderIds.push(folder.id);
      } else {
        savedChannels.unshift(norm);
      }
    });

    quickAddInp.value = '';
    saveFolders();
    renderFoldersView();
    notify(`✅ Добавлено ${handles.length} каналов в папку «${folder.name}»!`);

    // Fetch details & avatars in background
    handles.forEach(async (h) => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(h)}`);
        const d = await res.json();
        if (d.results && d.results.length) {
          const match = d.results.find(r => (r.handle || '').toLowerCase() === h.toLowerCase()) || d.results[0];
          if (match) {
            const ch = savedChannels.find(c => c.id === h.toLowerCase());
            if (ch) {
              if (match.name) ch.name = match.name;
              if (match.avatar) ch.avatar = match.avatar;
              if (match.memberCount) ch.memberCount = match.memberCount;
              saveFolders();
              renderFoldersView();
            }
          }
        }
      } catch (e) {}
    });
  };

  if (quickAddBtn) quickAddBtn.onclick = handleQuickAdd;
  if (quickAddInp) {
    quickAddInp.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleQuickAdd();
      }
    };
  }

  const searchInput = $('#folderChannelSearchInput');
  if (searchInput) {
    searchInput.oninput = (e) => {
      filterInFolderText = e.target.value.trim();
      renderFoldersView();
      const inp = $('#folderChannelSearchInput');
      if (inp) {
        inp.focus();
        inp.selectionStart = inp.selectionEnd = inp.value.length;
      }
    };
  }

  const renameBtn = $('#btnRenameFolder');
  if (renameBtn) {
    renameBtn.onclick = () => {
      const newName = prompt('Новое название папки:', folder.name);
      if (newName && newName.trim() && newName.trim() !== folder.name) {
        folder.name = newName.trim();
        saveFolders();
        renderFoldersView();
        notify(`Папка переименована в «${folder.name}»`);
      }
    };
  }

  const deleteBtn = $('#btnDeleteFolder');
  if (deleteBtn) {
    deleteBtn.onclick = () => {
      if (confirm(`Удалить папку «${folder.name}»? (Каналы останутся в общем списке)`)) {
        folders = folders.filter(f => f.id !== folder.id);
        savedChannels.forEach(c => {
          c.folderIds = (c.folderIds || []).filter(fid => fid !== folder.id);
          if (!c.folderIds.length) c.folderIds = ['all'];
        });
        activeFolderId = 'all';
        saveFolders();
        renderFoldersView();
        notify('Папка удалена');
      }
    };
  }

  // Auto-clean and auto-sync if addlist folder has stale/random channels or hasn't synced
  if (folder.source === 'addlist' && (list.some(c => c.id === 'yutub' || c.id === 'grishayoutube') || (!folder._autoSynced && list.length < 5))) {
    folder._autoSynced = true;
    setTimeout(() => syncAddlistFolder(folder.id), 100);
  }

  if (!list.length) {
    if (folder.source === 'addlist' && !folder._autoSynced) {
      folder._autoSynced = true;
      setTimeout(() => syncAddlistFolder(folder.id), 200);
    }

    cardsList.innerHTML = `
      <div class="empty-box" style="padding: 40px 0; grid-column: 1 / -1;">
        <div class="empty-icon">${esc(folder.icon || '📁')}</div>
        <div style="font-size: 17px; font-weight: 700; color: #fff; margin-bottom: 6px;">В папке «${esc(folder.name)}» пока нет сохранённых каналов</div>
        <div style="color: var(--text-dim); max-width: 480px; margin: 0 auto 16px;">
          ${(folder.source === 'addlist' || folder.slug) 
            ? `Эта папка импортирована по ссылке Telegram (${folder.chatCount ? folder.chatCount + ' чатов' : 'addlist'}). Нажмите кнопку ниже, чтобы автоматически загрузить каналы:` 
            : 'Вставьте @ники каналов в строку добавления выше или найдите их в каталоге.'}
        </div>
        <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
          ${(folder.source === 'addlist' || folder.slug) ? `<button class="btn-pill primary" id="btnSyncEmptyFolder">⚡ Загрузить каналы из Telegram папки</button>` : ''}
          <button class="btn-pill" id="btnGoSearchFromFolder">🔍 Найти каналы в каталоге</button>
          ${folder.url ? `<a href="${esc(folder.url)}" target="_blank" rel="noopener" class="btn-pill">Открыть в Telegram ↗</a>` : ''}
        </div>
      </div>
    `;

    const emptySyncBtn = $('#btnSyncEmptyFolder');
    if (emptySyncBtn) {
      emptySyncBtn.onclick = () => syncAddlistFolder(folder.id);
    }
    const goBtn = $('#btnGoSearchFromFolder');
    if (goBtn) {
      goBtn.onclick = () => switchSection('search');
    }
    return;
  }

  cardsList.innerHTML = list.map(c => renderSingleChannelCard(c, true)).join('');
}

// Assign Channel to Folders Modal
function openAssignFolderModal(channelId) {
  const channel = catalog.get(channelId) || savedChannels.find(c => c.id === channelId);
  if (!channel) return;
  channelForFolderAssignment = channel;

  const currentFolderIds = new Set(channel.folderIds || ['all']);
  const titleEl = $('#assignModalTitle');
  if (titleEl) {
    titleEl.textContent = `Папки для ${channel.name || channel.handle}`;
  }

  const listEl = $('#assignFolderCheckboxes');
  if (listEl) {
    listEl.innerHTML = folders.map(f => {
      const isChecked = currentFolderIds.has(f.id);
      return `
        <label class="assign-folder-item">
          <input type="checkbox" value="${esc(f.id)}" ${isChecked ? 'checked' : ''} ${f.id === 'all' ? 'disabled checked' : ''}>
          <span>${esc(f.icon || '📁')}</span>
          <span style="font-weight: 600; flex: 1;">${esc(f.name)}</span>
          ${f.source === 'addlist' ? '<span class="channel-cat-pill" style="font-size:10.5px;">t.me</span>' : ''}
        </label>
      `;
    }).join('');
  }

  $('#assignFolderModal').classList.add('open');
  document.body.classList.add('modal-open');
}

function saveChannelFolderAssignments() {
  if (!channelForFolderAssignment) return;
  const checkboxes = $$('#assignFolderCheckboxes input[type="checkbox"]');
  const selected = ['all'];
  checkboxes.forEach(cb => {
    if (cb.checked && cb.value !== 'all') {
      selected.push(cb.value);
    }
  });

  channelForFolderAssignment.folderIds = selected;
  if (!isSaved(channelForFolderAssignment.id)) {
    savedChannels.unshift(channelForFolderAssignment);
  } else {
    const existing = savedChannels.find(c => c.id === channelForFolderAssignment.id);
    if (existing) existing.folderIds = selected;
  }

  saveFolders();
  $('#assignFolderModal').classList.remove('open');
  document.body.classList.remove('modal-open');
  notify(`Папки канала обновлены!`);
  renderCards();
  if (currentSectionTab === 'folders') {
    renderFoldersView();
  }
}

// Create custom folder
function createCustomFolder(name, icon = '📁') {
  const cleanName = (name || '').trim();
  if (!cleanName) {
    notify('Введи название папки');
    return;
  }
  const newFolder = {
    id: 'folder_' + Date.now(),
    name: cleanName,
    icon: icon,
    isDefault: false
  };
  folders.push(newFolder);
  activeFolderId = newFolder.id;
  saveFolders();
  renderFoldersView();
  switchSection('folders');
  notify(`Создана папка «${cleanName}»`);
}

// Import Telegram Folder Addlist
async function importTelegramAddlist(urlOrSlug, extraHandlesText = '') {
  if (!urlOrSlug) {
    notify('Укажите ссылку на папку Telegram (t.me/addlist/...)');
    return;
  }

  notify('Загружаем данные папки Telegram...');
  try {
    const res = await fetch(`/api/addlist?url=${encodeURIComponent(urlOrSlug.trim())}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Не удалось импортировать папку');

    const folderId = 'addlist_' + data.slug;
    let existing = folders.find(f => f.id === folderId || f.slug === data.slug);
    if (!existing) {
      existing = {
        id: folderId,
        name: data.title || 'Папка Telegram',
        icon: '⭐️',
        source: 'addlist',
        url: data.url,
        slug: data.slug,
        chatCount: data.chatCount || 0,
        isDefault: false
      };
      folders.push(existing);
    } else {
      existing.name = data.title || existing.name;
      existing.chatCount = data.chatCount || existing.chatCount;
      existing.url = data.url;
    }

    // Auto-save discovered channels into savedChannels and assign to this folder
    if (data.channels && Array.isArray(data.channels) && data.channels.length > 0) {
      data.channels.forEach(ch => {
        const norm = normalizeChannel(ch);
        if (!norm.folderIds) norm.folderIds = ['all'];
        if (!norm.folderIds.includes(existing.id)) norm.folderIds.push(existing.id);

        catalog.set(norm.id, norm);

        const existingSaved = savedChannels.find(c => c.id === norm.id);
        if (existingSaved) {
          if (!existingSaved.folderIds) existingSaved.folderIds = ['all'];
          if (!existingSaved.folderIds.includes(existing.id)) {
            existingSaved.folderIds.push(existing.id);
          }
          if (!existingSaved.avatar && norm.avatar) existingSaved.avatar = norm.avatar;
          if ((!existingSaved.name || existingSaved.name === existingSaved.cleanHandle) && norm.name) {
            existingSaved.name = norm.name;
          }
        } else {
          savedChannels.unshift(norm);
        }
      });
    }

    // Parse any extra handles provided by user
    if (extraHandlesText) {
      const handles = extraHandlesText.match(/@?[A-Za-z0-9_]{3,32}/g) || [];
      handles.forEach(h => {
        const clean = h.replace(/^@/, '').trim();
        if (clean && clean.toLowerCase() !== 'addlist' && clean.toLowerCase() !== 's') {
          const chObj = normalizeChannel({ handle: clean, name: clean });
          if (!chObj.folderIds) chObj.folderIds = ['all'];
          if (!chObj.folderIds.includes(existing.id)) chObj.folderIds.push(existing.id);
          if (!isSaved(chObj.id)) savedChannels.unshift(chObj);
        }
      });
    }

    activeFolderId = existing.id;
    saveFolders();
    renderFoldersView();
    switchSection('folders');
    notify(`✅ Папка «${existing.name}» (${existing.chatCount} чатов) добавлена!`, 4000);
    return existing;
  } catch (err) {
    notify('Ошибка импорта: ' + err.message, 4000);
  }
}

// Sync channels for a Telegram addlist folder
async function syncAddlistFolder(folderId) {
  const folder = folders.find(f => f.id === folderId);
  if (!folder) return;
  const target = folder.url || folder.slug || (folder.id.startsWith('addlist_') ? folder.id.replace('addlist_', '') : '');
  if (!target) return;

  const syncBtn = $('#btnSyncFolderAddlist');
  const emptySyncBtn = $('#btnSyncEmptyFolder');
  if (syncBtn) { syncBtn.disabled = true; syncBtn.textContent = '⏳ Синхронизация...'; }
  if (emptySyncBtn) { emptySyncBtn.disabled = true; emptySyncBtn.textContent = '⏳ Загрузка...'; }

  notify(`Загружаем каналы для папки «${folder.name}»...`);
  try {
    const res = await fetch(`/api/addlist?url=${encodeURIComponent(target)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Не удалось синхронизировать папку');

    folder.name = data.title || folder.name;
    folder.chatCount = data.chatCount || folder.chatCount;
    folder.url = data.url || folder.url;
    folder.slug = data.slug || folder.slug;

    const validServerIds = new Set(
      (data.channels || []).map(ch => (ch.handle || ch.slug || ch.id || '').toLowerCase().replace(/^@/, ''))
    );

    // Remove any stale/random channels from this folder that are not in the real folder list
    if (validServerIds.size > 0) {
      savedChannels.forEach(c => {
        if ((c.folderIds || []).includes(folder.id) && !validServerIds.has(c.id)) {
          c.folderIds = c.folderIds.filter(id => id !== folder.id);
          if (!c.folderIds.length) c.folderIds = ['all'];
        }
      });
    }

    let addedCount = 0;
    if (data.channels && Array.isArray(data.channels) && data.channels.length > 0) {
      data.channels.forEach(ch => {
        const norm = normalizeChannel(ch);
        if (!norm.folderIds) norm.folderIds = ['all'];
        if (!norm.folderIds.includes(folder.id)) norm.folderIds.push(folder.id);

        catalog.set(norm.id, norm);

        const existingSaved = savedChannels.find(c => c.id === norm.id);
        if (existingSaved) {
          if (!existingSaved.folderIds) existingSaved.folderIds = ['all'];
          if (!existingSaved.folderIds.includes(folder.id)) {
            existingSaved.folderIds.push(folder.id);
            addedCount++;
          }
          if (norm.avatar) existingSaved.avatar = norm.avatar;
          if (norm.name) existingSaved.name = norm.name;
          if (norm.count != null) existingSaved.count = norm.count;
          if (norm.memberCount != null) existingSaved.count = norm.memberCount;
          if (norm.description) existingSaved.description = norm.description;
        } else {
          savedChannels.unshift(norm);
          addedCount++;
        }
      });
    }

    folder._autoSynced = true;
    saveFolders();
    renderFoldersView();
    notify(`✅ Загружено ${data.channels ? data.channels.length : 0} каналов в папку «${folder.name}»!`, 4000);
  } catch (err) {
    folder._autoSynced = true;
    notify(`Ошибка синхронизации: ${err.message}`, 4000);
    renderFoldersView();
  }
}

// Search API
async function performSearch(queryText = '') {
  const input = queryText || $('#searchInput').value.trim();
  if (!input) {
    notify('Введи название, ключевое слово или ник канала');
    return;
  }

  // Detect Telegram Addlist link in search bar directly!
  if (/addlist\//i.test(input) || /t\.me\/addlist/i.test(input)) {
    await importTelegramAddlist(input);
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
  document.body.classList.add('modal-open');

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

    const formattedBody = formatPostHtml(p.text, currentChannelData ? currentChannelData.cleanHandle : '', p.isMediaNote);
    
    // Filter out reaction images and small emoji stickers (never show as big post photos)
    const validImages = (p.images || []).filter(img => {
      if (!img) return false;
      const lower = img.toLowerCase();
      return !lower.includes('reaction') && !lower.includes('emoji') && !lower.includes('thumb_reaction');
    });
    
    let mediaHtml = '';
    if (validImages.length) {
      mediaHtml = `
        <div class="post-media-grid">
          ${validImages.map(img => `<img src="${esc(img)}" alt="" loading="lazy" onclick="window.open('${esc(img)}', '_blank')">`).join('')}
        </div>
      `;
    }

    let noteBadge = '';
    if (p.isMediaNote && p.text) {
      noteBadge = `
        <div class="media-note-banner">
          <span class="media-note-icon">📹</span>
          <div class="media-note-info">
            <strong>Видеосообщение (кружочек) / Заметка</strong>
            <small>Смотрите полную видеозапись в Telegram ↗</small>
          </div>
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
        ${noteBadge}

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

// Close modal helper (locks/unlocks body scroll)
function closeModal() {
  $('#channelModal').classList.remove('open');
  document.body.classList.remove('modal-open');
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

  // Section tabs switcher
  const navTabs = $('#mainSectionNav');
  if (navTabs) {
    navTabs.onclick = e => {
      const btn = e.target.closest('.section-tab');
      if (btn && btn.dataset.tab) {
        switchSection(btn.dataset.tab);
      }
    };
  }

  // Unified card list click handler (supports Search results & Folder results)
  const handleCardListClick = e => {
    const actionBtn = e.target.closest('[data-action]');
    if (actionBtn) {
      e.stopPropagation();
      const action = actionBtn.dataset.action;
      const chId = actionBtn.dataset.id;
      if (action === 'save') {
        toggleSave(chId);
      } else if (action === 'copy') {
        copyToClipboard(actionBtn.dataset.text, 'Ник канала скопирован!');
      } else if (action === 'folder') {
        openAssignFolderModal(chId);
      } else if (action === 'remove-from-folder') {
        const channel = savedChannels.find(c => c.id === chId);
        if (channel && activeFolderId !== 'all') {
          channel.folderIds = (channel.folderIds || []).filter(id => id !== activeFolderId);
          if (!channel.folderIds.length) channel.folderIds = ['all'];
          saveFolders();
          renderFoldersView();
          notify(`Канал удалён из этой папки`);
        }
      }
      return;
    }

    const card = e.target.closest('[data-channel-id]');
    if (card) {
      openChannelModal(card.dataset.channelId);
    }
  };

  const cardsList = $('#cardsList');
  if (cardsList) cardsList.onclick = handleCardListClick;

  const folderCardsList = $('#folderCardsList');
  if (folderCardsList) folderCardsList.onclick = handleCardListClick;

  // Folder tabs click
  const folderTabs = $('#folderTabsList');
  if (folderTabs) {
    folderTabs.onclick = e => {
      const pill = e.target.closest('.folder-pill');
      if (pill && pill.dataset.folderId) {
        activeFolderId = pill.dataset.folderId;
        renderFoldersView();
      }
    };
  }

  // Addlist modal
  const addlistModal = $('#addlistModal');
  const openAddlist = () => {
    $('#addlistLinkInput').value = '';
    $('#addlistExtraHandles').value = '';
    addlistModal.classList.add('open');
    document.body.classList.add('modal-open');
    setTimeout(() => $('#addlistLinkInput').focus(), 50);
  };
  const closeAddlist = () => {
    addlistModal.classList.remove('open');
    document.body.classList.remove('modal-open');
  };
  if ($('#btnOpenAddlistModal')) $('#btnOpenAddlistModal').onclick = openAddlist;
  if ($('#closeAddlistModal')) $('#closeAddlistModal').onclick = closeAddlist;
  if ($('#cancelAddlistBtn')) $('#cancelAddlistBtn').onclick = closeAddlist;
  if ($('#submitAddlistBtn')) {
    $('#submitAddlistBtn').onclick = async () => {
      const url = $('#addlistLinkInput').value.trim();
      const extra = $('#addlistExtraHandles').value.trim();
      if (!url) {
        notify('Вставьте ссылку на папку Telegram (t.me/addlist/...)');
        return;
      }
      closeAddlist();
      await importTelegramAddlist(url, extra);
    };
  }

  // New folder modal
  const newFolderModal = $('#newFolderModal');
  const openNewFolder = () => {
    $('#newFolderNameInput').value = '';
    newFolderModal.classList.add('open');
    document.body.classList.add('modal-open');
    setTimeout(() => $('#newFolderNameInput').focus(), 50);
  };
  const closeNewFolder = () => {
    newFolderModal.classList.remove('open');
    document.body.classList.remove('modal-open');
  };
  if ($('#btnOpenNewFolderModal')) $('#btnOpenNewFolderModal').onclick = openNewFolder;
  if ($('#closeNewFolderModal')) $('#closeNewFolderModal').onclick = closeNewFolder;
  if ($('#cancelNewFolderBtn')) $('#cancelNewFolderBtn').onclick = closeNewFolder;
  if ($('#submitNewFolderBtn')) {
    $('#submitNewFolderBtn').onclick = () => {
      const name = $('#newFolderNameInput').value.trim();
      if (!name) {
        notify('Введите название папки');
        return;
      }
      closeNewFolder();
      createCustomFolder(name);
    };
  }

  // Assign folder modal
  const assignModal = $('#assignFolderModal');
  const closeAssignModal = () => {
    assignModal.classList.remove('open');
    document.body.classList.remove('modal-open');
  };
  if ($('#closeAssignFolderModal')) $('#closeAssignFolderModal').onclick = closeAssignModal;
  if ($('#saveAssignFoldersBtn')) $('#saveAssignFoldersBtn').onclick = saveChannelFolderAssignments;
  if ($('#assignModalCreateFolderBtn')) {
    $('#assignModalCreateFolderBtn').onclick = () => {
      const name = prompt('Название новой папки:');
      if (name && name.trim()) {
        const nf = { id: 'folder_' + Date.now(), name: name.trim(), icon: '📁', isDefault: false };
        folders.push(nf);
        saveFolders();
        openAssignFolderModal(channelForFolderAssignment.id);
        notify(`Папка «${nf.name}» создана!`);
      }
    };
  }

  // Close modal
  $('#closeChannelModal').onclick = closeModal;
  $('#channelModal').onclick = e => {
    if (e.target === $('#channelModal')) closeModal();
  };
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if ($('#channelModal').classList.contains('open')) closeModal();
      if ($('#addlistModal').classList.contains('open')) closeAddlist();
      if ($('#newFolderModal').classList.contains('open')) closeNewFolder();
      if ($('#assignFolderModal').classList.contains('open')) closeAssignModal();
    }
  });

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
  if ($('#promoApiBtn')) $('#promoApiBtn').onclick = openApi;
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
  updateBadges();
  renderFolderTabs();
  
  const initialTopic = INITIAL_PROMPTS[Math.floor(Math.random() * INITIAL_PROMPTS.length)];
  $('#searchInput').value = initialTopic;
  await performSearch(initialTopic);
}

document.addEventListener('DOMContentLoaded', init);
