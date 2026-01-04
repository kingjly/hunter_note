// Popup UI逻辑：历史树 / 笔记管理 / 设置

function el(id) {
  return document.getElementById(id);
}
function qs(sel) {
  return document.querySelector(sel);
}
function qsa(sel) {
  return document.querySelectorAll(sel);
}

function fmt(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const isExtension = typeof chrome !== 'undefined' && chrome?.runtime?.sendMessage;

function mockMessage(msg) {
  const { type } = msg || {};
  switch (type) {
    case 'GET_HISTORY_TREE':
      return {
        success: true,
        data: [
          {
            rootDomain: 'example.com',
            subdomains: [
              { domain: 'admin.example.com', visitCount: 3, lastVisit: Date.now() - 3600000 },
              { domain: 'api.example.com', visitCount: 1, lastVisit: Date.now() - 7200000 },
            ],
          },
        ],
      };
    case 'GET_NOTES':
      return { success: true, data: [] };
    case 'BATCH_DELETE':
    case 'CLEAR_ALL':
      return { success: true };
    default:
      return { success: true, data: [] };
  }
}

function sendMessage(msg) {
  if (!isExtension) return Promise.resolve(mockMessage(msg));
  return new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function mdToHtml(src) {
  let text = escapeHtml(src || '');
  text = text.replace(/```([\s\S]*?)```/g, (m, code) => `<pre><code>${code}</code></pre>`);
  text = text.replace(/^#{6}\s+(.*)$/gm, '<h6>$1</h6>');
  text = text.replace(/^#{5}\s+(.*)$/gm, '<h5>$1</h5>');
  text = text.replace(/^#{4}\s+(.*)$/gm, '<h4>$1</h4>');
  text = text.replace(/^#{3}\s+(.*)$/gm, '<h3>$1</h3>');
  text = text.replace(/^#{2}\s+(.*)$/gm, '<h2>$1</h2>');
  text = text.replace(/^#\s+(.*)$/gm, '<h1>$1</h1>');
  text = text.replace(/^\s*[-*+]\s+(.*)$/gm, '<ul><li>$1</li></ul>');
  text = text.replace(/<\/ul>\n<ul>/g, '');
  text = text.replace(/`([^`]+?)`/g, '<code>$1</code>');
  text = text.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\*(?!\*)([^*]+?)\*/g, '<em>$1</em>');
  text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2" />');
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  text = text.replace(/\n\n+/g, '<p></p>');
  text = text.replace(/\n/g, '<br>');
  return text;
}

// Tabs
qsa('.tab').forEach((t) => {
  t.addEventListener('click', () => {
    qsa('.tab').forEach((x) => {
      x.classList.remove('active');
      x.setAttribute('aria-selected', 'false');
    });
    qsa('.tab-panel').forEach((x) => x.classList.remove('active'));
    t.classList.add('active');
    t.setAttribute('aria-selected', 'true');
    qs(`#${t.dataset.tab}`).classList.add('active');
  });
});

// History Tree
function buildSubItems(group, query) {
  const sub = document.createElement('div');
  sub.className = 'sub';
  sub.classList.add('collapsed');
  const boxes = [];
  for (const rec of group.subdomains) {
    const dom = rec.domain.toLowerCase();
    const rootDom = group.rootDomain.toLowerCase();
    if (query && !dom.includes(query) && !rootDom.includes(query)) continue;
    const row = document.createElement('div');
    row.className = 'sub-item';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    boxes.push(cb);
    const label = document.createElement('div');
    label.textContent = rec.domain;
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = `访问${rec.visitCount}次 · 最后 ${fmt(rec.lastVisit)}`;
    row.appendChild(label);
    row.appendChild(meta);
    const actions = document.createElement('div');
    actions.className = 'actions';
    const boxWrap = document.createElement('div');
    boxWrap.appendChild(cb);
    actions.appendChild(boxWrap);
    row.appendChild(actions);
    sub.appendChild(row);
  }
  return { sub, boxes };
}

function createGroupElement(group, query) {
  const match = group.rootDomain.toLowerCase().includes(query);
  const subMatch = group.subdomains.some((s) => s.domain.toLowerCase().includes(query));
  if (query && !match && !subMatch) return null;
  const root = document.createElement('div');
  root.className = 'root';
  const rh = document.createElement('div');
  rh.className = 'root-header';
  const left = document.createElement('div');
  left.className = 'root-header-left';
  const toggle = document.createElement('button');
  toggle.className = 'toggle';
  toggle.textContent = '▸';
  toggle.setAttribute('aria-expanded', 'false');
  const title = document.createElement('strong');
  title.textContent = `${group.rootDomain}`;
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  left.appendChild(toggle);
  left.appendChild(checkbox);
  left.appendChild(title);
  rh.appendChild(left);
  const right = document.createElement('div');
  right.className = 'root-header-right';
  const count = document.createElement('span');
  count.className = 'badge';
  count.textContent = `${group.subdomains.length}`;
  right.appendChild(count);
  rh.appendChild(right);
  root.appendChild(rh);

  const { sub, boxes } = buildSubItems(group, query);
  checkbox.addEventListener('change', () => {
    boxes.forEach((b) => (b.checked = checkbox.checked));
  });
  const setExpanded = (expanded) => {
    sub.classList.toggle('collapsed', !expanded);
    toggle.textContent = expanded ? '▾' : '▸';
    toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  };
  const shouldExpand = () => sub.classList.contains('collapsed');
  toggle.addEventListener('click', () => setExpanded(shouldExpand()));
  title.addEventListener('click', () => setExpanded(shouldExpand()));
  if (query && (match || subMatch)) setExpanded(true);
  root.appendChild(sub);
  return root;
}

async function loadHistoryTree() {
  const resp = await sendMessage({ type: 'GET_HISTORY_TREE' });
  const tree = resp?.data || [];
  const query = el('search').value.trim().toLowerCase();
  const wrap = el('tree');
  wrap.innerHTML = '';
  for (const group of tree) {
    const elem = createGroupElement(group, query);
    if (elem) wrap.appendChild(elem);
  }
}

el('search').addEventListener('input', loadHistoryTree);
el('deleteSelected').addEventListener('click', async () => {
  const selectedDomains = [];
  qsa('.root').forEach((root) => {
    root.querySelectorAll('.sub-item').forEach((row) => {
      const dom = row.firstChild?.textContent || '';
      const cb = row.querySelector('input[type="checkbox"]');
      if (cb?.checked) selectedDomains.push(dom);
    });
  });
  if (selectedDomains.length === 0) return;
  if (!confirm(`确认删除 ${selectedDomains.length} 个子域的历史与笔记？`)) return;
  await sendMessage({ type: 'BATCH_DELETE', payload: { domains: selectedDomains } });
  loadHistoryTree();
});

el('clearHistory').addEventListener('click', async () => {
  if (!confirm('确认清空所有历史记录？此操作不可恢复。')) return;
  const resp = await sendMessage({ type: 'CLEAR_HISTORY' });
  if (resp?.success) {
    await loadHistoryTree();
    await loadStorageUsage();
  }
});

// Notes Tab (简化：展示所有域名的最近笔记)
async function loadAllNotes() {
  const resp = await sendMessage({ type: 'GET_HISTORY_TREE' });
  const tree = resp?.data || [];
  const list = el('notesList');
  list.innerHTML = '';
  
  // Collect all notes first to group them locally
  let allNotes = [];
  const query = (el('notesSearch')?.value || '').trim().toLowerCase();
  
  for (const group of tree) {
    for (const rec of group.subdomains) {
      const noteResp = await sendMessage({ type: 'GET_NOTES', payload: { domain: rec.domain } });
      const notes = noteResp?.data || [];
      
      for (const n of notes) {
        const domainLower = rec.domain.toLowerCase();
        const contentLower = (n.content || '').toLowerCase();
        if (query && !domainLower.includes(query) && !contentLower.includes(query)) continue;
        // Attach domain info if missing in note object (though usually it has it or we know it from loop)
        // background's GET_NOTES returns notes which usually have domain field. 
        // If not, we assign it.
        if (!n.domain) n.domain = rec.domain;
        allNotes.push(n);
      }
    }
  }

  // Group by domain
  const groups = {};
  allNotes.forEach(n => {
    if (!groups[n.domain]) groups[n.domain] = [];
    groups[n.domain].push(n);
  });

  // Render groups
  const sortedDomains = Object.keys(groups).sort();
  
  if (sortedDomains.length === 0) {
     list.innerHTML = '<div style="padding:16px; text-align:center; color:#9ca3af;">暂无笔记</div>';
     return;
  }

  sortedDomains.forEach(domain => {
    const groupNotes = groups[domain];
    
    // Group Header
    const groupHeader = document.createElement('div');
    groupHeader.className = 'group-header';
    // groupHeader.textContent = `${domain} (${groupNotes.length})`;
    groupHeader.style.padding = '8px';
    groupHeader.style.fontWeight = 'bold';
    groupHeader.style.background = '#f3f4f6';
    groupHeader.style.color = '#374151';
    groupHeader.style.fontSize = '13px';
    groupHeader.style.marginTop = '8px';
    groupHeader.style.borderRadius = '6px';
    groupHeader.style.border = '1px solid #e5e7eb';
    groupHeader.style.cursor = 'pointer';
    groupHeader.style.display = 'flex';
    groupHeader.style.justifyContent = 'space-between';
    groupHeader.style.alignItems = 'center';

    const headerTitle = document.createElement('span');
    headerTitle.textContent = `${domain} (${groupNotes.length})`;
    
    const toggleIcon = document.createElement('span');
    toggleIcon.textContent = '▼';
    toggleIcon.style.fontSize = '10px';
    toggleIcon.style.transition = 'transform 0.2s';

    groupHeader.appendChild(headerTitle);
    groupHeader.appendChild(toggleIcon);
    list.appendChild(groupHeader);

    const groupContainer = document.createElement('div');
    groupContainer.style.display = 'block';

    groupHeader.addEventListener('click', () => {
        const isHidden = groupContainer.style.display === 'none';
        groupContainer.style.display = isHidden ? 'block' : 'none';
        toggleIcon.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(-90deg)';
    });

    groupNotes.forEach(n => {
        const item = document.createElement('div');
        item.className = 'note-item';
        const body = document.createElement('div');
        body.className = 'note-body';
        
        // Removed title since grouped
        // const title = document.createElement('div');
        // title.className = 'note-title';
        // title.textContent = n.domain;
        
        const content = document.createElement('div');
        content.className = 'note-content';
        // 仅显示摘要，不渲染 Markdown
        const rawContent = n.content || '';
        // 简单的摘要提取：去除图片标签，截取前100字符
        const textOnly = rawContent.replace(/!\[.*?\]\(.*?\)/g, '[图片]').replace(/[#*`>]/g, '').trim();
        content.textContent = textOnly.slice(0, 100) + (textOnly.length > 100 ? '...' : '');
        content.title = '点击查看详情';
        content.style.cursor = 'pointer';
        content.addEventListener('click', () => {
          chrome.tabs.create({ url: `manager.html?id=${n.id}` });
        });

        const meta = document.createElement('div');
        meta.className = 'note-meta';
        meta.textContent = `更新：${fmt(n.updatedAt)}`;
        // body.appendChild(title);
        body.appendChild(content);
        body.appendChild(meta);
        const actions = document.createElement('div');
        actions.className = 'note-actions';
        const del = document.createElement('button');
        del.className = 'btn danger';
        del.textContent = '删除';
        del.addEventListener('click', async () => {
          await sendMessage({ type: 'DELETE_NOTE', payload: { noteId: n.id } });
          loadAllNotes();
        });

        const view = document.createElement('button');
        view.className = 'btn';
        view.textContent = '详情';
        view.style.marginRight = '8px';
        view.addEventListener('click', () => {
           chrome.tabs.create({ url: `manager.html?id=${n.id}` });
        });

        actions.appendChild(view);
        actions.appendChild(del);
        item.appendChild(body);
        item.appendChild(actions);
        groupContainer.appendChild(item);
    });
    list.appendChild(groupContainer);
  });
}

el('notesSearch').addEventListener('input', loadAllNotes);

el('clearNotes').addEventListener('click', async () => {
  if (!confirm('确认清空所有笔记？此操作不可恢复。')) return;
  const resp = await sendMessage({ type: 'CLEAR_NOTES' });
  if (resp?.success) {
    await loadAllNotes();
    await loadHistoryTree();
    await loadStorageUsage();
  }
});

// Add Open Manager Button
const managerBtn = document.createElement('button');
managerBtn.className = 'btn primary';
managerBtn.textContent = '打开完整管理器';
managerBtn.style.width = '100%';
managerBtn.style.marginBottom = '8px';
managerBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: 'manager.html' });
});
el('notes').insertBefore(managerBtn, el('notes').firstChild);

// Settings
async function loadStorageUsage() {
  if (isExtension) {
    const data = await new Promise((resolve) => chrome.storage.local.get(null, resolve));
    const json = JSON.stringify(data);
    const bytes = new TextEncoder().encode(json).length;
    const kb = (bytes / 1024).toFixed(2);
    el('storageUsage').textContent = `存储占用约 ${kb} KB`;
  } else {
    el('storageUsage').textContent = '预览环境（非扩展）';
  }
}

// Current domain actions
async function getCurrentTab() {
  if (!isExtension) return null;
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs && tabs[0] ? tabs[0] : null;
  } catch (e) {
    return null;
  }
}

async function getCurrentDomain() {
  const tab = await getCurrentTab();
  if (!tab || !tab.url) return null;
  try {
    return new URL(tab.url).host;
  } catch (e) {
    return null;
  }
}

async function updateCurrentDomainLabel() {
  const d = await getCurrentDomain();
  el('currentDomain').textContent = d ? `当前域：${d}` : '当前域：不可用（预览或无活动标签）';
}

el('markCurrent').addEventListener('click', async () => {
  if (!isExtension) {
    alert('仅在扩展环境可用');
    return;
  }
  const d = await getCurrentDomain();
  if (!d) return;
  const tab = await getCurrentTab();
  await sendMessage({
    type: 'MARK_TESTED',
    payload: { domain: d, url: tab?.url || `https://${d}` },
  });
  await loadHistoryTree();
  await updateCurrentDomainLabel();
});

el('unmarkCurrent').addEventListener('click', async () => {
  if (!isExtension) {
    alert('仅在扩展环境可用');
    return;
  }
  const d = await getCurrentDomain();
  if (!d) return;
  await sendMessage({ type: 'MARK_UNTESTED', payload: { domain: d } });
  await loadHistoryTree();
  await updateCurrentDomainLabel();
});

el('clearAll').addEventListener('click', async () => {
  if (!confirm('再次确认：这将删除所有历史记录和笔记！')) return;
  const resp = await sendMessage({ type: 'CLEAR_ALL' });
  if (resp?.success) {
    await loadHistoryTree();
    await loadAllNotes();
    await loadStorageUsage();
  }
});

// Theme Logic
async function initTheme() {
  if (!isExtension) return;
  const { theme } = await chrome.storage.local.get('theme');
  applyTheme(theme || 'light');
}

function applyTheme(theme) {
  const sun = el('iconSun');
  const moon = el('iconMoon');
  if (theme === 'dark') {
    document.body.classList.add('dark');
    if (sun) sun.style.display = 'block';
    if (moon) moon.style.display = 'none';
  } else {
    document.body.classList.remove('dark');
    if (sun) sun.style.display = 'none';
    if (moon) moon.style.display = 'block';
  }
}

if (el('themeToggle')) {
  el('themeToggle').addEventListener('click', async () => {
    const isDark = document.body.classList.contains('dark');
    const newTheme = isDark ? 'light' : 'dark';
    applyTheme(newTheme);
    if (isExtension) {
      await chrome.storage.local.set({ theme: newTheme });
    }
  });
}

// Init
(async () => {
  await initTheme();
  await loadHistoryTree();
  await loadAllNotes();
  await loadStorageUsage();
  await updateCurrentDomainLabel();
})();