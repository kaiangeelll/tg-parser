// TG Search & Parser App
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

// Helper for safe JSON localStorage reading
function safeGetJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw || raw === 'undefined' || raw === 'null') return fallback;
    const parsed = JSON.parse(raw);
    return (parsed !== null && parsed !== undefined) ? parsed : fallback;
  } catch (e) {
    return fallback;
  }
}

// State
let catalog = new Map();
let currentResults = [];

// Default 14 channels (exact channels from user folder t.me/addlist/UQM6EOgiI7JhM2Ni)
const DEFAULT_PRESET_CHANNELS = [
  {
    id: 'z0domonety',
    cleanHandle: 'z0domonety',
    handle: '@z0domonety',
    name: 'З Нуля До Монеты',
    count: 28400,
    description: 'Авторский блог про YouTube, монетизацию и создание контента.',
    folderIds: ['all', 'favorites', 'addlist_UQM6EOgiI7JhM2Ni']
  },
  {
    id: 'yt_cartell',
    cleanHandle: 'YT_cartell',
    handle: '@YT_cartell',
    name: 'YT Cartel | Лонг • AI • Автоматизація',
    count: 1540,
    description: 'Вчимо тому, за що інші беруть з вас гроші. YouTube • AI • Автоматизація',
    folderIds: ['all', 'addlist_UQM6EOgiI7JhM2Ni']
  },
  {
    id: 'grisha_youtuber_2003',
    cleanHandle: 'Grisha_Youtuber_2003',
    handle: '@Grisha_Youtuber_2003',
    name: 'Гриша Ютубер',
    count: 4700,
    description: 'Подключить монетизацию: вопросы по Ютубу и софту.',
    folderIds: ['all', 'addlist_UQM6EOgiI7JhM2Ni']
  },
  {
    id: 'danyavoron_yt',
    cleanHandle: 'danyavoron_yt',
    handle: '@danyavoron_yt',
    name: 'Даня Ворон | Ютуб по-дорослому',
    count: 3200,
    description: 'Публичный Telegram-канал. Все про YouTube по-взрослому.',
    folderIds: ['all', 'addlist_UQM6EOgiI7JhM2Ni']
  },
  {
    id: 'salfetkatop',
    cleanHandle: 'salfetkatop',
    handle: '@salfetkatop',
    name: 'Салфетка',
    count: 5100,
    description: 'YouTube кейси, лайфхаки та фішки монетизації.',
    folderIds: ['all', 'addlist_UQM6EOgiI7JhM2Ni']
  },
  {
    id: 'salfekta',
    cleanHandle: 'salfekta',
    handle: '@salfekta',
    name: 'salfekta',
    count: 2100,
    description: 'Публичный Telegram-канал — нажми чтобы открыть ленту.',
    folderIds: ['all', 'addlist_UQM6EOgiI7JhM2Ni']
  },
  {
    id: 'diamondehead',
    cleanHandle: 'diamondehead',
    handle: '@diamondehead',
    name: 'Лисий з YouTube',
    count: 14800,
    description: 'YouTube фишки, алгоритмы, удержание и заработок.',
    folderIds: ['all', 'addlist_UQM6EOgiI7JhM2Ni']
  },
  {
    id: 'monkeyclubmoney',
    cleanHandle: 'monkeyclubmoney',
    handle: '@monkeyclubmoney',
    name: 'MONKEY CLUB - ЗАРАБОТОК НА ЮТУБЕ И ТЕЛЕГРАМ',
    count: 8900,
    description: 'Отчеты, фишки, заработок и создание контента.',
    folderIds: ['all', 'addlist_UQM6EOgiI7JhM2Ni']
  },
  {
    id: 'youtubelogovo',
    cleanHandle: 'youtubelogovo',
    handle: '@youtubelogovo',
    name: 'Youtube Логово',
    count: 12300,
    description: 'Мультиязык, шансы, ошибки и практика YouTube.',
    folderIds: ['all', 'addlist_UQM6EOgiI7JhM2Ni']
  },
  {
    id: 'synergy_digital_group',
    cleanHandle: 'Synergy_Digital_Group',
    handle: '@Synergy_Digital_Group',
    name: 'Synergy Digital Group',
    count: 6500,
    description: 'Digital & YouTube медиа.',
    folderIds: ['all', 'addlist_UQM6EOgiI7JhM2Ni']
  },
  {
    id: 'theyoutubemoves',
    cleanHandle: 'theyoutubemoves',
    handle: '@theyoutubemoves',
    name: 'ютуберские движения',
    count: 4100,
    description: 'Тренды YouTube и трафик.',
    folderIds: ['all', 'addlist_UQM6EOgiI7JhM2Ni']
  },
  {
    id: 'fr1gech',
    cleanHandle: 'fr1gech',
    handle: '@fr1gech',
    name: 'FR1GE про YouTube🇺🇸',
    count: 8400,
    description: 'Публичный Telegram-канал про американский YouTube.',
    folderIds: ['all', 'addlist_UQM6EOgiI7JhM2Ni']
  },
  {
    id: 'yutub',
    cleanHandle: 'yutub',
    handle: '@yutub',
    name: 'Спорт Радар',
    count: 232000,
    description: 'Главные новости футбола. Результаты матчей, трансферы, аналитика.',
    folderIds: ['all', 'addlist_UQM6EOgiI7JhM2Ni']
  },
  {
    id: 'grishayoutube',
    cleanHandle: 'grishayoutube',
    handle: '@grishayoutube',
    name: 'GB',
    count: 1,
    description: 'Публичный Telegram-канал — нажми чтобы открыть ленту.',
    folderIds: ['all', 'addlist_UQM6EOgiI7JhM2Ni']
  }
];

let savedChannels = safeGetJson('tg_saved_channels', []);
if (!Array.isArray(savedChannels) || !savedChannels.length) {
  savedChannels = [...DEFAULT_PRESET_CHANNELS];
} else {
  // Ensure default channels are not missing
  DEFAULT_PRESET_CHANNELS.forEach(defCh => {
    const existing = savedChannels.find(c => c.id === defCh.id || (c.cleanHandle && c.cleanHandle.toLowerCase() === defCh.cleanHandle.toLowerCase()));
    if (!existing) {
      savedChannels.push(defCh);
    } else {
      if (!existing.folderIds) existing.folderIds = ['all'];
      if (!existing.folderIds.includes('addlist_UQM6EOgiI7JhM2Ni')) {
        existing.folderIds.push('addlist_UQM6EOgiI7JhM2Ni');
      }
    }
  });
}

// Migrate saved channels to ensure folderIds exists
savedChannels = savedChannels.map(c => {
  if (!c.folderIds || !Array.isArray(c.folderIds) || !c.folderIds.length) {
    c.folderIds = ['all'];
  }
  return c;
});

// Folders State
let folders = safeGetJson('tg_folders', null);
if (!Array.isArray(folders) || !folders.length) {
  folders = [
    { id: 'all', name: 'Все каналы', icon: '📁', isDefault: true },
    { id: 'favorites', name: 'Избранное', icon: '⭐️', isDefault: true },
    {
      id: 'addlist_UQM6EOgiI7JhM2Ni',
      name: 'Ютуб ⭐️⭐️',
      icon: '⭐️',
      isDefault: false,
      source: 'addlist',
      chatCount: 12,
      url: 'https://t.me/addlist/UQM6EOgiI7JhM2Ni'
    }
  ];
}

// Ensure favorites folder exists
if (!folders.some(f => f.id === 'favorites')) {
  folders.splice(1, 0, { id: 'favorites', name: 'Избранное', icon: '⭐️', isDefault: true });
}

