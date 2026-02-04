// Content Script: 悬浮球 + 详情面板（样式隔离，遵循视觉与交互规则）

(function () {
  const ACCENT = '#2563eb';
  const TEXT = '#1f2937';
  const FLOAT_STATE_KEY = 'float-state';
  let domainCache = '';
  try {
    domainCache = window.location.host || '';
  } catch (e) {
    void 0;
  }

  // Shadow root for style isolation
  const host = document.createElement('div');
  host.id = 'bbt-host';
  host.style.all = 'initial';
  host.style.position = 'fixed';
  host.style.bottom = '16px';
  host.style.right = '16px';
  host.style.zIndex = '2147483647';
  document.documentElement.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = `
    :host { all: initial; font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; }
    *, *:before, *:after { box-sizing: border-box; }

    .float {
      width: 48px; height: 48px; border-radius: 24px;
      background: ${ACCENT}; color: white; display: flex; align-items: center; justify-content: center;
      box-shadow: 0 8px 24px rgba(0,0,0,0.18);
      cursor: grab; user-select: none; font-weight: 600; touch-action: none;
      outline: none; border: none;
      transition: transform .15s ease, box-shadow .15s ease;
    }
    .float.dragging { cursor: grabbing; }
    .float.tested { background: #16a34a; } /* 绿色：已测试 */
    .float.untested { background: #3b82f6; } /* 蓝色：未测试 */
    .float:hover { transform: translateY(-1px); box-shadow: 0 10px 28px rgba(0,0,0,0.22); }
    .float:active { transform: translateY(0); box-shadow: 0 6px 18px rgba(0,0,0,0.16); }

    .panel {
      position: fixed; right: 16px; bottom: 72px; width: 800px; max-width: 90vw; max-height: 80vh; overflow: auto;
      background: #f8fafc; color: ${TEXT}; border-radius: 16px; box-shadow: 0 20px 40px -12px rgba(0,0,0,0.15);
      border: 1px solid #e2e8f0;
      font-size: 14px; line-height: 1.5;
      padding: 20px; display: none;
    }
    .panel.visible { display: block; }
    .panel-header { margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid #e2e8f0; }
    .domain-row { display:flex; align-items:center; justify-content:space-between; gap:12px; }
    .domain-info { flex: 1; min-width: 0; }
    .domain { font-weight:700; font-size: 16px; color:#111827; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .last-visit { font-size: 12px; color: #9ca3af; margin-top: 2px; }
    
    .status-chip { display:inline-flex; align-items:center; height:28px; padding:0 12px; border-radius:14px; font-size: 13px; font-weight:600; border:1px solid transparent; }
    .status-chip.tested { background:#ecfdf5; color:#059669; }
    .status-chip.untested { background:#e5e7eb; color:#4b5563; }
    
    .action-row { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 8px; margin-bottom: 16px; }
    .btn { height: 36px; border-radius: 8px; border: 1px solid #cbd5e1;
      background: #ffffff; color: #4b5563; cursor: pointer; font-size: 13px; font-weight: 500;
      transition: all 0.15s ease; white-space: nowrap; display: flex; align-items: center; justify-content: center; 
      box-shadow: 0 1px 2px rgba(0,0,0,0.05);
    }
    .btn:hover { background: #f1f5f9; border-color: #94a3b8; color: #111827; }
    .btn.primary { background: #2563eb; color: white; border-color: transparent; box-shadow: 0 1px 2px rgba(37,99,235,0.1); }
    .btn.primary:hover { background: #1d4ed8; box-shadow: 0 4px 12px rgba(37,99,235,0.2); }
    .btn:focus-visible { outline:none; box-shadow:0 0 0 3px rgba(37,99,235,0.35); }
    
    .note-editor-wrap { margin-bottom: 16px; border: 1px solid #cbd5e1; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 2px rgba(0,0,0,0.05); background: #fff; }
    .note-split { display: grid; grid-template-columns: 1fr 1fr; min-height: 300px; border-bottom: 1px solid #e2e8f0; }
    .editor { width: 100%; height: 300px; overflow-y: auto; border: none; border-radius: 0; background: #fff; padding: 16px; outline: none; font-size: 14px; line-height: 1.6; white-space: pre-wrap; }
    .preview { width: 100%; height: 300px; overflow-y: auto; background: #f8fafc; border-left: 1px solid #e2e8f0; border-radius: 0; padding: 16px; }
    
    /* Force plain text look in editor even if rich text is pasted */
    .editor * { font-weight: normal !important; font-size: 14px !important; color: #334155 !important; margin: 0 !important; }
    
    .editor:empty:before { content: attr(data-placeholder); color:#94a3b8; }
    .editor img, .preview img { max-width: 100%; height: auto; border-radius: 4px; }
    
    /* Dark Mode */
    .panel.dark { background: #111827; color: #f9fafb; border-color: #374151; }
    .panel.dark .panel-header { border-bottom-color: #374151; }
    .panel.dark .domain { color: #f9fafb; }
    .panel.dark .status-chip.untested { background: #374151; color: #9ca3af; }
    .panel.dark .btn { background: #374151; border-color: #4b5563; color: #e5e7eb; }
    .panel.dark .btn:hover { background: #4b5563; border-color: #6b7280; }
    .panel.dark .btn.primary { background: #2563eb; color: white; border-color: transparent; }
    .panel.dark .btn.primary:hover { background: #1d4ed8; }
    .panel.dark .note-editor-wrap { background: #1f2937; border-color: #374151; }
    .panel.dark .note-split { border-bottom-color: #374151; }
    .panel.dark .editor { background: #1f2937; color: #e5e7eb; white-space: pre-wrap; }
    .panel.dark .preview { background: #111827; border-left-color: #374151; color: #e5e7eb; }
    .panel.dark .item { background: #1f2937; border-color: #374151; }
    .panel.dark .item:hover { border-color: #4b5563; }
    .panel.dark .item-header { background: #1f2937; }
    .panel.dark .item.expanded .item-header { background: #111827; border-bottom-color: #374151; }
    .panel.dark .note-title { color: #f9fafb; }
    .panel.dark .item-summary { color: #9ca3af; }
    .panel.dark .item-detail { background: #1f2937; color: #e5e7eb; }
    .panel.dark .item-actions { border-top-color: #374151; }
    .panel.dark .editor * { color: #e5e7eb !important; }
    .panel.dark .preview pre { background: #111827; border-color: #374151; }
    .panel.dark .preview code { background: #111827; border-color: #374151; }
    .panel.dark .item-detail pre { background: #111827; border-color: #374151; }
    .panel.dark { scrollbar-color: #4b5563 #111827; }
    .panel.dark ::-webkit-scrollbar { width: 10px; height: 10px; }
    .panel.dark ::-webkit-scrollbar-track { background: #111827; }
    .panel.dark ::-webkit-scrollbar-thumb { background: #4b5563; border-radius: 6px; border: 2px solid #111827; }
    .panel.dark ::-webkit-scrollbar-thumb:hover { background: #6b7280; }
    
    .preview h1, .preview h2, .preview h3 { margin: 0 0 8px; font-size: 1.1em; }
    .preview p { margin: 0 0 8px; }
    .preview ul { margin: 0 0 8px; padding-left: 20px; }
    .preview pre { background:#f1f5f9; padding:8px; border-radius:6px; overflow:auto; font-size: 12px; border: 1px solid #e2e8f0; }
    .preview code { background:#f1f5f9; padding:0 3px; border-radius:4px; border: 1px solid #e2e8f0; }
    .preview pre code { background: transparent; padding: 0; border: none; }
    
    .list { margin-top: 16px; display: flex; flex-direction: column; gap: 12px; }
    .item { display: flex; flex-direction: column; padding: 0; border: 1px solid #cbd5e1; border-radius: 12px; background: #fff; transition: all 0.2s; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
    .item:hover { border-color: #94a3b8; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06); }
    
    .item-header { padding: 12px 16px 4px 16px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; user-select: none; background: #fff; }
      .item.expanded .item-header { background: #f8fafc; border-bottom: 1px solid #e2e8f0; padding-bottom: 12px; }
      
      .header-left { display: flex; flex-direction: row; align-items: center; gap: 8px; flex: 1; min-width: 0; margin-right: 12px; }
    .note-title { font-weight: 600; font-size: 14px; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 70%; }
    .note-time { font-size: 11px; color: #94a3b8; white-space: nowrap; flex-shrink: 0; }
      
      .item-summary { flex: 1; font-size: 14px; color: #334155; margin: 0; padding: 0 16px 12px 16px;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .item.expanded .item-summary { display: none; }
      
      .item-toggle { width: 16px; height: 16px; display: flex; align-items: center; justify-content: center;
        color: #94a3b8; transition: transform 0.2s; border-radius: 4px; font-size: 10px; }
    .item:hover .item-toggle { background: #f1f5f9; color: #475569; }
    .item.expanded .item-toggle { transform: rotate(90deg); background: transparent; }
    
    .item-detail { display: none; padding: 16px; font-size: 13px; line-height: 1.6; color: #334155; background: #fff; }
    .item.expanded .item-detail { display: block; }
    .item-detail img { max-width: 100%; height: auto; border-radius: 4px; margin: 8px 0; box-shadow: 0 1px 3px rgba(0,0,0,0.1); border: 1px solid #e2e8f0; }
    .item-detail h1, .item-detail h2, .item-detail h3 { font-size: 1.1em; font-weight: 600; margin: 12px 0 6px; color: #1e293b; }
    .item-detail pre { background: #f8fafc; padding: 12px; border-radius: 6px; overflow: auto; font-size: 12px; margin: 8px 0; border: 1px solid #e2e8f0; }
    .item-actions { display: flex; justify-content: flex-end; margin-top: 12px; pt: 12px; border-top: 1px solid #f1f5f9; }
    .panel.dark #noteActions { background: #1f2937 !important; border-top-color: #374151 !important; }
    
    .toast { position: absolute; right: 16px; top: 16px; background: #1e293bcc; color: #fff; padding: 8px 12px; border-radius: 8px; font-size: 13px; max-width: 80%; z-index: 10; backdrop-filter: blur(4px); box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
    .toast.error { background: #ef4444cc; }
    .toast.success { background: #10b981cc; }

    /* Markdown Context Menu */
    .md-menu { position: fixed; min-width: 220px; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; box-shadow: 0 10px 25px rgba(0,0,0,0.15); padding: 8px; z-index: 2147483647; display: none; font-family: system-ui, -apple-system, sans-serif; }
    .md-menu .group { padding: 4px 8px; font-size: 11px; color: #94a3b8; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 4px; }
    .md-menu .menu-opt { padding: 6px 10px; border-radius: 4px; cursor: pointer; font-size: 13px; color: #374151; display: flex; align-items: center; transition: all 0.15s; margin-bottom: 2px; background: rgba(0,0,0,0.02); }
    .md-menu .menu-opt:hover { background: #f3f4f6; color: #111827; }
    .md-menu .row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; padding: 0; margin-bottom: 6px; }
    .md-menu .row.cols-3 { grid-template-columns: repeat(3, 1fr); }
    .md-menu .row.cols-2 { grid-template-columns: repeat(2, 1fr); }
    .md-menu .row .menu-opt { justify-content: center; padding: 6px 2px; margin: 0; text-align: center; font-size: 12px; font-weight: 500; background: rgba(0,0,0,0.03); border: 1px solid transparent; }
    .md-menu .row .menu-opt:hover { background: #e5e7eb; border-color: #d1d5db; color: #111827; }
    
    .md-menu.dark { background: #1f2937; border-color: #374151; box-shadow: 0 10px 25px rgba(0,0,0,0.3); }
    .md-menu.dark .group { color: #9ca3af; }
    .md-menu.dark .menu-opt { background: rgba(255,255,255,0.03); color: #e5e7eb; }
    .md-menu.dark .menu-opt:hover { background: #374151; color: #fff; }
    .md-menu.dark .row .menu-opt { background: rgba(255,255,255,0.05); border-color: transparent; }
    .md-menu.dark .row .menu-opt:hover { background: #4b5563; border-color: #6b7280; }
  `;
  shadow.appendChild(style);

  const float = document.createElement('button');
  float.className = 'float';
  float.title = 'BugBounty Tracker（拖动移动，右键隐藏，Ctrl+Shift+H 显示/隐藏）';
  float.textContent = '未测';
  shadow.appendChild(float);

  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.innerHTML = `
    <div class="panel-header">
      <div class="domain-row">
        <div class="domain-info">
          <div id="domain" class="domain"></div>
          <div class="last-visit" id="last"></div>
        </div>
        <div id="status" class="status-chip">未测试</div>
      </div>
    </div>
    <div class="action-row">
      <button class="btn" id="toggleTestBtn">标记状态</button>
      <button class="btn" id="toggleNoteInputBtn">新建笔记</button>
      <button class="btn" id="refreshBtn">刷新</button>
      <button class="btn" id="closeBtn">关闭</button>
    </div>
    <div class="note-editor-wrap" id="noteRow" style="display:none;">
      <div class="note-split">
        <div id="noteEditor" class="editor" contenteditable="true" data-placeholder="支持Markdown，粘贴/拖拽图片自动嵌入"></div>
        <div class="preview" id="notePreview"></div>
      </div>
      <div class="row" id="noteActions" style="display:flex; padding: 12px; border-top: 1px solid #f3f4f6; background: #f9fafb; justify-content: flex-end; gap: 8px;">
        <button class="btn" id="togglePreviewBtn">关闭预览</button>
        <button class="btn" id="insertImageBtn">插入图片</button>
        <button class="btn primary" id="addNoteBtn">保存笔记</button>
      </div>
    </div>
    <div class="list" id="noteList"></div>
  `;
  shadow.appendChild(panel);

  let floatHidden = false;
  let ignoreClick = false;
  let dragActive = false;
  let dragMoved = false;
  let dragStart = null;

  function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
  }

  function setFloatHidden(hidden) {
    floatHidden = hidden;
    host.style.display = hidden ? 'none' : 'block';
    if (hidden) setPanelVisible(false);
  }

  function positionPanel() {
    if (!panel.classList.contains('visible')) return;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    const margin = 8;
    const floatRect = float.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    let left = floatRect.right - panelRect.width;
    let top = floatRect.top - panelRect.height - 12;
    if (left < margin) left = margin;
    if (left + panelRect.width > window.innerWidth - margin) {
      left = window.innerWidth - margin - panelRect.width;
    }
    if (top < margin) top = floatRect.bottom + 12;
    if (top + panelRect.height > window.innerHeight - margin) {
      top = window.innerHeight - margin - panelRect.height;
    }
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  }

  function setFloatPosition(left, top) {
    host.style.left = `${left}px`;
    host.style.top = `${top}px`;
    host.style.right = 'auto';
    host.style.bottom = 'auto';
  }

  async function loadFloatState() {
    try {
      const res = await chrome.storage.local.get(FLOAT_STATE_KEY);
      const state = res[FLOAT_STATE_KEY] || {};
      if (typeof state.hidden === 'boolean') setFloatHidden(state.hidden);
      if (typeof state.x === 'number' && typeof state.y === 'number') {
        const margin = 8;
        const w = float.offsetWidth || 48;
        const h = float.offsetHeight || 48;
        const left = clamp(state.x, margin, window.innerWidth - w - margin);
        const top = clamp(state.y, margin, window.innerHeight - h - margin);
        setFloatPosition(left, top);
      }
    } catch (e) {
      void 0;
    }
  }

  async function saveFloatState() {
    try {
      const rect = host.getBoundingClientRect();
      await chrome.storage.local.set({
        [FLOAT_STATE_KEY]: {
          hidden: floatHidden,
          x: rect.left,
          y: rect.top,
        },
      });
    } catch (e) {
      void 0;
    }
  }

  // Markdown Context Menu for Editor
  const mdMenu = document.createElement('div');
  mdMenu.className = 'md-menu';
  let savedRange = null;
  
  const menuItems = [
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
    const root = el.getRootNode ? el.getRootNode() : el.ownerDocument;
    const sel = (root.getSelection ? root.getSelection() : el.ownerDocument.getSelection());
    
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
    const g1 = document.createElement('div'); g1.className = 'group'; g1.textContent = 'Markdown'; mdMenu.appendChild(g1);
    
    menuItems.forEach((it) => {
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
            const ed = shadow.getElementById('noteEditor');
            insertMdText(ed, sub.prefix, sub.suffix, sub.placeholder || '');
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
          const ed = shadow.getElementById('noteEditor');
          insertMdText(ed, it.prefix, it.suffix, it.placeholder || '');
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
    mdMenu.classList.toggle('dark', panel.classList.contains('dark'));
    
    // Save selection
    const el = shadow.getElementById('noteEditor');
    const root = el.getRootNode ? el.getRootNode() : el.ownerDocument;
    const sel = (root.getSelection ? root.getSelection() : el.ownerDocument.getSelection());
    if (sel.rangeCount > 0) {
      savedRange = sel.getRangeAt(0).cloneRange();
    }
  }
  function hideMdMenu() { mdMenu.style.display = 'none'; }
  buildMdMenu();
  shadow.appendChild(mdMenu);

  function setPanelVisible(v) {
    panel.classList.toggle('visible', v);
    if (v) positionPanel();
  }

  function fmt(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  async function sendMessage(msg) {
    return new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));
  }

  let isTested = false;
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
    pre: (_n, inner) => `\n\`\`\`\n${inner}\n\`\`\`\n`,
    p: (_n, inner) => `\n${inner}\n`,
    div: (_n, inner) => `\n${inner}\n`,
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
  function updatePreview() {
    const src = htmlToMd(shadow.getElementById('noteEditor'));
    shadow.getElementById('notePreview').innerHTML = mdToHtml(src);
  }

  function setDomainHeader(hist) {
    shadow.getElementById('domain').textContent = domainCache;
    shadow.getElementById('last').textContent = hist?.lastVisit ? `最后访问：${fmt(hist.lastVisit)}` : '';
  }
  function extractNoteTitle(content) {
    const h1Match = content.match(/^#\s+(.*)$/m);
    if (!h1Match) return { title: '无标题', content };
    return { title: h1Match[1].trim(), content: content.replace(h1Match[0], '').trim() };
  }
  function noteSummaryText(content) {
    return content.replace(/!\[.*?\]\(.*?\)/g, '[图片]').replace(/[#*`>]/g, '').trim() || '（无内容）';
  }
  function createNoteHeader(title, updatedAt) {
    const header = document.createElement('div');
    header.className = 'item-header';
    const headerLeft = document.createElement('div');
    headerLeft.className = 'header-left';
    if (title) {
      const titleEl = document.createElement('div');
      titleEl.className = 'note-title';
      titleEl.textContent = title;
      headerLeft.appendChild(titleEl);
    }
    const timeEl = document.createElement('div');
    timeEl.className = 'note-time';
    timeEl.textContent = fmt(updatedAt);
    headerLeft.appendChild(timeEl);
    const toggle = document.createElement('div');
    toggle.className = 'item-toggle';
    toggle.textContent = '▶';
    header.appendChild(headerLeft);
    header.appendChild(toggle);
    return { header, headerLeft };
  }
  function createNoteDetail(content) {
    const detail = document.createElement('div');
    detail.className = 'item-detail';
    detail.innerHTML = mdToHtml(content);
    return detail;
  }
  function createNoteActions(noteId, onRefresh) {
    const actions = document.createElement('div');
    actions.className = 'item-actions';
    const del = document.createElement('button');
    del.className = 'btn';
    del.textContent = '删除';
    del.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('确认删除此笔记？')) return;
      await sendMessage({ type: 'DELETE_NOTE', payload: { noteId } });
      onRefresh();
    });
    actions.appendChild(del);
    return actions;
  }
  function createNoteItem(note, onRefresh) {
    const item = document.createElement('div');
    item.className = 'item';
    const extracted = extractNoteTitle(note.content || '');
    const summaryText = noteSummaryText(extracted.content);
    const { header } = createNoteHeader(extracted.title, note.updatedAt);
    const summary = document.createElement('div');
    summary.className = 'item-summary';
    summary.textContent = summaryText;
    const detail = createNoteDetail(extracted.content);
    detail.appendChild(createNoteActions(note.id, onRefresh));
    const toggleFn = () => {
      const isExpanded = item.classList.contains('expanded');
      item.classList.toggle('expanded', !isExpanded);
    };
    header.addEventListener('click', toggleFn);
    summary.addEventListener('click', toggleFn);
    item.appendChild(header);
    item.appendChild(summary);
    item.appendChild(detail);
    return item;
  }
  async function refresh() {
    if (!domainCache) return;
    await checkStatus();
    const h = await sendMessage({ type: 'GET_HISTORY', payload: { domain: domainCache } });
    const n = await sendMessage({ type: 'GET_NOTES', payload: { domain: domainCache } });
    const hist = h?.data || null;
    const notes = n?.data || [];
    setDomainHeader(hist);
    const list = shadow.getElementById('noteList');
    list.innerHTML = '';
    notes.forEach((note) => {
      list.appendChild(createNoteItem(note, refresh));
    });
  }

  float.addEventListener('click', () => {
    if (ignoreClick) return;
    setPanelVisible(!panel.classList.contains('visible'));
    if (panel.classList.contains('visible')) refresh();
  });

  float.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    setFloatHidden(true);
    saveFloatState();
  });

  float.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || floatHidden) return;
    dragActive = true;
    dragMoved = false;
    float.classList.add('dragging');
    const rect = host.getBoundingClientRect();
    dragStart = { x: e.clientX, y: e.clientY, left: rect.left, top: rect.top };
    float.setPointerCapture(e.pointerId);
  });

  window.addEventListener('pointermove', (e) => {
    if (!dragActive || !dragStart) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    if (!dragMoved && Math.abs(dx) + Math.abs(dy) > 3) dragMoved = true;
    const margin = 8;
    const w = float.offsetWidth || 48;
    const h = float.offsetHeight || 48;
    const left = clamp(dragStart.left + dx, margin, window.innerWidth - w - margin);
    const top = clamp(dragStart.top + dy, margin, window.innerHeight - h - margin);
    setFloatPosition(left, top);
    if (panel.classList.contains('visible')) positionPanel();
  });

  window.addEventListener('pointerup', () => {
    if (!dragActive) return;
    dragActive = false;
    float.classList.remove('dragging');
    if (dragMoved) {
      ignoreClick = true;
      saveFloatState();
      setTimeout(() => {
        ignoreClick = false;
      }, 0);
    }
  });

  window.addEventListener('keydown', (e) => {
    const key = (e.key || '').toLowerCase();
    if (e.ctrlKey && e.shiftKey && key === 'h') {
      setFloatHidden(!floatHidden);
      saveFloatState();
    }
  });

  window.addEventListener('resize', () => {
    if (floatHidden) return;
    const rect = host.getBoundingClientRect();
    const margin = 8;
    const w = float.offsetWidth || 48;
    const h = float.offsetHeight || 48;
    const left = clamp(rect.left, margin, window.innerWidth - w - margin);
    const top = clamp(rect.top, margin, window.innerHeight - h - margin);
    setFloatPosition(left, top);
    if (panel.classList.contains('visible')) positionPanel();
  });

  async function checkStatus() {
    const resp = await sendMessage({ type: 'CHECK_VISITED', payload: { domain: domainCache } });
    isTested = !!resp?.data?.isVisited;
    const statusEl = shadow.getElementById('status');
    statusEl.textContent = isTested ? '测试状态：已测试' : '测试状态：未测试';
    statusEl.classList.toggle('tested', isTested);
    statusEl.classList.toggle('untested', !isTested);
    const tBtn = shadow.getElementById('toggleTestBtn');
    tBtn.textContent = isTested ? '取消已测试标记' : '标记为已测试';
    // 更新悬浮图标颜色
    float.classList.toggle('tested', isTested);
    float.classList.toggle('untested', !isTested);
    float.textContent = isTested ? '已测' : '未测';
  }

  shadow.getElementById('toggleNoteInputBtn').addEventListener('click', () => {
    const row = shadow.getElementById('noteRow');
    const actions = shadow.getElementById('noteActions');
    const visible = row.style.display !== 'none';
    row.style.display = visible ? 'none' : 'block';
    actions.style.display = visible ? 'none' : 'flex';
    shadow.getElementById('toggleNoteInputBtn').textContent = visible ? '新建笔记' : '收起笔记';
    updatePreview();
  });

  shadow.getElementById('togglePreviewBtn').style.display = 'none'; // Hide toggle button in split view
  /*
  shadow.getElementById('togglePreviewBtn').addEventListener('click', () => {
    // ...
  });
  */

  shadow.getElementById('noteEditor').addEventListener('input', () => {
    updatePreview();
  });
  
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
  shadow.getElementById('noteEditor').addEventListener('keydown', (e) => {
    if (!isListEnterEvent(e)) return;
    const editorEl = shadow.getElementById('noteEditor');
    const lineText = getCurrentLineText(editorEl);
    if (!lineText) return;
    const next = getListContinuation(lineText);
    if (!next || next.isEmpty || !next.toInsert) return;
    e.preventDefault();
    document.execCommand('insertText', false, next.toInsert);
  });

  // Context menu trigger
  shadow.getElementById('noteEditor').addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const rect = panel.getBoundingClientRect();
    const x = Math.min(e.clientX, rect.right - 200);
    const y = Math.min(e.clientY, rect.bottom - 220);
    showMdMenu(x, y);
  });
  shadow.addEventListener('click', (e) => {
    const t = e.target;
    if (!t) return;
    const menu = shadow.querySelector('.md-menu');
    if (!menu) return;
    if (menu.style.display === 'block' && !menu.contains(t)) hideMdMenu();
  });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideMdMenu(); });

  shadow.getElementById('noteEditor').addEventListener('beforeinput', (e) => {
    if (e.inputType === 'insertFromPaste') {
      ensureSelectionAtEnd(shadow.getElementById('noteEditor'));
    }
  }, true);

  function isPasteShortcut(e) {
    return (e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V');
  }
  function readFileAsDataUrl(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result || '');
      reader.readAsDataURL(file);
    });
  }
  async function readImageFromClipboardApi() {
    if (!navigator.clipboard || !navigator.clipboard.read) return '';
    const items = await navigator.clipboard.read();
    for (const it of items) {
      const type = it.types.find((t) => t.startsWith('image/'));
      if (!type) continue;
      const blob = await it.getType(type);
      if (!blob || blob.size === 0) continue;
      return await readFileAsDataUrl(blob);
    }
    return '';
  }
  function insertImageToEditor(editorEl, dataUrl) {
    if (!dataUrl) return;
    insertAtCursorContentEditable(editorEl, `<img src="${dataUrl}" />`);
    updatePreview();
  }
  shadow.getElementById('noteEditor').addEventListener('keydown', async (e) => {
    if (!isPasteShortcut(e)) return;
    try {
      const dataUrl = await readImageFromClipboardApi();
      if (!dataUrl) return;
      e.preventDefault();
      insertImageToEditor(shadow.getElementById('noteEditor'), dataUrl);
    } catch (err) {
      void 0;
    }
  }, true);

  function insertAtCursorContentEditable(el, html) {
    el.focus();
    const root = el.getRootNode ? el.getRootNode() : el.ownerDocument;
    const sel = (root.getSelection ? root.getSelection() : el.ownerDocument.getSelection());
    if (!sel || sel.rangeCount === 0 || (sel.anchorNode && !el.contains(sel.anchorNode))) {
      const rangeInit = el.ownerDocument.createRange();
      rangeInit.selectNodeContents(el);
      rangeInit.collapse(false);
      sel.removeAllRanges();
      sel.addRange(rangeInit);
    }
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

  function ensureSelectionAtEnd(el) {
    const root = el.getRootNode ? el.getRootNode() : el.ownerDocument;
    const sel = (root.getSelection ? root.getSelection() : el.ownerDocument.getSelection());
    if (!sel || sel.rangeCount === 0 || (sel.anchorNode && !el.contains(sel.anchorNode))) {
      el.focus();
      const rangeInit = el.ownerDocument.createRange();
      rangeInit.selectNodeContents(el);
      rangeInit.collapse(false);
      sel.removeAllRanges();
      sel.addRange(rangeInit);
    }
    return sel;
  }

  async function pasteImageFromClipboardItem(cd, editorEl, e) {
    const items = cd && cd.items ? Array.from(cd.items) : [];
    const imgItem = items.find((it) => it.type && it.type.startsWith('image/'));
    if (!imgItem || typeof imgItem.getAsFile !== 'function') return false;
    const file = imgItem.getAsFile();
    if (!file) return false;
    e.preventDefault();
    const dataUrl = await readFileAsDataUrl(file);
    insertImageToEditor(editorEl, dataUrl);
    return true;
  }
  async function pasteImageFromClipboardFiles(cd, editorEl, e) {
    const files = cd && cd.files ? Array.from(cd.files) : [];
    const fileImg = files.find((f) => f.type && f.type.startsWith('image/'));
    if (!fileImg) return false;
    e.preventDefault();
    const dataUrl = await readFileAsDataUrl(fileImg);
    insertImageToEditor(editorEl, dataUrl);
    return true;
  }
  async function pasteImageFromClipboardApi(editorEl, e) {
    try {
      const dataUrl = await readImageFromClipboardApi();
      if (!dataUrl) return false;
      e.preventDefault();
      insertImageToEditor(editorEl, dataUrl);
      return true;
    } catch (err) {
      void 0;
    }
    return false;
  }
  async function pasteImageFromHtml(cd, editorEl, e) {
    const html = cd && typeof cd.getData === 'function' ? cd.getData('text/html') : '';
    if (!html) return false;
    const m = html.match(/<img[^>]*src=["']([^"'>]+)["'][^>]*>/i);
    if (!m || !m[1]) return false;
    e.preventDefault();
    const src = m[1];
    if (src.startsWith('data:')) {
      insertImageToEditor(editorEl, src);
      return true;
    }
    const r = await sendMessage({ type: 'FETCH_IMAGE_TO_DATA_URL', payload: { url: src } });
    const dataUrl = r?.data?.dataUrl || '';
    insertImageToEditor(editorEl, dataUrl);
    return true;
  }
  async function onPasteInEditor(e) {
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    const editorEl = shadow.getElementById('noteEditor');
    const cd = e.clipboardData;
    if (await pasteImageFromClipboardItem(cd, editorEl, e)) return;
    if (await pasteImageFromClipboardFiles(cd, editorEl, e)) return;
    if (await pasteImageFromClipboardApi(editorEl, e)) return;
    await pasteImageFromHtml(cd, editorEl, e);
  }
  shadow.getElementById('noteEditor').addEventListener('paste', onPasteInEditor, true);

  panel.addEventListener('paste', (e) => {
    const target = e.target;
    if (!target || target === shadow.getElementById('noteEditor')) return;
    onPasteInEditor(e);
  }, true);

  // 插入图片按钮与文件选择兜底
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.style.display = 'none';
  shadow.appendChild(fileInput);
  shadow.getElementById('insertImageBtn').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const f = fileInput.files && fileInput.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      insertAtCursorContentEditable(shadow.getElementById('noteEditor'), `<img src="${reader.result}" />`);
      updatePreview();
      fileInput.value = '';
    };
    reader.readAsDataURL(f);
  });

  shadow.getElementById('noteEditor').addEventListener('dragover', (e) => {
    e.preventDefault();
  });
  shadow.getElementById('noteEditor').addEventListener('drop', (e) => {
    e.preventDefault();
    const files = e.dataTransfer && e.dataTransfer.files ? Array.from(e.dataTransfer.files) : [];
    files.forEach((file) => {
      if (!file.type || !file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result;
        const ed = shadow.getElementById('noteEditor');
        insertAtCursorContentEditable(ed, `<img alt="拖拽图片" src="${dataUrl}" />`);
        updatePreview();
      };
      reader.readAsDataURL(file);
    });
  });

  shadow.getElementById('addNoteBtn').addEventListener('click', async () => {
    const md = htmlToMd(shadow.getElementById('noteEditor'));
    if (!md || !domainCache) return;
    await sendMessage({ type: 'ADD_NOTE', payload: { domain: domainCache, content: md } });
    shadow.getElementById('noteEditor').innerHTML = '';
    shadow.getElementById('noteRow').style.display = 'none';
    shadow.getElementById('noteActions').style.display = 'none';
    shadow.getElementById('toggleNoteInputBtn').textContent = '新建笔记';
    shadow.getElementById('notePreview').style.display = 'none';
    refresh();
  });
  shadow.getElementById('refreshBtn').addEventListener('click', refresh);
  shadow.getElementById('closeBtn').addEventListener('click', () => setPanelVisible(false));

  shadow.getElementById('toggleTestBtn').addEventListener('click', async () => {
    if (!domainCache) return;
    if (isTested) {
      await sendMessage({ type: 'MARK_UNTESTED', payload: { domain: domainCache } });
    } else {
      await sendMessage({
        type: 'MARK_TESTED',
        payload: { domain: domainCache, url: window.location.href },
      });
    }
    await refresh();
  });

  // 手动模式不依赖后台推送消息，浮球始终可见
  // 初始化时根据当前域状态更新悬浮图标颜色
  (async () => {
    try {
      await loadFloatState();
      if (domainCache) await checkStatus();
    } catch (e) {
      void 0;
    }
  })();

  // 快捷键后备监听：Ctrl+B 快速标记为已测试（避免与站点编辑冲突，仅在非可编辑区域触发）
  function isEditableTarget(t) {
    const tag = t && t.tagName ? t.tagName.toLowerCase() : '';
    return !!(t && (t.isContentEditable || tag === 'input' || tag === 'textarea'));
  }

  async function toggleCurrentDomain() {
    if (!domainCache) return;
    if (isTested) {
      await sendMessage({ type: 'MARK_UNTESTED', payload: { domain: domainCache } });
    } else {
      await sendMessage({
        type: 'MARK_TESTED',
        payload: { domain: domainCache, url: window.location.href },
      });
    }
    await checkStatus();
  }

  window.addEventListener('keydown', async (e) => {
    try {
      const key = (e.key || '').toLowerCase();
      if (!e.ctrlKey || key !== 'b') return;
      if (isEditableTarget(e.target)) return;
      await toggleCurrentDomain();
    } catch (err) {
      void 0;
    }
  });

  // 监听后台推送的访问状态，收到后即时更新浮球颜色与文案
  function applyVisitedStatus(payload) {
    if (!payload || payload.domain !== domainCache) return;
    isTested = !!payload.isVisited;
    const statusEl = shadow.getElementById('status');
    statusEl.textContent = isTested ? '测试状态：已测试' : '测试状态：未测试';
    statusEl.classList.toggle('tested', isTested);
    statusEl.classList.toggle('untested', !isTested);
    const tBtn = shadow.getElementById('toggleTestBtn');
    tBtn.textContent = isTested ? '取消已测试标记' : '标记为已测试';
    shadow.getElementById('last').textContent = payload.lastVisit ? `最后访问：${fmt(payload.lastVisit)}` : '';
    float.classList.toggle('tested', isTested);
    float.classList.toggle('untested', !isTested);
    float.textContent = isTested ? '已测' : '未测';
  }
  function applyFloatHiddenMessage(payload) {
    if (typeof payload?.hidden !== 'boolean') return;
    setFloatHidden(payload.hidden);
    saveFloatState();
  }
  function handleRuntimeMessage(message) {
    const { type, payload } = message || {};
    if (type === 'SET_FLOAT_HIDDEN') {
      applyFloatHiddenMessage(payload);
      return;
    }
    if (type !== 'VISITED_STATUS') return;
    applyVisitedStatus(payload);
  }
  try {
    chrome.runtime.onMessage.addListener((message) => {
      try {
        handleRuntimeMessage(message);
      } catch (err) {
        void 0;
      }
    });
  } catch (err) {
    void 0;
  }

  // Theme Logic
  async function initTheme() {
    try {
      const { theme } = await chrome.storage.local.get('theme');
      applyTheme(theme || 'light');
    } catch (e) {
      void 0;
    }
  }

  function applyTheme(theme) {
    if (theme === 'dark') {
      panel.classList.add('dark');
    } else {
      panel.classList.remove('dark');
    }
  }

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.theme) {
      applyTheme(changes.theme.newValue);
    }
    if (changes[FLOAT_STATE_KEY]) {
      const hidden = changes[FLOAT_STATE_KEY].newValue?.hidden;
      if (typeof hidden === 'boolean') setFloatHidden(hidden);
    }
  });
  
  initTheme();

})();
