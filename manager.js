// Manager Logic

// --- Helpers (Duplicate from content.js/popup.js to avoid module complexity) ---
function fmt(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function mdToHtml(src) {
  let text = escapeHtml(src || '');
  text = text.replace(/```([\s\S]*?)```/g, (m, code) => `<pre><code>${code.trim()}</code></pre>`);
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
  
  // Temporarily hide pre blocks to avoid br replacement
  const preBlocks = [];
  text = text.replace(/<pre><code>[\s\S]*?<\/code><\/pre>/g, (m) => {
      preBlocks.push(m);
      return `__PRE_BLOCK_${preBlocks.length - 1}__`;
  });

  text = text.replace(/\n\n+/g, '<p></p>');
  text = text.replace(/\n/g, '<br>');
  
  // Restore pre blocks
  text = text.replace(/__PRE_BLOCK_(\d+)__/g, (m, idx) => preBlocks[idx]);

  return text;
}

function mdToEditorHtml(src) {
  if (!src) return '';
  const placeholders = [];
  let idx = 0;
  const replaced = String(src).replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) => {
    const key = `__IMG_${idx++}__`;
    const a = escapeHtml(alt);
    const u = escapeHtml(url);
    placeholders.push({ key, html: `<img alt="${a}" src="${u}" />` });
    return key;
  });
  let text = escapeHtml(replaced);
  text = text.replace(/\n/g, '<br>');
  for (const p of placeholders) {
    const re = new RegExp(p.key.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g');
    text = text.replace(re, p.html);
  }
  return text;
}

function isPreCode(node) {
  const parent = node.parentElement;
  return parent && parent.tagName && parent.tagName.toLowerCase() === 'pre';
}
function listToMd(node, ordered) {
  const items = Array.from(node.children).map((li, idx) => {
    const prefix = ordered ? `${idx + 1}. ` : '- ';
    return `${prefix}${htmlToMdFromNode(li)}`;
  });
  return items.join('\n') + '\n';
}
const mdTagHandlers = {
  br: () => '\n',
  strong: (_n, inner) => `**${inner}**`,
  b: (_n, inner) => `**${inner}**`,
  em: (_n, inner) => `*${inner}*`,
  i: (_n, inner) => `*${inner}*`,
  code: (node, inner) => (isPreCode(node) ? inner : `\`${inner}\``),
  a: (node, inner) => `[${inner}](${node.getAttribute('href') || ''})`,
  img: (node) => `![${node.getAttribute('alt') || ''}](${node.getAttribute('src') || ''})`,
  h1: (_n, inner) => `# ${inner}\n`,
  h2: (_n, inner) => `## ${inner}\n`,
  h3: (_n, inner) => `### ${inner}\n`,
  h4: (_n, inner) => `#### ${inner}\n`,
  h5: (_n, inner) => `##### ${inner}\n`,
  h6: (_n, inner) => `###### ${inner}\n`,
  pre: (_n, inner) => `\n\`\`\`\n${inner.trim()}\n\`\`\`\n`,
  p: (_n, inner) => `${inner}\n`,
  div: (_n, inner) => `${inner}\n`,
  ul: (node) => listToMd(node, false),
  ol: (node) => listToMd(node, true),
  li: (_n, inner) => inner,
};
function htmlToMdFromNode(node) {
  if (!node) return '';
  if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const tag = node.tagName.toLowerCase();
  const inner = Array.from(node.childNodes).map(htmlToMdFromNode).join('');
  const handler = mdTagHandlers[tag];
  if (handler) return handler(node, inner);
  return inner;
}

function htmlToMd(rootEl) {
  const md = Array.from(rootEl.childNodes).map(htmlToMdFromNode).join('');
  return md.trim();
}

// --- State ---
let allNotes = [];
let currentNote = null;

// --- Elements ---
const el = (id) => document.getElementById(id);

// --- Logic ---

async function fetchAllNotes() {
  // Need to traverse history tree or just scan all notes
  // Background has no 'GET_ALL_NOTES' but 'GET_HISTORY_TREE' + 'GET_NOTES' per domain
  // Or we can scan storage directly since we are in extension page
  const all = await chrome.storage.local.get(null);
  const notes = [];
  Object.keys(all).forEach((k) => {
    if (k.startsWith('note:') && !k.startsWith('note-index:')) {
      notes.push(all[k]);
    }
  });
  notes.sort((a, b) => b.updatedAt - a.updatedAt);
  return notes;
}