// Ensure addlist_UQM6EOgiI7JhM2Ni folder exists
if (!folders.some(f => f.id === 'addlist_UQM6EOgiI7JhM2Ni')) {
  folders.push({
    id: 'addlist_UQM6EOgiI7JhM2Ni',
    name: 'Ютуб ⭐️⭐️',
    icon: '⭐️',
    isDefault: false,
    source: 'addlist',
    chatCount: 12,
    url: 'https://t.me/addlist/UQM6EOgiI7JhM2Ni'
  });
}

try {
  localStorage.setItem('tg_saved_channels', JSON.stringify(savedChannels));
  localStorage.setItem('tg_folders', JSON.stringify(folders));
} catch(e) {}

// Populate catalog Map
savedChannels.forEach(c => {
  if (c && c.id) catalog.set(c.id, c);
  if (c && c.cleanHandle) catalog.set(c.cleanHandle.toLowerCase(), c);
});

let activeType = 'channel';
let activeCat = 'all';
let currentQuery = '';
let isSearching = false;
let currentChannelData = null;
let currentPostsData = [];
let isAscendingOrder = true; // true = TG style (top: older, bottom: newer), false = newest first
let filterPostText = '';
let activeFolderId = 'all';
let currentSectionTab = 'folders';
let filterInFolderText = '';
let channelForFolderAssignment = null;
let savedFavoritePosts = safeGetJson('tg_favorite_posts', []);
const postsMemoryCache = new Map();
let activeWorkspaceChannelId = null;
let sidebarFilterText = '';

// Fast Local & Memory Cache for 0ms channel post loading
function getCachedPosts(handle) {
  if (!handle) return null;
  const h = handle.toLowerCase().replace(/^@/, '');
  if (postsMemoryCache.has(h)) {
    return postsMemoryCache.get(h);
  }
  try {
    const raw = localStorage.getItem('tg_posts_cache_' + h);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) {
        postsMemoryCache.set(h, parsed);
        return parsed;
      }
    }
  } catch(e) {}
  return null;
}

function saveCachedPosts(handle, posts) {
  if (!handle || !Array.isArray(posts)) return;
  const h = handle.toLowerCase().replace(/^@/, '');
  postsMemoryCache.set(h, posts);
  try {
    localStorage.setItem('tg_posts_cache_' + h, JSON.stringify(posts.slice(-80)));
  } catch(e) {}
}


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
  let text = String(rawText);

  // 1. Strip trailing reaction noise (e.g. _**🔥**_ 36 _**👍**_ 27)
  text = text.replace(/(?:\s*(?:_[*]{2}[^*]+[*]{2}_|[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}])\s*[\d.,KMB]*)+\s*$/gu, '');
  text = text.replace(/(?:\s*_[*]{2}[^*]+[*]{2}_\s*[\d.,KMB]*)+\s*$/gi, '');
  text = text.replace(/\n+\s*(?:_\*\*[^\n*]+\*\*_\s*|\d+[KMB]?\s*)+\s*$/gi, '');

  // 2. Pre-process code blocks (```code```)
  const codeBlocks = [];
  text = text.replace(/```([\s\S]*?)```/g, (match, code) => {
    const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`;
    codeBlocks.push(`<pre class="tg-pre-block"><code>${esc(code.trim())}</code></pre>`);
    return placeholder;
  });

  // 3. Pre-process inline code (`code`)
  const inlineCodes = [];
  text = text.replace(/`([^`\n]+)`/g, (match, code) => {
    const placeholder = `__INLINE_CODE_${inlineCodes.length}__`;
    inlineCodes.push(`<code class="tg-inline-code" onclick="copyToClipboard('${esc(code)}', 'Скопировано!')" title="Нажмите, чтобы скопировать">${esc(code)}</code>`);
    return placeholder;
  });

  // 4. Pre-process Markdown hyperlinks: [Anchor Text](URL)
  const links = [];
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|tg:\/\/[^\s)]+)\)/gi, (match, anchor, url) => {
    const placeholder = `__LINK_${links.length}__`;
    const cleanUrl = url.trim();
    const cleanAnchor = esc(anchor.trim());

    // In-app jump to post: https://t.me/channel/123
    const jumpMatch = cleanUrl.match(/^https?:\/\/t\.me\/([A-Za-z0-9_]+)\/(\d+)$/i);
    if (jumpMatch) {
      const ch = jumpMatch[1];
      const pid = jumpMatch[2];
      if (ch.toLowerCase() === curH) {
        links.push(`<a href="#post-bubble-${pid}" class="tg-inapp-jump" data-jump-post="${pid}">💬 ${cleanAnchor}</a>`);
      } else {
        links.push(`<a href="#" class="tg-inapp-channel" data-open-channel="${ch}" data-open-post="${pid}">↗ ${cleanAnchor} (@${ch} #${pid})</a>`);
      }
      return placeholder;
    }

    // In-app addlist link: https://t.me/addlist/...
    if (/addlist\//i.test(cleanUrl)) {
      links.push(`<a href="${cleanUrl}" target="_blank" rel="noopener" class="tg-ext-link tg-addlist-link" title="Папка Telegram">📁 ${cleanAnchor} ↗</a>`);
      return placeholder;
    }

    // In-app channel link: https://t.me/channel
    const channelMatch = cleanUrl.match(/^https?:\/\/t\.me\/([A-Za-z0-9_]{3,32})$/i);
    if (channelMatch && channelMatch[1].toLowerCase() !== 's') {
      const ch = channelMatch[1];
      links.push(`<a href="#" class="tg-inapp-channel" data-open-channel="${ch}">↗ ${cleanAnchor}</a>`);
      return placeholder;
    }

    // External link
    links.push(`<a href="${cleanUrl}" target="_blank" rel="noopener" class="tg-ext-link">${cleanAnchor} <span style="font-size:11px;opacity:0.8;">↗</span></a>`);
    return placeholder;
  });

  // 5. Escape HTML in the remaining text
  let safe = esc(text);

  // 6. Raw In-app links to specific posts: https://t.me/channel/123
  safe = safe.replace(/https?:\/\/t\.me\/([A-Za-z0-9_]+)\/(\d+)/gi, (match, ch, pid) => {
    if (ch.toLowerCase() === curH) {
      return `<a href="#post-bubble-${pid}" class="tg-inapp-jump" data-jump-post="${pid}">💬 Сообщение #${pid}</a>`;
    } else {
      return `<a href="#" class="tg-inapp-channel" data-open-channel="${ch}" data-open-post="${pid}">↗ @${ch} #${pid}</a>`;
    }
  });

  // 7. Raw in-app links to folders: https://t.me/addlist/slug
  safe = safe.replace(/https?:\/\/t\.me\/addlist\/([A-Za-z0-9_-]+)/gi, (match, slug) => {
    return `<a href="${match}" target="_blank" rel="noopener" class="tg-ext-link tg-addlist-link">📁 Папка t.me/addlist/${slug} ↗</a>`;
  });

  // 8. Raw in-app links to channels: https://t.me/channel
  safe = safe.replace(/https?:\/\/t\.me\/([A-Za-z0-9_]{3,32})(?![/\w])/gi, (match, ch) => {
    if (ch.toLowerCase() === 's') return match;
    return `<a href="#" class="tg-inapp-channel" data-open-channel="${ch}">↗ @${ch}</a>`;
  });

  // 9. User mentions: @channel
  safe = safe.replace(/(^|[^A-Za-z0-9_])@([A-Za-z0-9_]{3,32})/gi, (match, prefix, ch) => {
    return `${prefix}<a href="#" class="tg-inapp-channel" data-open-channel="${ch}">@${ch}</a>`;
  });

  // 10. Hashtags: #hashtag
  safe = safe.replace(/(^|[\s(])#([A-Za-zА-Яа-я0-9_]+)/gu, (match, prefix, tag) => {
    return `${prefix}<span class="tg-hashtag">#${tag}</span>`;
  });

  // 11. Raw external web links: https://...
  safe = safe.replace(/(https?:\/\/(?!t\.me\/)[^\s<>"']+)/gi, (match) => {
    return `<a href="${match}" target="_blank" rel="noopener" class="tg-ext-link">${match}</a>`;
  });

  // 12. Markdown Formatting: Bold (**text**), Italic (*text* or _text_), Strikethrough (~~text~~), Spoilers (||text||)
  safe = safe.replace(/\*\*([^\*\n]+)\*\*/g, '<strong>$1</strong>');
  safe = safe.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');
  safe = safe.replace(/\|\|([^|\n]+)\|\|/g, '<span class="tg-spoiler" onclick="this.classList.toggle(\'revealed\')" title="Нажмите, чтобы показать">$1</span>');
  safe = safe.replace(/(^|[^\w*])\*([^\*\n]+)\*([^\w*]|$)/g, '$1<em>$2</em>$3');
  safe = safe.replace(/(^|[^\w_])_([^_\n]+)_([^\w_]|$)/g, '$1<em>$2</em>$3');

  // 13. Restore Markdown Links
  links.forEach((lHtml, idx) => {
    safe = safe.replace(`__LINK_${idx}__`, lHtml);
  });

  // 14. Restore Inline Codes
  inlineCodes.forEach((cHtml, idx) => {
    safe = safe.replace(`__INLINE_CODE_${idx}__`, cHtml);
  });

  // 15. Restore Code Blocks
  codeBlocks.forEach((bHtml, idx) => {
    safe = safe.replace(`__CODE_BLOCK_${idx}__`, bHtml);
  });

  // 16. Preserve Line Breaks
  safe = safe.replace(/\n/g, '<br>');

  return safe.trim();
}

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

