// Background Service Worker: 业务核心与数据中心

const EXCLUDE_HOSTS = new Set([
  'www.google.com',
  'google.com',
  'www.bing.com',
  'bing.com',
  'www.baidu.com',
  'baidu.com',
  'www.yahoo.com',
  'yahoo.com',
  'www.facebook.com',
  'facebook.com',
  'www.twitter.com',
  'twitter.com',
  'www.youtube.com',
  'youtube.com',
]);

const defaultHistory = (domain, url) => ({
  domain,
  firstVisit: Date.now(),
  lastVisit: Date.now(),
  visitCount: 1,
  url,
  hasNotes: false,
});

// 防止快捷键与内容脚本后备监听同时触发造成“双切换”
const lastToggleAt = new Map();
function shouldSkipToggle(domain) {
  const now = Date.now();
  const prev = lastToggleAt.get(domain) || 0;
  if (now - prev < 500) return true;
  lastToggleAt.set(domain, now);
  return false;
}

function extractDomain(urlString) {
  try {
    const u = new URL(urlString);
    return u.host;
  } catch (e) {
    return '';
  }
}

function shouldExclude(urlString) {
  try {
    const u = new URL(urlString);
    if (u.protocol.startsWith('chrome')) return true;
    if (u.protocol === 'about:') return true;
    if (EXCLUDE_HOSTS.has(u.hostname)) return true;
    return false;
  } catch (e) {
    return true;
  }
}

// Root domain detection with basic multi-level public suffix support
const MULTI_LEVEL_SUFFIXES = new Set([
  'co.uk',
  'ac.uk',
  'gov.uk',
  'ltd.uk',
  'plc.uk',
  'me.uk',
  'sch.uk',
  'com.cn',
  'net.cn',
  'org.cn',
  'gov.cn',
  'edu.cn',
  'com.au',
  'net.au',
  'org.au',
  'gov.au',
  'edu.au',
  'com.tw',
  'net.tw',
  'org.tw',
  'idv.tw',
  'com.hk',
  'edu.hk',
  'com.sg',
  'co.jp',
  'com.jp',
  'com.br',
  'com.tr',
]);

function endsWithMultiSuffix(hostname) {
  for (const suf of MULTI_LEVEL_SUFFIXES) {
    if (hostname === suf) return suf;
    if (hostname.endsWith('.' + suf)) return suf;
  }
  return null;
}

function rootDomain(host) {
  if (!host) return '';
  const hostname = host.split(':')[0];

  // IPv4 check
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    return hostname;
  }

  const parts = hostname.split('.');
  if (parts.length <= 2) return hostname;

  const suf = endsWithMultiSuffix(hostname);
  if (suf) {
    const sufParts = suf.split('.').length;
    if (parts.length > sufParts) return parts.slice(-(sufParts + 1)).join('.');
    return hostname;
  }
  // Generic CN rule: *.com.cn / *.org.cn etc.
  const last = parts[parts.length - 1];
  const secondLast = parts[parts.length - 2];
  if (
    last === 'cn' &&
    ['com', 'net', 'org', 'gov', 'edu'].includes(secondLast) &&
    parts.length >= 3
  ) {
    return parts.slice(-3).join('.');
  }
  // Fallback to last two labels
  return parts.slice(-2).join('.');
}

// Storage Helpers
function storageGet(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}
function storageSet(obj) {
  return new Promise((resolve) => chrome.storage.local.set(obj, resolve));
}
function storageRemove(keys) {
  return new Promise((resolve) => chrome.storage.local.remove(keys, resolve));
}

async function getHistory(domain) {
  const res = await storageGet(`history:${domain}`);
  return res[`history:${domain}`] || null;
}

async function setHistory(domain, record) {
  await storageSet({ [`history:${domain}`]: record });
}

async function getNoteIndex(domain) {
  const res = await storageGet(`note-index:${domain}`);
  return res[`note-index:${domain}`] || [];
}

async function setNoteIndex(domain, ids) {
  await storageSet({ [`note-index:${domain}`]: ids });
}

async function getNote(noteId) {
  const res = await storageGet(`note:${noteId}`);
  return res[`note:${noteId}`] || null;
}

async function setNote(noteId, note) {
  await storageSet({ [`note:${noteId}`]: note });
}

async function removeNote(noteId) {
  await storageRemove(`note:${noteId}`);
}

// 访问记录（手动模式下不使用，移除以避免未使用告警）