function noteMatchesQuery(note, query) {
  if (!query) return true;
  const domainMatch = note.domain.toLowerCase().includes(query);
  const contentMatch = (note.content || '').toLowerCase().includes(query);
  return domainMatch || contentMatch;
}
function groupNotesByDomain(notes, query) {
  const groups = {};
  notes.forEach((n) => {
    if (!noteMatchesQuery(n, query)) return;
    if (!groups[n.domain]) groups[n.domain] = [];
    groups[n.domain].push(n);
  });
  return groups;
}
function createGroupHeader(domain, count) {
  const groupHeader = document.createElement('div');
  groupHeader.className = 'group-header';
  groupHeader.style.padding = '8px 12px';
  groupHeader.style.fontWeight = 'bold';
  groupHeader.style.background = '#e5e7eb';
  groupHeader.style.color = '#374151';
  groupHeader.style.fontSize = '13px';
  groupHeader.style.marginTop = '8px';
  groupHeader.style.borderRadius = '6px';
  groupHeader.style.cursor = 'pointer';
  groupHeader.style.display = 'flex';
  groupHeader.style.justifyContent = 'space-between';
  groupHeader.style.alignItems = 'center';

  const headerTitle = document.createElement('span');
  headerTitle.textContent = `${domain} (${count})`;

  const toggleIcon = document.createElement('span');
  toggleIcon.textContent = '▼';
  toggleIcon.style.fontSize = '10px';
  toggleIcon.style.transition = 'transform 0.2s';

  groupHeader.appendChild(headerTitle);
  groupHeader.appendChild(toggleIcon);

  return { groupHeader, toggleIcon };
}
function createGroupContainer() {
  const groupContainer = document.createElement('div');
  groupContainer.className = 'group-container';
  groupContainer.style.display = 'block';
  return groupContainer;
}
function noteSummaryText(note) {
  const raw = note.content || '';
  return raw.replace(/!\[.*?\]\(.*?\)/g, '[图片]').replace(/[#*`>]/g, '').trim();
}
function createNoteItem(note) {
  const item = document.createElement('div');
  item.className = `note-item ${currentNote && currentNote.id === note.id ? 'active' : ''}`;
  item.dataset.id = note.id;

  const summary = document.createElement('div');
  summary.className = 'note-item-summary';
  const textOnly = noteSummaryText(note);
  summary.textContent = textOnly || '（无内容）';

  const meta = document.createElement('div');
  meta.className = 'note-item-meta';
  meta.textContent = fmt(note.updatedAt);

  item.appendChild(summary);
  item.appendChild(meta);

  item.addEventListener('click', (e) => {
    e.stopPropagation();
    selectNote(note);
  });

  return item;
}
function renderGroup(list, domain, groupNotes) {
  const { groupHeader, toggleIcon } = createGroupHeader(domain, groupNotes.length);
  const groupContainer = createGroupContainer();

  groupHeader.addEventListener('click', () => {
    const isHidden = groupContainer.style.display === 'none';
    groupContainer.style.display = isHidden ? 'block' : 'none';
    toggleIcon.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(-90deg)';
  });

  groupNotes.forEach((n) => {
    groupContainer.appendChild(createNoteItem(n));
  });

  list.appendChild(groupHeader);
  list.appendChild(groupContainer);
}

function renderList(notes) {
  const list = el('noteList');
  list.innerHTML = '';
  const query = el('searchInput').value.trim().toLowerCase();
  const groups = groupNotesByDomain(notes, query);
  Object.keys(groups).sort().forEach((domain) => {
    const groupNotes = groups[domain];
    if (!groupNotes.length) return;
    renderGroup(list, domain, groupNotes);
  });
}

function selectNote(note) {
  currentNote = note;
  
  // Update UI active state without re-rendering entire list
  const allItems = document.querySelectorAll('.note-item');
  allItems.forEach(it => {
    if (it.dataset.id === note.id) {
      it.classList.add('active');
    } else {
      it.classList.remove('active');
    }
  });
  
  el('emptyState').style.display = 'none';
  el('editorContainer').style.display = 'flex';

  el('domainTitle').textContent = note.domain;
  el('timeMeta').textContent = `最后更新: ${fmt(note.updatedAt)}`;
  el('saveStatus').textContent = '';

  const editor = el('noteEditor');
  editor.innerHTML = mdToEditorHtml(note.content || '');
  
  updatePreview();
}

function updatePreview() {
  const md = htmlToMd(el('noteEditor'));
  el('notePreview').innerHTML = mdToHtml(md);
}

// Save
el('saveBtn').addEventListener('click', async () => {
  if (!currentNote) return;
  el('saveStatus').textContent = '保存中...';
  const md = htmlToMd(el('noteEditor'));
  
  // Update storage
  const updated = { ...currentNote, content: md, updatedAt: Date.now() };
  await chrome.storage.local.set({ [`note:${currentNote.id}`]: updated });
  
  // Update index if needed? Index is by domain, ID didn't change.
  // But we need to refresh list metadata
  currentNote = updated;
  
  // Reload list
  allNotes = await fetchAllNotes();
  renderList(allNotes);
  
  el('timeMeta').textContent = `最后更新: ${fmt(updated.updatedAt)}`;
  el('saveStatus').textContent = '已保存';
  setTimeout(() => el('saveStatus').textContent = '', 2000);
});

// Delete
el('deleteBtn').addEventListener('click', async () => {
  if (!currentNote) return;
  if (!confirm('确定要删除这条笔记吗？')) return;
  
  // We need to remove from note-index too.
  // Reuse background logic via message or duplicate it?
  // Duplicate for speed since we have direct storage access
  const noteId = currentNote.id;
  const domain = currentNote.domain;
  
  await chrome.storage.local.remove(`note:${noteId}`);
  
  const res = await chrome.storage.local.get(`note-index:${domain}`);
  let idx = res[`note-index:${domain}`] || [];
  idx = idx.filter(id => id !== noteId);
  await chrome.storage.local.set({ [`note-index:${domain}`]: idx });
  
  // Update history hasNotes if empty
  if (idx.length === 0) {
     const hRes = await chrome.storage.local.get(`history:${domain}`);
     const hist = hRes[`history:${domain}`];
     if (hist) {
       hist.hasNotes = false;
       await chrome.storage.local.set({ [`history:${domain}`]: hist });
     }
  }

  currentNote = null;
  el('emptyState').style.display = 'flex';
  el('editorContainer').style.display = 'none';
  
  allNotes = await fetchAllNotes();
  renderList(allNotes);
});

// Search
el('searchInput').addEventListener('input', () => {
  renderList(allNotes);
});

// Editor Events
const editorEl = el('noteEditor');
editorEl.addEventListener('input', updatePreview);
function isListEnterEvent(e) {
  return e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey;
}
function getEditorSelection(editorEl) {
  const root = editorEl.getRootNode ? editorEl.getRootNode() : editorEl.ownerDocument;
  const sel = root.getSelection ? root.getSelection() : editorEl.ownerDocument.getSelection();
  if (!sel || !sel.rangeCount) return null;
  return sel;
}
function getCurrentLineText(editorEl) {
  const sel = getEditorSelection(editorEl);
  if (!sel) return '';
  const range = sel.getRangeAt(0);
  const preCaretRange = range.cloneRange();
  preCaretRange.selectNodeContents(editorEl);
  preCaretRange.setEnd(range.endContainer, range.endOffset);
  const textBefore = preCaretRange.toString();
  const lastNewLine = textBefore.lastIndexOf('\n');
  return lastNewLine === -1 ? textBefore : textBefore.substring(lastNewLine + 1);
}
function getListContinuation(lineText) {
  const taskMatch = lineText.match(/^(\s*)(-\s*\[[ x]\])(\s+)(.*)$/);
  if (taskMatch) {
    if (!taskMatch[4].trim()) return { isEmpty: true, toInsert: '' };
    return { isEmpty: false, toInsert: `\n${taskMatch[1]}- [ ] ` };
  }
  const olMatch = lineText.match(/^(\s*)(\d+)(\.\s+)(.*)$/);
  if (olMatch) {
    if (!olMatch[4].trim()) return { isEmpty: true, toInsert: '' };
    const num = parseInt(olMatch[2], 10);
    return { isEmpty: false, toInsert: `\n${olMatch[1]}${num + 1}${olMatch[3]}` };
  }
  const ulMatch = lineText.match(/^(\s*)([-*+])(\s+)(.*)$/);
  if (ulMatch) {
    if (!ulMatch[4].trim()) return { isEmpty: true, toInsert: '' };
    return { isEmpty: false, toInsert: `\n${ulMatch[1]}${ulMatch[2]}${ulMatch[3]}` };
  }
  return null;
}
editorEl.addEventListener('keydown', (e) => {
  if (!isListEnterEvent(e)) return;
  const lineText = getCurrentLineText(editorEl);
  if (!lineText) return;
  const next = getListContinuation(lineText);
  if (!next || next.isEmpty || !next.toInsert) return;
  e.preventDefault();
  document.execCommand('insertText', false, next.toInsert);
  editorEl.blur();
  editorEl.focus();
});

// Paste Image Logic (Reuse from content.js)
function insertAtCursorContentEditable(el, html) {
  el.focus();
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  range.deleteContents();
  const temp = document.createElement('div');
  temp.innerHTML = html;
  const frag = document.createDocumentFragment();
  while (temp.firstChild) frag.appendChild(temp.firstChild);
  range.insertNode(frag);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

editorEl.addEventListener('paste', async (e) => {
  // Handle images
  const items = e.clipboardData && e.clipboardData.items ? Array.from(e.clipboardData.items) : [];
  const imgItem = items.find((it) => it.type && it.type.startsWith('image/'));
  if (imgItem) {
    e.preventDefault();
    const blob = imgItem.getAsFile();
    const reader = new FileReader();
    reader.onload = () => {
      insertAtCursorContentEditable(editorEl, `<img src="${reader.result}" />`);
      updatePreview();
    };
    reader.readAsDataURL(blob);
    return;
  }
  
  // Handle text/html img tags (remote images) -> Convert to dataURL via background
  const html = e.clipboardData.getData('text/html');
  if (html) {
      const m = html.match(/<img[^>]*src=["']([^"'>]+)["'][^>]*>/i);
      if (m && m[1]) {
        const src = m[1];
        if (!src.startsWith('data:')) {
           e.preventDefault();
           // Call background to fetch
           chrome.runtime.sendMessage({ type: 'FETCH_IMAGE_TO_DATA_URL', payload: { url: src } }, (resp) => {
             if (resp && resp.success && resp.data.dataUrl) {
               insertAtCursorContentEditable(editorEl, `<img src="${resp.data.dataUrl}" />`);
               updatePreview();
             } else {
               // Fallback
               insertAtCursorContentEditable(editorEl, `<img src="${src}" />`);
               updatePreview();
             }
           });
           return;
        }
      }
  }
});

// Drag and Drop Images
editorEl.addEventListener('dragover', (e) => {
  e.preventDefault();
});
editorEl.addEventListener('drop', (e) => {
  e.preventDefault();
  const files = e.dataTransfer && e.dataTransfer.files ? Array.from(e.dataTransfer.files) : [];
  files.forEach((file) => {
    if (!file.type || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      insertAtCursorContentEditable(editorEl, `<img src="${dataUrl}" />`);
      updatePreview();
    };
    reader.readAsDataURL(file);
  });
});

// Markdown Context Menu
const mdMenu = document.createElement('div');
mdMenu.className = 'md-menu';
let savedRange = null;

const mdItems = [
  { 
    row: true,
    items: [
      { label: 'H1', prefix: '# ', suffix: '' },
      { label: 'H2', prefix: '## ', suffix: '' },
      { label: 'H3', prefix: '### ', suffix: '' },
      { label: 'H4', prefix: '#### ', suffix: '' }
    ]
  },
  {
    row: true,
    items: [
      { label: '粗体', prefix: '**', suffix: '**', placeholder: '加粗文本' },
      { label: '斜体', prefix: '*', suffix: '*', placeholder: '斜体文本' },
      { label: '删除线', prefix: '~~', suffix: '~~', placeholder: '删除文本' },
      { label: '行内代码', prefix: '`', suffix: '`', placeholder: 'code' }
    ]
  },
  {
    row: true,
    items: [
      { label: '无序', prefix: '- ', suffix: '', placeholder: '项目' },
      { label: '有序', prefix: '1. ', suffix: '', placeholder: '项目' },
      { label: '复选', prefix: '- [ ] ', suffix: '', placeholder: '任务' },
      { label: '引用', prefix: '> ', suffix: '', placeholder: '引用文本' }
    ]
  },
  {
    row: true,
    items: [
      { label: '代码块', prefix: '\n```\n', suffix: '\n```\n', placeholder: '代码' },
      { label: '链接', prefix: '[', suffix: '](https://)', placeholder: '文本' },
      { label: '图片', prefix: '![', suffix: '](https://)', placeholder: 'alt' },
      { label: '分割线', prefix: '\n---\n', suffix: '', placeholder: '' }
    ]
  }
];

function insertMdText(el, prefix, suffix, placeholder) {
  el.focus();
  const sel = window.getSelection();
  if (savedRange) {
    sel.removeAllRanges();
    sel.addRange(savedRange);
  }
  const content = sel.toString();
  const text = content || placeholder;
  const full = prefix + text + suffix;
  document.execCommand('insertText', false, full);
}

function buildMdMenu() {
  mdMenu.innerHTML = '';
  const g = document.createElement('div'); g.className = 'group'; g.textContent = 'Markdown'; mdMenu.appendChild(g);
  mdItems.forEach((it) => {
      if (it.row) {
      const r = document.createElement('div');
      r.className = 'row';
      if (it.items.length === 3) r.classList.add('cols-3');
      if (it.items.length === 2) r.classList.add('cols-2');
      it.items.forEach(sub => {
          const d = document.createElement('div');
          d.className = 'menu-opt';
          d.textContent = sub.label;
          d.addEventListener('click', () => {
            insertMdText(editorEl, sub.prefix, sub.suffix, sub.placeholder || '');
            hideMdMenu();
            updatePreview();
          });
          r.appendChild(d);
        });
        mdMenu.appendChild(r);
      } else {
        const d = document.createElement('div');
        d.className = 'menu-opt';
        d.textContent = it.label;
        d.addEventListener('click', () => {
          insertMdText(editorEl, it.prefix, it.suffix, it.placeholder || '');
          hideMdMenu();
          updatePreview();
        });
        mdMenu.appendChild(d);
      }
    });
}
function showMdMenu(x, y) {
  mdMenu.style.left = `${x}px`;
  mdMenu.style.top = `${y}px`;
  mdMenu.style.display = 'block';
  const sel = window.getSelection();
  if (sel.rangeCount > 0) {
    savedRange = sel.getRangeAt(0).cloneRange();
  }
}
function hideMdMenu() { mdMenu.style.display = 'none'; }
buildMdMenu();
document.body.appendChild(mdMenu);
editorEl.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const rect = editorEl.getBoundingClientRect();
  const x = Math.min(e.clientX, rect.right - 200);
  const y = Math.min(e.clientY, rect.bottom - 220);
  showMdMenu(x, y);
});
document.addEventListener('click', (e) => { if (mdMenu.style.display === 'block' && !mdMenu.contains(e.target)) hideMdMenu(); });
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideMdMenu(); });

// Theme Logic
chrome.storage.onChanged.addListener((changes) => {
  if (changes.theme) {
    const newTheme = changes.theme.newValue;
    if (newTheme === 'dark') document.body.classList.add('dark');
    else document.body.classList.remove('dark');
  }
});

async function initTheme() {
  const { theme } = await chrome.storage.local.get('theme');
  if (theme === 'dark') {
    document.body.classList.add('dark');
  } else {
    document.body.classList.remove('dark');
  }
}

// Init
(async () => {
  await initTheme();
  allNotes = await fetchAllNotes();
  renderList(allNotes);
  
  // Handle ?id= param
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  if (id) {
    const target = allNotes.find(n => n.id === id);
    if (target) selectNote(target);
  }
})();