// Render folder tabs in Sidebar and Workspace
function renderFolderTabs() {
  updateBadges();

  const bar = $('#tgSidebarFoldersBar');
  if (bar) {
    bar.innerHTML = folders.map(f => {
      let count = 0;
      if (f.id === 'all') {
        count = savedChannels.length;
      } else if (f.id === 'favorites') {
        const favChs = savedChannels.filter(c => (c.folderIds || []).includes('favorites')).length;
        count = favChs + (savedFavoritePosts.length > 0 ? 1 : 0);
      } else {
        count = savedChannels.filter(c => (c.folderIds || []).includes(f.id)).length;
      }
      const countDisplay = (f.source === 'addlist' && count === 0 && f.chatCount) 
        ? `TG: ${f.chatCount}` 
        : count;

      return `
        <div class="tg-sidebar-folder-pill ${f.id === activeFolderId ? 'active' : ''}" data-sidebar-folder="${esc(f.id)}">
          <span>${esc(f.icon || '📁')}</span>
          <span>${esc(f.name)}</span>
          <span style="font-size:10.5px; opacity:0.85;">(${esc(countDisplay)})</span>
        </div>
      `;
    }).join('');

    $$('#tgSidebarFoldersBar .tg-sidebar-folder-pill').forEach(pill => {
      pill.onclick = (e) => {
        e.stopPropagation();
        activeFolderId = pill.dataset.sidebarFolder;
        renderFoldersView();
      };
    });
  }

  const modalBar = $('#modalSidebarFoldersBar');
  if (modalBar) {
    modalBar.innerHTML = folders.map(f => {
      let count = f.id === 'all' 
        ? savedChannels.length 
        : (f.id === 'favorites' 
            ? savedChannels.filter(c => (c.folderIds || []).includes('favorites')).length
            : savedChannels.filter(c => (c.folderIds || []).includes(f.id)).length);
      return `
        <div class="tg-sidebar-folder-pill ${f.id === activeFolderId ? 'active' : ''}" data-sidebar-folder="${esc(f.id)}">
          <span>${esc(f.icon || '📁')}</span>
          <span>${esc(f.name)}</span>
          <span style="font-size:10.5px; opacity:0.85;">(${count})</span>
        </div>
      `;
    }).join('');
    $$('#modalSidebarFoldersBar .tg-sidebar-folder-pill').forEach(pill => {
      pill.onclick = (e) => {
        e.stopPropagation();
        activeFolderId = pill.dataset.sidebarFolder;
        renderModalSidebar();
        renderFoldersView();
      };
    });
  }
}

// Telegram Workspace Main View: Folders & Sidebar & Active Feed
function renderFoldersView() {
  renderFolderTabs();

  const channelListEl = $('#tgSidebarChannelList');
  if (!channelListEl) return;

  // 1. Filter channels for active folder
  let channels = [];
  if (activeFolderId === 'all') {
    channels = [...savedChannels];
  } else if (activeFolderId === 'favorites') {
    channels = savedChannels.filter(c => (c.folderIds || []).includes('favorites'));
  } else {
    channels = savedChannels.filter(c => (c.folderIds || []).includes(activeFolderId));
  }

  // 2. Filter by search input
  if (sidebarFilterText) {
    const q = sidebarFilterText.toLowerCase();
    channels = channels.filter(c => 
      (c.name || '').toLowerCase().includes(q) || 
      (c.handle || '').toLowerCase().includes(q) ||
      (c.cleanHandle || '').toLowerCase().includes(q) ||
      (c.description || '').toLowerCase().includes(q)
    );
  }

  let itemsHtml = '';

  // ⭐️ Избранное (Сохранённые сообщения) item at top if in favorites folder
  if (activeFolderId === 'favorites') {
    const isSavedSelected = activeWorkspaceChannelId === 'saved_messages';
    itemsHtml += `
      <div class="tg-sidebar-item ${isSavedSelected ? 'active' : ''}" data-sidebar-ch-id="saved_messages">
        <div class="tg-sidebar-item-avatar" style="background:rgba(255,215,0,0.18); color:#ffd700; font-size:18px;">
          ⭐️
        </div>
        <div class="tg-sidebar-item-info">
          <div class="tg-sidebar-item-name">⭐️ Сохранённые сообщения</div>
          <div class="tg-sidebar-item-meta">${savedFavoritePosts.length} сохранённых постов</div>
        </div>
      </div>
    `;
  }

  if (!channels.length && activeFolderId !== 'favorites') {
    itemsHtml += `
      <div style="padding: 32px 16px; text-align: center; color: var(--text-dim); font-size: 13px;">
        <div style="font-size: 26px; margin-bottom: 8px;">📭</div>
        <div>В этой папке пока нет каналов</div>
        <div style="font-size: 11.5px; margin-top: 6px; color: var(--text-muted);">
          Найдите канал в поиске выше или введите @ник
        </div>
      </div>
    `;
  } else {
    channels.forEach(c => {
      const initial = (c.name || c.cleanHandle || '?')[0].toUpperCase();
      const avatarHtml = c.avatar 
        ? `<img src="${esc(c.avatar)}" alt="" onerror="this.style.display='none'; this.parentElement.innerText='${initial}';">` 
        : initial;
      const isActive = c.id === activeWorkspaceChannelId;

      itemsHtml += `
        <div class="tg-sidebar-item ${isActive ? 'active' : ''}" data-sidebar-ch-id="${esc(c.id)}">
          <div class="tg-sidebar-item-avatar">
            ${avatarHtml}
          </div>
          <div class="tg-sidebar-item-info">
            <div class="tg-sidebar-item-name">${esc(c.name)}</div>
            <div class="tg-sidebar-item-meta">${esc(c.handle)} ${c.count != null ? '• ' + formatSubs(c.count) : ''}</div>
          </div>
          <button class="tg-sidebar-item-del" data-del-ch-id="${esc(c.id)}" title="Удалить из этой папки">&times;</button>
        </div>
      `;
    });
  }

  channelListEl.innerHTML = itemsHtml;

  // Bind clicks
  $$('#tgSidebarChannelList .tg-sidebar-item').forEach(el => {
    el.onclick = (e) => {
      const delBtn = e.target.closest('[data-del-ch-id]');
      if (delBtn) {
        e.stopPropagation();
        removeChannelFromFolder(delBtn.dataset.delChId, activeFolderId);
        return;
      }
      openChannelInWorkspace(el.dataset.sidebarChId);
    };
  });

  // Auto-select channel
  const validIds = new Set(channels.map(c => c.id));
  if (activeFolderId === 'favorites') validIds.add('saved_messages');

  if (!activeWorkspaceChannelId || !validIds.has(activeWorkspaceChannelId)) {
    if (activeFolderId === 'favorites') {
      activeWorkspaceChannelId = channels.length ? channels[0].id : 'saved_messages';
      openChannelInWorkspace(activeWorkspaceChannelId);
    } else if (channels.length) {
      activeWorkspaceChannelId = channels[0].id;
      openChannelInWorkspace(activeWorkspaceChannelId);
    } else {
      activeWorkspaceChannelId = null;
      if ($('#tgChatPlaceholder')) $('#tgChatPlaceholder').style.display = 'flex';
      if ($('#tgChatHeader')) $('#tgChatHeader').style.display = 'none';
      if ($('#tgChatDesc')) $('#tgChatDesc').style.display = 'none';
      if ($('#tgAppPostsContainer')) $('#tgAppPostsContainer').style.display = 'none';
    }
  }
}

