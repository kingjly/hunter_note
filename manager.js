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

function htmlToMdFromNode(node) {
  if (!node) return '';
  const t = node.nodeType;
  if (t === Node.TEXT_NODE) return node.textContent || '';
  if (t !== Node.ELEMENT_NODE) return '';
  const tag = node.tagName.toLowerCase();
  const inner = Array.from(node.childNodes).map(htmlToMdFromNode).join('');
  if (tag === 'br') return '\n';
  if (tag === 'strong' || tag === 'b') return `**${inner}**`;
  if (tag === 'em' || tag === 'i') return `*${inner}*`;
  if (tag === 'code' && node.parentElement && node.parentElement.tagName.toLowerCase() === 'pre') return inner;
  if (tag === 'code') return `\`${inner}\``;
  if (tag === 'a') {
    const href = node.getAttribute('href') || '';
    return `[${inner}](${href})`;
  }
  if (tag === 'img') {
    const src = node.getAttribute('src') || '';
    const alt = node.getAttribute('alt') || '';
    return `![${alt}](${src})`;
  }
  if (tag === 'h1') return `# ${inner}\n`;
  if (tag === 'h2') return `## ${inner}\n`;
  if (tag === 'h3') return `### ${inner}\n`;
  if (tag === 'h4') return `#### ${inner}\n`;
  if (tag === 'h5') return `##### ${inner}\n`;
  if (tag === 'h6') return `###### ${inner}\n`;
  if (tag === 'pre') return `\n\`\`\`\n${inner.trim()}\n\`\`\`\n`;
  if (tag === 'p' || tag === 'div') return `${inner}\n`;
  if (tag === 'ul') return Array.from(node.children).map((li) => `- ${htmlToMdFromNode(li)}`).join('\n') + '\n';
  if (tag === 'ol') return Array.from(node.children).map((li, i) => `${i + 1}. ${htmlToMdFromNode(li)}`).join('\n') + '\n';
  if (tag === 'li') return inner;
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

function renderList(notes) {
  const list = el('noteList');
  list.innerHTML = '';
  const query = el('searchInput').value.trim().toLowerCase();

  // Group notes by domain
  const groups = {};
  notes.forEach(n => {
    if (query && !n.domain.toLowerCase().includes(query) && !(n.content || '').toLowerCase().includes(query)) return;
    if (!groups[n.domain]) groups[n.domain] = [];
    groups[n.domain].push(n);
  });

  // Render groups
  Object.keys(groups).sort().forEach(domain => {
    const groupNotes = groups[domain];
    if (groupNotes.length === 0) return;

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
    headerTitle.textContent = `${domain} (${groupNotes.length})`;
    
    const toggleIcon = document.createElement('span');
    toggleIcon.textContent = '▼';
    toggleIcon.style.fontSize = '10px';
    toggleIcon.style.transition = 'transform 0.2s';

    groupHeader.appendChild(headerTitle);
    groupHeader.appendChild(toggleIcon);
    list.appendChild(groupHeader);

    const groupContainer = document.createElement('div');
    groupContainer.className = 'group-container';
    groupContainer.style.display = 'block'; // Default expanded

    groupHeader.addEventListener('click', () => {
        const isHidden = groupContainer.style.display === 'none';
        groupContainer.style.display = isHidden ? 'block' : 'none';
        toggleIcon.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(-90deg)';
    });

    groupNotes.forEach((n) => {
      const item = document.createElement('div');
      item.className = `note-item ${currentNote && currentNote.id === n.id ? 'active' : ''}`;
      item.dataset.id = n.id;
      
      // Removed domain title from item since it's grouped
      // const title = document.createElement('div');
      // title.className = 'note-item-title';
      // title.textContent = n.domain;

      const summary = document.createElement('div');
      summary.className = 'note-item-summary';
      const raw = n.content || '';
      const textOnly = raw.replace(/!\[.*?\]\(.*?\)/g, '[图片]').replace(/[#*`>]/g, '').trim();
      summary.textContent = textOnly || '（无内容）';

      const meta = document.createElement('div');
      meta.className = 'note-item-meta';
      meta.textContent = fmt(n.updatedAt);

      // item.appendChild(title);
      item.appendChild(summary);
      item.appendChild(meta);

      item.addEventListener('click', (e) => {
        e.stopPropagation();
        selectNote(n);
      });
      groupContainer.appendChild(item);
    });
    list.appendChild(groupContainer);
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
editorEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
    // Delay logic to ensure we are processing the correct state if needed, 
    // but here we want to intercept BEFORE the break.
    // The problem with previous code: textBefore usually contains whole previous text
    // but if contenteditable uses <div> or <br>, we need to handle it.
    
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    
    // Get text of the current line (block)
    // Find the closest block element or if it's text node, find its parent
    let block = range.startContainer;
    if (block.nodeType === 3) block = block.parentNode;
    
    // If block is the editor itself, we might be in a text node directly
    // Check previous siblings for newlines? 
    // Actually, simpler approach: get textContent of the current block if it is a DIV/P/LI
    // If it is the editor itself, we fallback to scanning back.
    
    let currentLineText = '';
    if (block !== editorEl && (block.tagName === 'DIV' || block.tagName === 'P' || block.tagName === 'LI')) {
       currentLineText = block.textContent;
    } else {
       // We are in a text node inside editor, scan back to \n
       const preRange = range.cloneRange();
       preRange.selectNodeContents(editorEl);
       preRange.setEnd(range.endContainer, range.endOffset);
       const fullText = preRange.toString();
       const lastNl = fullText.lastIndexOf('\n');
       currentLineText = lastNl === -1 ? fullText : fullText.substring(lastNl + 1);
    }

    // If we are at the start of a line (offset 0) or text is selected? 
    // We assume cursor is at end of text usually for "Enter" to mean "continue list"
    // But user might press enter in middle. 
    // Let's stick to "prefix match" logic.

    const ulMatch = currentLineText.match(/^(\s*)([-*+])(\s+)(.*)$/);
    const olMatch = currentLineText.match(/^(\s*)(\d+)(\.\s+)(.*)$/);
    const taskMatch = currentLineText.match(/^(\s*)(-\s*\[[ x]\])(\s+)(.*)$/);

    let toInsert = null;
    let isEmptyLine = false; // If current line is just the bullet

    if (taskMatch) {
      if (!taskMatch[4].trim()) isEmptyLine = true;
      else toInsert = '\n' + taskMatch[1] + '- [ ] ';
    } else if (olMatch) {
      if (!olMatch[4].trim()) isEmptyLine = true;
      else {
        const num = parseInt(olMatch[2], 10);
        toInsert = '\n' + olMatch[1] + (num + 1) + olMatch[3];
      }
    } else if (ulMatch) {
      if (!ulMatch[4].trim()) isEmptyLine = true;
      else toInsert = '\n' + ulMatch[1] + ulMatch[2] + ulMatch[3];
    }

    if (isEmptyLine) {
        // User pressed Enter on an empty bullet line -> Break out of list
        // We want to remove the bullet from current line and just have a newline
        // But default Enter might keep the bullet or just add new line?
        // Easiest: Prevent default, manually clear current line text (or just the bullet part)
        // Since managing range deletion is tricky, let's try:
        // If we preventDefault, we must handle the newline logic manually.
        // Wait, if it is empty line, we just want to stop list.
        // So we should probably just clear the current line's bullet content.
        // But simply returning here lets default Enter happen, which creates a NEW line with potential garbage?
        // Actually, if we return, standard behavior happens (new line).
        // The user wants "Exit list". 
        // Let's leave standard behavior for empty line for now to avoid breaking things, 
        // or implement "Delete current line's bullet" logic.
        // Given "user input: 自动接续没实现", priority is making connection work.
        // The issue is likely `currentLinePrefix` calculation was wrong due to DOM structure.
        return;
    }

    if (toInsert) {
      e.preventDefault();
      document.execCommand('insertText', false, toInsert);
      // Scroll to view?
      editorEl.blur(); editorEl.focus(); // Hack to ensure scroll sometimes
    }
  }
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