async function sendVisitedStatus(tabId, domain) {
  try {
    const rec = await getHistory(domain);
    await chrome.tabs.sendMessage(tabId, {
      type: 'VISITED_STATUS',
      payload: {
        isVisited: !!rec,
        domain,
        lastVisit: rec?.lastVisit || null,
      },
    });
  } catch (e) {
    // 静默失败
  }
}

// History tree builder
async function getAllHistoryKeys() {
  const all = await storageGet(null);
  return Object.keys(all).filter((k) => k.startsWith('history:'));
}

async function getHistoryTree() {
  const keys = await getAllHistoryKeys();
  const records = [];
  const all = await storageGet(keys);
  keys.forEach((k) => {
    const rec = all[k];
    if (rec) records.push(rec);
  });
  const grouped = new Map();
  for (const rec of records) {
    const rd = rootDomain(rec.domain);
    if (!grouped.has(rd)) grouped.set(rd, []);
    grouped.get(rd).push(rec);
  }
  return Array.from(grouped.entries()).map(([rootDomainName, subdomains]) => ({
    rootDomain: rootDomainName,
    subdomains,
  }));
}

// Notes helpers
function generateNoteId() {
  return `note_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function addNote(domain, content) {
  const id = generateNoteId();
  const now = Date.now();
  const note = { id, domain, content, createdAt: now, updatedAt: now };
  await setNote(id, note);
  const idx = await getNoteIndex(domain);
  idx.push(id);
  await setNoteIndex(domain, idx);
  const hist = await getHistory(domain);
  if (hist && !hist.hasNotes) {
    await setHistory(domain, { ...hist, hasNotes: true });
  }
  return note;
}

async function getNotes(domain) {
  const ids = await getNoteIndex(domain);
  const notes = [];
  for (const id of ids) {
    const n = await getNote(id);
    if (n) notes.push(n);
  }
  // 根据时间倒序
  notes.sort((a, b) => b.updatedAt - a.updatedAt);
  return notes;
}

async function deleteNote(noteId) {
  const note = await getNote(noteId);
  if (!note) return false;
  const domain = note.domain;
  await removeNote(noteId);
  const idx = await getNoteIndex(domain);
  const newIdx = idx.filter((id) => id !== noteId);
  await setNoteIndex(domain, newIdx);
  if (newIdx.length === 0) {
    const hist = await getHistory(domain);
    if (hist && hist.hasNotes) await setHistory(domain, { ...hist, hasNotes: false });
  }
  return true;
}

async function clearAll() {
  const all = await storageGet(null);
  const keys = Object.keys(all).filter(
    (k) => k.startsWith('history:') || k.startsWith('note:') || k.startsWith('note-index:')
  );
  await storageRemove(keys);
}

async function clearHistory() {
  const all = await storageGet(null);
  const keys = Object.keys(all).filter((k) => k.startsWith('history:'));
  if (keys.length) await storageRemove(keys);
}

async function clearNotes() {
  const all = await storageGet(null);
  const noteKeys = Object.keys(all).filter((k) => k.startsWith('note:') || k.startsWith('note-index:'));
  if (noteKeys.length) await storageRemove(noteKeys);
  const historyKeys = Object.keys(all).filter((k) => k.startsWith('history:'));
  if (historyKeys.length) {
    const histData = await storageGet(historyKeys);
    const updates = {};
    for (const k of historyKeys) {
      const rec = histData[k];
      if (rec) updates[k] = { ...rec, hasNotes: false };
    }
    if (Object.keys(updates).length) await storageSet(updates);
  }
}

// Message router
// 消息处理函数表，降低路由器复杂度
async function batchDeleteDomains(domains) {
  const ops = [];
  for (const d of domains) {
    const idx = await getNoteIndex(d);
    for (const id of idx) ops.push(removeNote(id));
    ops.push(storageRemove(`note-index:${d}`));
    ops.push(storageRemove(`history:${d}`));
  }
  await Promise.all(ops);
}

const MessageHandlers = {
  CHECK_VISITED: async (payload, sender, sendResponse) => {
    const rec = await getHistory(payload.domain);
    sendResponse({ success: true, data: { isVisited: !!rec, ...rec } });
  },
  MARK_TESTED: async (payload, sender, sendResponse) => {
    const domain = payload.domain;
    if (!domain) {
      sendResponse({ success: false, error: 'domain required' });
      return;
    }
    if (shouldSkipToggle(domain)) {
      sendResponse({ success: true });
      return;
    }
    const url = payload.url || `https://${domain}`;
    const existing = await getHistory(domain);
    if (existing) {
      const updated = { ...existing, lastVisit: Date.now(), url };
      await setHistory(domain, updated);
      sendResponse({ success: true, data: updated });
    } else {
      const rec = defaultHistory(domain, url);
      await setHistory(domain, rec);
      sendResponse({ success: true, data: rec });
    }
    const tabId = sender?.tab?.id;
    if (tabId) await sendVisitedStatus(tabId, domain);
  },
  MARK_UNTESTED: async (payload, sender, sendResponse) => {
    const domain = payload.domain;
    if (!domain) {
      sendResponse({ success: false, error: 'domain required' });
      return;
    }
    if (shouldSkipToggle(domain)) {
      sendResponse({ success: true });
      return;
    }
    await storageRemove(`history:${domain}`);
    sendResponse({ success: true });
    const tabId = sender?.tab?.id;
    if (tabId) await sendVisitedStatus(tabId, domain);
  },
  GET_HISTORY: async (payload, sender, sendResponse) => {
    const rec = await getHistory(payload.domain);
    sendResponse({ success: true, data: rec });
  },
  GET_HISTORY_TREE: async (_payload, _sender, sendResponse) => {
    const tree = await getHistoryTree();
    sendResponse({ success: true, data: tree });
  },
  GET_NOTES: async (payload, _sender, sendResponse) => {
    const notes = await getNotes(payload.domain);
    sendResponse({ success: true, data: notes });
  },
  ADD_NOTE: async (payload, _sender, sendResponse) => {
    const note = await addNote(payload.domain, payload.content);
    sendResponse({ success: true, data: note });
  },
  DELETE_NOTE: async (payload, _sender, sendResponse) => {
    const ok = await deleteNote(payload.noteId);
    sendResponse({ success: ok });
  },
  BATCH_DELETE: async (payload, _sender, sendResponse) => {
    const domains = payload.domains || [];
    await batchDeleteDomains(domains);
    sendResponse({ success: true });
  },
  CLEAR_ALL: async (_payload, _sender, sendResponse) => {
    await clearAll();
    sendResponse({ success: true });
  },
  CLEAR_HISTORY: async (_payload, _sender, sendResponse) => {
    await clearHistory();
    sendResponse({ success: true });
  },
  CLEAR_NOTES: async (_payload, _sender, sendResponse) => {
    await clearNotes();
    sendResponse({ success: true });
  },
  FETCH_IMAGE_TO_DATA_URL: async (payload, _sender, sendResponse) => {
    try {
      const url = payload?.url || '';
      if (!url) {
        sendResponse({ success: false, error: 'url required' });
        return;
      }
      const res = await fetch(url, { mode: 'cors' });
      if (!res.ok) {
        sendResponse({ success: false, error: `fetch failed: ${res.status}` });
        return;
      }
      const blob = await res.blob();
      const reader = new FileReader();
      reader.onloadend = () => {
        try {
          const dataUrl = reader.result;
          sendResponse({ success: true, data: { dataUrl } });
        } catch (e) {
          sendResponse({ success: false, error: e?.message || 'read error' });
        }
      };
      reader.readAsDataURL(blob);
    } catch (e) {
      sendResponse({ success: false, error: e?.message || 'unhandled' });
    }
  },
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      const { type, payload = {} } = message || {};
      const handler = MessageHandlers[type];
      if (!handler) {
        sendResponse({ success: false, error: `Unknown message type: ${type}` });
        return;
      }
      await handler(payload, sender, sendResponse);
    } catch (e) {
      sendResponse({ success: false, error: e?.message || 'Unhandled error' });
    }
  })();
  return true;
});

// 自动记录已停用：手动模式由前端触发 MARK_TESTED / MARK_UNTESTED

// Keyboard command: save selection as note
async function handleSaveSelection(tab) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => (window.getSelection ? window.getSelection().toString() : ''),
  });
  const selectionText = (result && result.result) || '';
  if (!selectionText) return;
  const domain = extractDomain(tab.url);
  await addNote(domain, selectionText);
}

async function handleMarkTested(tab) {
  if (shouldExclude(tab.url)) return;
  const domain = extractDomain(tab.url);
  if (shouldSkipToggle(domain)) {
    await sendVisitedStatus(tab.id, domain);
    return;
  }
  const existing = await getHistory(domain);
  if (existing) {
    await storageRemove(`history:${domain}`);
  } else {
    await setHistory(domain, defaultHistory(domain, tab.url));
  }
  await sendVisitedStatus(tab.id, domain);
}

chrome.commands.onCommand.addListener(async (command) => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id || !tab.url) return;
    if (command === 'save-selection') {
      await handleSaveSelection(tab);
      return;
    }
    if (command === 'mark-tested') {
      await handleMarkTested(tab);
      return;
    }
  } catch (e) {
    // 静默失败
  }
});