function removeChannelFromFolder(chId, folderId) {
  const channel = savedChannels.find(c => c.id === chId);
  if (!channel) return;

  if (folderId === 'all') {
    savedChannels = savedChannels.filter(c => c.id !== chId);
    notify(`Канал ${channel.handle} удален`);
  } else {
    channel.folderIds = (channel.folderIds || []).filter(fid => fid !== folderId);
    if (!channel.folderIds.length) channel.folderIds = ['all'];
    notify(`Канал ${channel.handle} удален из папки`);
  }

  saveFolders();
  renderFoldersView();
}

// Open Channel directly inside Telegram Workspace
async function openChannelInWorkspace(channelId, autoScroll = true) {
  activeWorkspaceChannelId = channelId;

  $$('#tgSidebarChannelList .tg-sidebar-item').forEach(el => {
    el.classList.toggle('active', el.dataset.sidebarChId === channelId);
  });

  const placeholder = $('#tgChatPlaceholder');
  const header = $('#tgChatHeader');
  const container = $('#tgAppPostsContainer');
  const descEl = $('#tgChatDesc');
  const favBtn = $('#btnTgToggleFavorite');
  const assignBtn = $('#btnTgAssignFolder');
  const refreshBtn = $('#btnTgRefreshPosts');
  const openTgBtn = $('#btnTgOpenTelegram');

  if (channelId === 'saved_messages') {
    currentChannelData = { id: 'saved_messages', name: 'Сохранённые сообщения', cleanHandle: '', handle: '@saved' };
    currentPostsData = [...savedFavoritePosts];
    if (placeholder) placeholder.style.display = 'none';
    if (header) header.style.display = 'flex';
    if (container) container.style.display = 'block';
    if (descEl) descEl.style.display = 'none';
    if (favBtn) favBtn.style.display = 'none';
    if (assignBtn) assignBtn.style.display = 'none';
    if (refreshBtn) refreshBtn.style.display = 'none';
    if (openTgBtn) openTgBtn.style.display = 'none';

    $('#tgChatHeadInfo').innerHTML = `
      <div class="tg-chat-head-avatar" style="background:rgba(255,215,0,0.18); color:#ffd700; font-size:20px;">⭐️</div>
      <div>
        <div class="tg-chat-head-title">⭐️ Сохранённые сообщения</div>
        <div class="tg-chat-head-subs">${savedFavoritePosts.length} сохранённых сообщений</div>
      </div>
    `;

    renderWorkspacePosts(false);
    return;
  }

  const channel = catalog.get(channelId) || savedChannels.find(c => c.id === channelId);
  if (!channel) return;

  currentChannelData = channel;
  if (placeholder) placeholder.style.display = 'none';
  if (header) header.style.display = 'flex';
  if (container) container.style.display = 'block';
  if (favBtn) favBtn.style.display = 'inline-flex';
  if (assignBtn) assignBtn.style.display = 'inline-flex';
  if (refreshBtn) refreshBtn.style.display = 'inline-flex';
  if (openTgBtn) {
    openTgBtn.style.display = 'inline-flex';
    openTgBtn.href = channel.url || `https://t.me/${channel.cleanHandle}`;
  }

  // Update Favorite button
  const isChannelFav = channel.folderIds && channel.folderIds.includes('favorites');
  $('#favStarIcon').textContent = isChannelFav ? '★' : '⭐️';
  $('#favStarText').textContent = isChannelFav ? 'В избранном' : 'В избранное';
  favBtn.classList.toggle('active', !!isChannelFav);

  // Update header info
  const initial = (channel.name || channel.cleanHandle || '?')[0].toUpperCase();
  const avatarHtml = channel.avatar 
    ? `<img src="${esc(channel.avatar)}" alt="" onerror="this.style.display='none'; this.parentElement.innerText='${initial}';">` 
    : initial;
  $('#tgChatHeadInfo').innerHTML = `
    <div class="tg-chat-head-avatar">${avatarHtml}</div>
    <div style="min-width:0;">
      <div class="tg-chat-head-title">${esc(channel.name)}</div>
      <div class="tg-chat-head-subs">${esc(channel.handle)} ${channel.count != null ? '• ' + formatSubs(channel.count) + ' подписчиков' : ''}</div>
    </div>
  `;

  if (channel.description) {
    descEl.textContent = channel.description;
    descEl.style.display = 'block';
  } else {
    descEl.style.display = 'none';
  }

  // 1. INSTANT 0ms Cache Display!
  const cached = getCachedPosts(channel.cleanHandle);
  if (cached && cached.length) {
    currentPostsData = cached;
    renderWorkspacePosts(false);
    if (autoScroll) {
      setTimeout(() => {
        if (container) container.scrollTop = isAscendingOrder ? container.scrollHeight : 0;
      }, 30);
    }
  } else {
    currentPostsData = [];
    container.innerHTML = `
      <div class="empty-box" style="padding: 60px 0;">
        <div class="empty-icon">⏳</div>
        <div>Загружаем сообщения канала @${esc(channel.cleanHandle)}...</div>
      </div>
    `;
  }

  // 2. Background Fresh Fetch (Merges newest posts without losing any existing ones)
  try {
    const res = await fetch(`/api/posts?handle=${encodeURIComponent(channel.cleanHandle)}&all=1`);
    const data = await res.json();

    if (!currentChannelData || currentChannelData.cleanHandle !== channel.cleanHandle) return;

    if (data.channel) {
      if (data.channel.avatar && data.channel.avatar !== channel.avatar) {
        channel.avatar = data.channel.avatar;
        updateChannelAvatarInDom(channel.cleanHandle, data.channel.avatar);
      }
      if (data.channel.name && (!channel.name || channel.name === channel.cleanHandle)) {
        channel.name = data.channel.name;
        const titleEl = $('#tgChatHeadInfo .tg-chat-head-title');
        if (titleEl) titleEl.textContent = channel.name;
      }
      saveFolders();
    }

    if (data.posts && data.posts.length) {
      const postMap = new Map();
      currentPostsData.forEach(p => postMap.set(String(p.id), p));
      let added = 0;
      data.posts.forEach(p => {
        const sid = String(p.id);
        if (!postMap.has(sid)) added++;
        postMap.set(sid, Object.assign({}, postMap.get(sid) || {}, p));
      });
      currentPostsData = Array.from(postMap.values());
      currentPostsData.sort((a, b) => (parseInt(a.id, 10) || 0) - (parseInt(b.id, 10) || 0));

      saveCachedPosts(channel.cleanHandle, currentPostsData);
      renderWorkspacePosts(false);

      if (added > 0 && autoScroll) {
        setTimeout(() => {
          if (container && isAscendingOrder) container.scrollTop = container.scrollHeight;
        }, 50);
      }
    } else if (!currentPostsData.length) {
      container.innerHTML = `
        <div class="empty-box" style="padding: 60px 0;">
          <div class="empty-icon">📭</div>
          <div>Лента сообщений канала пуста или является приватной.</div>
        </div>
      `;
    }
  } catch (err) {
    console.warn('Background posts fetch failed:', err);
    if (!currentPostsData.length) {
      container.innerHTML = `
        <div class="empty-box" style="padding: 60px 0;">
          <div class="empty-icon">⚠️</div>
          <div>Не удалось загрузить сообщения: ${esc(err.message)}</div>
        </div>
      `;
    }
  }
}

// Render Posts Feed in Workspace
function renderWorkspacePosts(isFilterOnly = false) {
  const container = $('#tgAppPostsContainer');
  if (!container) return;

  let list = [...currentPostsData];
  const query = ($('#tgChatSearchPosts')?.value || '').trim().toLowerCase();
  if (query) {
    list = list.filter(p => (p.text || '').toLowerCase().includes(query) || String(p.id).includes(query));
  }

  list.sort((a, b) => {
    const numA = parseInt(a.id, 10) || 0;
    const numB = parseInt(b.id, 10) || 0;
    return isAscendingOrder ? (numA - numB) : (numB - numA);
  });

  if (!list.length) {
    container.innerHTML = `
      <div class="empty-box" style="padding: 60px 0;">
        <div class="empty-icon">🔍</div>
        <div>${query ? `По запросу «${esc(query)}» ничего не найдено` : 'Нет сообщений для отображения'}</div>
      </div>
    `;
    return;
  }

  const paginationButtonHtml = `
    <div class="load-older-wrap" style="text-align: center; padding: 20px 0;">
      <button id="btnTgAppLoadOlder" class="btn-pill primary" style="margin: 0 auto; padding: 10px 24px; font-weight: 700; cursor: pointer;">
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

  const isSavedMessagesView = currentChannelData?.id === 'saved_messages';

  list.forEach(p => {
    const dateLabel = p.dateOnly || (p.date ? p.date.split(',')[0].trim() : '');
    if (dateLabel && dateLabel !== lastDatePill) {
      lastDatePill = dateLabel;
      htmlOutput += `<div class="chat-date-divider"><span>${esc(dateLabel)}</span></div>`;
    }

    const postAuthorName = isSavedMessagesView ? (p.channelName || 'Канал') : (currentChannelData?.name || 'Канал');
    const postAuthorAvatar = (isSavedMessagesView && p.channelAvatar) 
      ? `<img src="${esc(p.channelAvatar)}" alt="" loading="lazy" onerror="this.style.display='none'; this.parentElement.innerText='${(p.channelName || '?')[0].toUpperCase()}';">`
      : authorAvatarImg;

    const formattedBody = formatPostHtml(p.text, isSavedMessagesView ? p.channelHandle : (currentChannelData ? currentChannelData.cleanHandle : ''), p.isMediaNote);

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
    if (p.isMediaNote && !p.text) {
      noteBadge = `
        <div class="media-note-banner">
          <span class="media-note-icon">📹</span>
          <div class="media-note-info">
            <strong>Видеосообщение (кружочек) / Голосовое</strong>
            <small>Смотрите запись в Telegram ↗</small>
          </div>
        </div>
      `;
    }

    const isFav = savedFavoritePosts.some(fp => String(fp.id) === String(p.id) && fp.channelHandle === (isSavedMessagesView ? p.channelHandle : currentChannelData?.cleanHandle));

    htmlOutput += `
      <div class="post-bubble" id="post-bubble-${esc(p.id)}">
        <div class="post-bubble-header">
          <div class="post-author-row">
            <div class="post-author-avatar">
              ${postAuthorAvatar}
            </div>
            <span class="post-author-name">${esc(postAuthorName)}</span>
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
          <div style="display:flex; align-items:center; gap:8px;">
            <button class="btn-post-fav ${isFav ? 'active' : ''}" data-post-fav-id="${esc(p.id)}" title="${isFav ? 'Удалить из Избранного' : 'Сохранить в Избранное'}">
              ${isFav ? '★ В избранном' : '⭐️ Сохранить'}
            </button>
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

  const olderBtn = $('#btnTgAppLoadOlder');
  if (olderBtn) olderBtn.onclick = loadOlderPosts;
}

// Toggle Bookmarking of an Individual Post (Saved Messages)
function toggleBookmarkPost(postId) {
  const post = currentPostsData.find(p => String(p.id) === String(postId));
  if (!post) return;

  const handle = currentChannelData?.cleanHandle || '';
  const existingIdx = savedFavoritePosts.findIndex(fp => String(fp.id) === String(postId) && fp.channelHandle === handle);
  if (existingIdx >= 0) {
    savedFavoritePosts.splice(existingIdx, 1);
    notify(`Сообщение #${postId} удалено из Избранного`);
  } else {
    savedFavoritePosts.unshift({
      ...post,
      channelId: currentChannelData?.id,
      channelHandle: handle,
      channelName: currentChannelData?.name || 'Канал',
      channelAvatar: currentChannelData?.avatar || null,
      savedAt: new Date().toISOString()
    });
    notify(`⭐️ Сообщение #${postId} сохранено в Избранное!`);
  }
  localStorage.setItem('tg_favorite_posts', JSON.stringify(savedFavoritePosts));
  renderWorkspacePosts(true);
  renderFolderTabs();
}

// Toggle Channel in Favorites Folder
function toggleChannelFavorite() {
  if (!currentChannelData || currentChannelData.id === 'saved_messages') return;
  if (!currentChannelData.folderIds) currentChannelData.folderIds = ['all'];

  const hasFav = currentChannelData.folderIds.includes('favorites');
  if (hasFav) {
    currentChannelData.folderIds = currentChannelData.folderIds.filter(fid => fid !== 'favorites');
    notify(`Канал @${currentChannelData.cleanHandle} удален из Избранного`);
  } else {
    currentChannelData.folderIds.push('favorites');
    notify(`⭐️ Канал @${currentChannelData.cleanHandle} добавлен в Избранное!`);
  }

  const existing = savedChannels.find(c => c.id === currentChannelData.id);
  if (existing) {
    existing.folderIds = currentChannelData.folderIds;
  } else {
    savedChannels.unshift(currentChannelData);
  }

  saveFolders();
  renderFoldersView();
  openChannelInWorkspace(currentChannelData.id, false);
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
  $('#searchBtn')?.setAttribute('disabled', 'true'); $('#btnSidebarSearchGo')?.setAttribute('disabled', 'true');
  if ($('#resultsHeading')) $('#resultsHeading').textContent = `Результаты: «${input}»`;
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
      if ($('#resultsHeading')) $('#resultsHeading').innerHTML = `Результаты: «${esc(input)}» <span style="font-size:11.5px;color:#38d39f;font-weight:700;margin-left:8px;background:rgba(56,211,159,0.12);padding:2px 8px;border-radius:10px;">🤖 ИИ активен</span>`;
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
    $('#searchBtn')?.removeAttribute('disabled'); $('#btnSidebarSearchGo')?.removeAttribute('disabled');
    renderCards();
  }
}

// Fetch single channel by handle/link
async function fetchSingleChannel(value) {
  let handle = value.replace(/^(?:https?:\/\/)?(?:www\.)?t\.me\//i, '').replace(/^@/, '').split('/')[0].split('?')[0].trim();
  if (!handle) return;

  const existing = catalog.get(handle.toLowerCase()) || savedChannels.find(c => (c.cleanHandle || '').toLowerCase() === handle.toLowerCase());
  if (existing) {
    openChannelInWorkspace(existing.id);
    return;
  }

  notify(`Загрузка канала @${handle}...`);
  try {
    const res = await fetch(`/api/channel?handle=${encodeURIComponent(handle)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Канал не найден');

    const channel = normalizeChannel(data.channel);
    if (!channel.folderIds || !channel.folderIds.length) {
      channel.folderIds = ['all'];
      if (activeFolderId && activeFolderId !== 'all') {
        channel.folderIds.push(activeFolderId);
      }
    }
    catalog.set(channel.id, channel);
    catalog.set(channel.cleanHandle.toLowerCase(), channel);
    if (!savedChannels.some(c => c.id === channel.id)) {
      savedChannels.unshift(channel);
      saveFolders();
      renderFoldersView();
    }
    openChannelInWorkspace(channel.id);
  } catch (err) {
    const fallbackChannel = normalizeChannel({ handle, name: handle });
    catalog.set(fallbackChannel.id, fallbackChannel);
    catalog.set(fallbackChannel.cleanHandle.toLowerCase(), fallbackChannel);
    if (!savedChannels.some(c => c.id === fallbackChannel.id)) {
      savedChannels.unshift(fallbackChannel);
      saveFolders();
      renderFoldersView();
    }
    openChannelInWorkspace(fallbackChannel.id);
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

// Telegram Sidebar in Channel View
function renderModalSidebar() {
  const foldersBar = $('#modalSidebarFoldersBar');
  const channelList = $('#modalSidebarChannelList');
  if (!foldersBar || !channelList) return;

  // 1. Folders tabs in sidebar
  foldersBar.innerHTML = folders.map(f => {
    let count = 0;
    if (f.id === 'all') {
      count = savedChannels.length;
    } else {
      count = savedChannels.filter(c => (c.folderIds || []).includes(f.id)).length;
    }
    const isActive = f.id === activeFolderId;
    return `
      <div class="tg-sidebar-folder-pill ${isActive ? 'active' : ''}" data-sidebar-folder="${esc(f.id)}">
        <span>${esc(f.icon || '📁')}</span>
        <span>${esc(f.name)}</span>
        <span style="font-size:10.5px; opacity:0.8;">(${count})</span>
      </div>
    `;
  }).join('');

  $$('#modalSidebarFoldersBar .tg-sidebar-folder-pill').forEach(pill => {
    pill.onclick = (e) => {
      e.stopPropagation();
      activeFolderId = pill.dataset.sidebarFolder;
      renderModalSidebar();
      renderFolderTabs();
    };
  });

  // 2. Channels in active folder
  let channelsInFolder = activeFolderId === 'all'
    ? [...savedChannels]
    : savedChannels.filter(c => (c.folderIds || []).includes(activeFolderId));

  if (sidebarFilterText) {
    const f = sidebarFilterText.toLowerCase();
    channelsInFolder = channelsInFolder.filter(c => 
      (c.name || '').toLowerCase().includes(f) || 
      (c.handle || '').toLowerCase().includes(f) ||
      (c.description || '').toLowerCase().includes(f)
    );
  }

  const currentId = currentChannelData ? currentChannelData.id : '';

  if (!channelsInFolder.length) {
    channelList.innerHTML = `
      <div style="padding: 30px 16px; text-align: center; color: var(--text-dim); font-size: 13px;">
        Каналов не найдено
      </div>
    `;
    return;
  }

  channelList.innerHTML = channelsInFolder.map(c => {
    const initial = (c.name || c.cleanHandle || '?')[0].toUpperCase();
    const avatarHtml = c.avatar
      ? `<img src="${esc(c.avatar)}" alt="" loading="lazy" onerror="this.style.display='none'; this.parentElement.innerText='${initial}';">`
      : initial;
    const isActive = c.id === currentId;

    return `
      <div class="tg-sidebar-item ${isActive ? 'active' : ''}" data-ch-id="${esc(c.id)}">
        <div class="tg-sidebar-item-avatar">
          ${avatarHtml}
        </div>
        <div class="tg-sidebar-item-info">
          <div class="tg-sidebar-item-name">${esc(c.name)}</div>
          <div class="tg-sidebar-item-meta">${esc(c.handle)} ${c.count != null ? '• ' + formatSubs(c.count) : ''}</div>
        </div>
      </div>
    `;
  }).join('');

  $$('#modalSidebarChannelList .tg-sidebar-item').forEach(item => {
    item.onclick = (e) => {
      e.stopPropagation();
      const chId = item.dataset.chId;
      if (chId && chId !== currentId) {
        openChannelModal(chId);
      }
    };
  });
}

// Open Channel Modal
async function openChannelModal(id) {
  openChannelInWorkspace(id);
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
      const postMap = new Map();
      currentPostsData.forEach(p => postMap.set(String(p.id), p));
      let added = 0;
      data.posts.forEach(np => {
        const sid = String(np.id);
        if (!postMap.has(sid)) added++;
        postMap.set(sid, Object.assign({}, postMap.get(sid) || {}, np));
      });
      currentPostsData = Array.from(postMap.values());
      currentPostsData.sort((a, b) => (parseInt(a.id, 10) || 0) - (parseInt(b.id, 10) || 0));
      saveCachedPosts(currentChannelData.cleanHandle, currentPostsData);
      renderWorkspacePosts(false);
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
    if (p.isMediaNote && !p.text) {
      noteBadge = `
        <div class="media-note-banner">
          <span class="media-note-icon">📹</span>
          <div class="media-note-info">
            <strong>Видеосообщение (кружочек) / Голосовое</strong>
            <small>Смотрите запись в Telegram ↗</small>
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

// Sidebar Global Channel Search & Direct Subscribe

// Global Search State for Sidebar
let globalSearchResults = null;
let isSearchingGlobal = false;
let sidebarSearchTimeout = null;

function executeSidebarSearch() {
  const input = $('#tgSidebarSearchInput');
  if (input) triggerSidebarGlobalSearch(input.value);
}

// Trigger Sidebar Global Search (Debounced & Immediate)
async function triggerSidebarGlobalSearch(queryText = '') {
  const input = $('#tgSidebarSearchInput');
  const query = (queryText || (input ? input.value : '')).trim();
  const clearBtn = $('#btnSidebarSearchClear');

  if (!query) {
    if (clearBtn) clearBtn.style.display = 'none';
    globalSearchResults = null;
    isSearchingGlobal = false;
    sidebarFilterText = '';
    renderFoldersView();
    return;
  }

  if (clearBtn) clearBtn.style.display = 'inline-flex';
  sidebarFilterText = query;

  // Telegram addlist link detection
  if (/addlist\//i.test(query) || /t\.me\/addlist/i.test(query)) {
    await importTelegramAddlist(query);
    if (input) input.value = '';
    if (clearBtn) clearBtn.style.display = 'none';
    return;
  }

  // 1. Immediately render local matches + searching indicator
  const qLower = query.toLowerCase();
  const localMatches = savedChannels.filter(c => 
    (c.name || '').toLowerCase().includes(qLower) || 
    (c.handle || '').toLowerCase().includes(qLower) ||
    (c.cleanHandle || '').toLowerCase().includes(qLower) ||
    (c.description || '').toLowerCase().includes(qLower)
  );

  isSearchingGlobal = true;
  renderSidebarSearchResults(localMatches, null, query);

  // 2. Fetch global results from Telegram
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    globalSearchResults = data.results || [];
  } catch (err) {
    console.warn('Global search error:', err);
    globalSearchResults = [];
  } finally {
    isSearchingGlobal = false;
    renderSidebarSearchResults(localMatches, globalSearchResults, query);
  }
}

// Render Search Results directly inside Sidebar Channel List
function renderSidebarSearchResults(localMatches, globalResults, query) {
  const listEl = $('#tgSidebarChannelList');
  if (!listEl) return;

  let html = '';

  // 1. Local Matches Section
  if (localMatches && localMatches.length > 0) {
    html += `
      <div class="tg-sidebar-section-title">
        <span>В моих каналах</span>
        <span>${localMatches.length}</span>
      </div>
    `;

    localMatches.forEach(c => {
      const initial = (c.name || c.cleanHandle || '?')[0].toUpperCase();
      const avatarHtml = c.avatar 
        ? `<img src="${esc(c.avatar)}" alt="" onerror="this.style.display='none'; this.parentElement.innerText='${initial}';">` 
        : initial;
      const isActive = c.id === activeWorkspaceChannelId;

      html += `
        <div class="tg-sidebar-item ${isActive ? 'active' : ''}" data-sidebar-ch-id="${esc(c.id)}">
          <div class="tg-sidebar-item-avatar">
            ${avatarHtml}
          </div>
          <div class="tg-sidebar-item-info">
            <div class="tg-sidebar-item-name">${esc(c.name)}</div>
            <div class="tg-sidebar-item-meta">${esc(c.handle)} ${c.count != null ? '• ' + formatSubs(c.count) : ''}</div>
          </div>
        </div>
      `;
    });
  }

  // 2. Global Telegram Search Results Section
  html += `
    <div class="tg-sidebar-section-title" style="margin-top: 12px;">
      <span>Глобальный поиск в Telegram</span>
      <span>${globalResults ? globalResults.length : '...'}</span>
    </div>
  `;

  if (isSearchingGlobal && globalResults === null) {
    html += `
      <div style="padding: 24px 16px; text-align: center; color: var(--text-dim); font-size: 12.5px;">
        <div style="font-size: 20px; margin-bottom: 6px;" class="spinning">⏳</div>
        <div>Ищем каналы в Telegram по «${esc(query)}»...</div>
      </div>
    `;
  } else if (!globalResults || !globalResults.length) {
    const cleanQ = query.replace(/^@/, '').replace(/^(?:https?:\/\/)?(?:www\.)?t\.me\//i, '').trim();
    html += `
      <div style="padding: 18px 14px; text-align: center; color: var(--text-dim); font-size: 12.5px;">
        <div>По запросу ничего не найдено в общей базе.</div>
        <button class="btn-pill primary" id="btnSidebarDirectCheck" style="margin-top: 8px; width: 100%; justify-content: center; font-size: 11.5px;">
          ⚡ Проверить прямой ник @${esc(cleanQ)}
        </button>
      </div>
    `;
  } else {
    globalResults.forEach(r => {
      const initial = (r.name || r.cleanHandle || '?')[0].toUpperCase();
      const avHtml = r.avatar 
        ? `<img src="${esc(r.avatar)}" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none'; this.parentElement.innerText='${initial}';">` 
        : initial;
      const isAlreadySaved = savedChannels.some(c => c.id === r.id || c.cleanHandle.toLowerCase() === (r.cleanHandle || '').toLowerCase());

      html += `
        <div class="tg-sidebar-item tg-global-search-item" data-global-ch-handle="${esc(r.cleanHandle || r.handle)}" style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
          <div style="display:flex; align-items:center; gap:10px; min-width:0; flex:1;">
            <div class="tg-sidebar-item-avatar">
              ${avHtml}
            </div>
            <div class="tg-sidebar-item-info">
              <div class="tg-sidebar-item-name">${esc(r.name || r.handle)}</div>
              <div class="tg-sidebar-item-meta">${esc(r.handle)} ${r.count != null ? '• ' + formatSubs(r.count) : ''}</div>
            </div>
          </div>
          <button class="btn-pill ${isAlreadySaved ? '' : 'primary'} btn-sidebar-quick-add" data-handle="${esc(r.cleanHandle || r.handle)}" style="padding:4px 9px; font-size:11px; flex-shrink:0;">
            ${isAlreadySaved ? 'В списке' : '+ В папку'}
          </button>
        </div>
      `;
    });
  }

  listEl.innerHTML = html;

  // Bind local clicks
  $$('#tgSidebarChannelList .tg-sidebar-item[data-sidebar-ch-id]').forEach(el => {
    el.onclick = () => {
      openChannelInWorkspace(el.dataset.sidebarChId);
    };
  });

  // Bind direct check button
  const directBtn = $('#btnSidebarDirectCheck');
  if (directBtn) {
    directBtn.onclick = async () => {
      const cleanH = query.replace(/^@/, '').replace(/^(?:https?:\/\/)?(?:www\.)?t\.me\//i, '').trim();
      await fetchSingleChannel(cleanH);
    };
  }

  // Bind global channel click / add
  $$('#tgSidebarChannelList .tg-global-search-item').forEach(el => {
    el.onclick = (e) => {
      const handle = el.dataset.globalChHandle;
      const norm = normalizeChannel({ handle, name: handle });
      if (!norm.folderIds) norm.folderIds = ['all'];
      if (activeFolderId && activeFolderId !== 'all') {
        if (!norm.folderIds.includes(activeFolderId)) norm.folderIds.push(activeFolderId);
      }
      catalog.set(norm.id, norm);
      if (!savedChannels.some(c => c.id === norm.id)) {
        savedChannels.unshift(norm);
      }
      saveFolders();
      openChannelInWorkspace(norm.id);
      notify(`Канал @${norm.cleanHandle} открыт!`);
    };
  });
}


function initEvents() {
  // Modal: Addlist
  const addlistModal = $('#addlistModal');
  const openAddlist = () => {
    if (!addlistModal) return;
    const inp = $('#addlistLinkInput');
    const extra = $('#addlistExtraHandles');
    if (inp) inp.value = '';
    if (extra) extra.value = '';
    addlistModal.classList.add('open');
    document.body.classList.add('modal-open');
    if (inp) setTimeout(() => inp.focus(), 50);
  };
  const closeAddlist = () => {
    if (addlistModal) {
      addlistModal.classList.remove('open');
      document.body.classList.remove('modal-open');
    }
  };
  if ($('#btnSidebarAddlist')) $('#btnSidebarAddlist').onclick = openAddlist;
  if ($('#closeAddlistModal')) $('#closeAddlistModal').onclick = closeAddlist;
  if ($('#cancelAddlistBtn')) $('#cancelAddlistBtn').onclick = closeAddlist;
  if ($('#submitAddlistBtn')) {
    $('#submitAddlistBtn').onclick = async () => {
      const url = $('#addlistLinkInput')?.value.trim();
      const extra = $('#addlistExtraHandles')?.value.trim();
      if (!url) {
        notify('Вставьте ссылку на папку Telegram (t.me/addlist/...)');
        return;
      }
      closeAddlist();
      await importTelegramAddlist(url, extra);
    };
  }

  // Modal: New Folder
  const newFolderModal = $('#newFolderModal');
  const openNewFolder = () => {
    if (!newFolderModal) return;
    const inp = $('#newFolderNameInput');
    if (inp) inp.value = '';
    newFolderModal.classList.add('open');
    document.body.classList.add('modal-open');
    if (inp) setTimeout(() => inp.focus(), 50);
  };
  const closeNewFolder = () => {
    if (newFolderModal) {
      newFolderModal.classList.remove('open');
      document.body.classList.remove('modal-open');
    }
  };
  if ($('#btnSidebarNewFolder')) $('#btnSidebarNewFolder').onclick = openNewFolder;
  if ($('#closeNewFolderModal')) $('#closeNewFolderModal').onclick = closeNewFolder;
  if ($('#cancelNewFolderBtn')) $('#cancelNewFolderBtn').onclick = closeNewFolder;
  if ($('#submitNewFolderBtn')) {
    $('#submitNewFolderBtn').onclick = () => {
      const name = $('#newFolderNameInput')?.value.trim();
      if (!name) {
        notify('Введите название папки');
        return;
      }
      closeNewFolder();
      createCustomFolder(name);
    };
  }

  // Modal: Assign Folder
  const assignModal = $('#assignFolderModal');
  const closeAssignModal = () => {
    if (assignModal) {
      assignModal.classList.remove('open');
      document.body.classList.remove('modal-open');
    }
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
        if (channelForFolderAssignment) {
          openAssignFolderModal(channelForFolderAssignment.id);
        }
        notify(`Папка «${nf.name}» создана!`);
      }
    };
  }

  // Escape key closes open modals
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (addlistModal?.classList.contains('open')) closeAddlist();
      if (newFolderModal?.classList.contains('open')) closeNewFolder();
      if (assignModal?.classList.contains('open')) closeAssignModal();
      if ($('#apiModal')?.classList.contains('open')) $('#apiModal').classList.remove('open');
    }
  });

  // Sidebar toggle
  if ($('#btnTgSidebarToggleApp')) {
    $('#btnTgSidebarToggleApp').onclick = () => {
      $('#appTgSidebar')?.classList.toggle('collapsed');
    };
  }

  // Workspace Chat Header Actions
  if ($('#tgChatSearchPosts')) {
    $('#tgChatSearchPosts').addEventListener('input', () => {
      renderWorkspacePosts(true);
    });
  }

  if ($('#btnTgToggleFavorite')) {
    $('#btnTgToggleFavorite').onclick = toggleChannelFavorite;
  }

  if ($('#btnTgAssignFolder')) {
    $('#btnTgAssignFolder').onclick = () => {
      if (currentChannelData && currentChannelData.id !== 'saved_messages') {
        openAssignFolderModal(currentChannelData.id);
      }
    };
  }

  if ($('#btnTgRefreshPosts')) {
    $('#btnTgRefreshPosts').onclick = refreshChannelPosts;
  }

  if ($('#btnTgOrderToggle')) {
    $('#btnTgOrderToggle').onclick = () => {
      isAscendingOrder = !isAscendingOrder;
      const label = isAscendingOrder ? '⬆ Снизу новые' : '⬇ Сверху новые';
      if ($('#appOrderToggleText')) $('#appOrderToggleText').textContent = label;
      renderWorkspacePosts(false);
      setTimeout(() => {
        const c = $('#tgAppPostsContainer');
        if (c) c.scrollTop = isAscendingOrder ? c.scrollHeight : 0;
      }, 40);
    };
  }

  if ($('#btnTgCopyAll')) {
    $('#btnTgCopyAll').onclick = copyAllPosts;
  }

  // Workspace Scroll to Bottom Button
  const appPostsBox = $('#tgAppPostsContainer');
  if (appPostsBox) {
    appPostsBox.addEventListener('scroll', () => {
      const diff = appPostsBox.scrollHeight - appPostsBox.scrollTop - appPostsBox.clientHeight;
      $('#btnTgAppScrollBottom')?.classList.toggle('show', diff > 240);
    });

    // Intercept clicks inside chat (bookmarking post, copy post, in-app links)
    appPostsBox.onclick = e => {
      const favBtn = e.target.closest('[data-post-fav-id]');
      if (favBtn) {
        e.preventDefault();
        e.stopPropagation();
        toggleBookmarkPost(favBtn.dataset.postFavId);
        return;
      }

      const copyBtn = e.target.closest('[data-copy-post]');
      if (copyBtn) {
        e.preventDefault();
        copyToClipboard(copyBtn.dataset.copyPost, 'Текст сообщения скопирован!');
        copyBtn.classList.add('copied');
        setTimeout(() => copyBtn.classList.remove('copied'), 1500);
        return;
      }

      const jumpBtn = e.target.closest('.tg-inapp-jump');
      if (jumpBtn) {
        e.preventDefault();
        const pid = jumpBtn.dataset.jumpPost;
        const targetBubble = document.getElementById(`post-bubble-${pid}`);
        if (targetBubble) {
          targetBubble.scrollIntoView({ behavior: 'smooth', block: 'center' });
          targetBubble.classList.remove('highlighted');
          void targetBubble.offsetWidth;
          targetBubble.classList.add('highlighted');
          notify(`Переход к сообщению #${pid}`);
        } else {
          jumpToPost(pid);
        }
        return;
      }

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
  }

  if ($('#btnTgAppScrollBottom') && appPostsBox) {
    $('#btnTgAppScrollBottom').onclick = () => {
      appPostsBox.scrollTo({ top: appPostsBox.scrollHeight, behavior: 'smooth' });
    };
  }

  // API modal
  const openApi = () => $('#apiModal')?.classList.add('open');
  const closeApi = () => $('#apiModal')?.classList.remove('open');
  if ($('#openApiModal')) $('#openApiModal').onclick = openApi;
  if ($('#closeApiModal')) $('#closeApiModal').onclick = closeApi;
  if ($('#apiModal')) {
    $('#apiModal').onclick = e => {
      if (e.target === $('#apiModal')) closeApi();
    };
  }

  $$('.copy-code-btn').forEach(btn => {
    btn.onclick = () => {
      const el = document.getElementById(btn.dataset.target);
      if (el) copyToClipboard(el.textContent, 'Код скопирован!');
    };
  });

  // Theme toggle
  const savedTheme = localStorage.getItem('tg_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  if ($('#themeToggle')) {
    $('#themeToggle').onclick = () => {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('tg_theme', next);
      notify(`Включена ${next === 'dark' ? 'тёмная' : 'светлая'} тема`);
    };
  }
}

// Unified Application Initial Load
async function init() {
  try { initEvents(); } catch(e) { console.error('initEvents error:', e); }
  try { renderFolderTabs(); } catch(e) { console.error('renderFolderTabs error:', e); }
  try { renderFoldersView(); } catch(e) { console.error('renderFoldersView error:', e); }

  // Category tags in sidebar
  $$('#sidebarCategoryTags .cat-pill').forEach(pill => {
    pill.onclick = () => {
      $$('#sidebarCategoryTags .cat-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const cat = pill.dataset.cat;
      const input = $('#tgSidebarSearchInput');
      if (cat === 'all') {
        if (input) input.value = '';
        triggerSidebarGlobalSearch('');
      } else {
        const topicMap = {
          'youtube': 'Ютуб',
          'news': 'Новости',
          'tech': 'IT',
          'crypto': 'Крипта',
          'business': 'Бизнес',
          'design': 'Дизайн'
        };
        const topic = topicMap[cat] || cat;
        if (input) input.value = topic;
        triggerSidebarGlobalSearch(topic);
      }
    };
  });

  // Clear search button in sidebar
  const clearBtn = $('#btnSidebarSearchClear');
  if (clearBtn) {
    clearBtn.onclick = () => {
      const input = $('#tgSidebarSearchInput');
      if (input) input.value = '';
      clearBtn.style.display = 'none';
      $$('#sidebarCategoryTags .cat-pill').forEach(p => p.classList.remove('active'));
      $('#sidebarCategoryTags .cat-pill[data-cat="all"]')?.classList.add('active');
      triggerSidebarGlobalSearch('');
    };
  }

  // Sidebar search input debounced listener
  const sbInput = $('#tgSidebarSearchInput');
  if (sbInput) {
    sbInput.addEventListener('input', e => {
      const val = e.target.value;
      clearTimeout(sidebarSearchTimeout);
      if (!val.trim()) {
        triggerSidebarGlobalSearch('');
      } else {
        sidebarSearchTimeout = setTimeout(() => {
          triggerSidebarGlobalSearch(val);
        }, 280);
      }
    });

    sbInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        clearTimeout(sidebarSearchTimeout);
        triggerSidebarGlobalSearch(sbInput.value);
      }
    });
  }

  // Sidebar search go button
  if ($('#btnSidebarSearchGo')) {
    $('#btnSidebarSearchGo').onclick = () => {
      const input = $('#tgSidebarSearchInput');
      if (input) triggerSidebarGlobalSearch(input.value);
    };
  }

  // Auto-open first channel in workspace on load (0ms from cache)
  try {
    if (savedChannels.length > 0) {
      openChannelInWorkspace(savedChannels[0].id);
    }
  } catch(e) {
    console.error('Auto open channel error:', e);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
