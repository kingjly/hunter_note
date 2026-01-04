# Hunter Note (BugBounty Tracker)

[中文说明](./README.md)

![manifest](https://img.shields.io/badge/Chrome%20Extension-MV3-blue)
![stars](https://img.shields.io/github/stars/kingjly/hunter_note?style=flat)
![issues](https://img.shields.io/github/issues/kingjly/hunter_note?style=flat)
![last-commit](https://img.shields.io/github/last-commit/kingjly/hunter_note?style=flat)

A browser extension for bug bounty / security testing workflows. It turns “did I already test this domain?” into a searchable timeline, plus quick Markdown notes you can write right on the page.

## 🎯 Real-World Scenarios

- **Re-testing and you forgot what you did last time**: revisit the target site, open the bottom-right panel, and immediately see the domain’s history and your previous notes. Less “reconstruct the workflow”, more “continue the workflow”.
- **Notes scattered across folders and files**: no need to manually maintain a domain/subdomain/path directory structure. The domain becomes the index—visit the site and your recorded context shows up.
- **Take notes without leaving the browser**: split Markdown editor/preview, common-format menu, plus paste/drag images for fast write-ups.
- **Capture quick evidence**: select important text on the page and save it as a note via the shortcut.

## ✨ Features

- **Domain history tracking**: grouped by registrable/root domain.
- **Mark tested / untested**: via panel buttons, popup actions, and keyboard shortcuts.
- **In-page quick notes**: a floating entry on every page with split editor + preview.
- **Markdown menu**: headings, bold/italic/strike, inline/code block, lists/quote, link/image, divider.
- **Image-friendly**: paste/drag images and insert Markdown image syntax (can be stored as data URLs).
- **Full manager page**: `manager.html` for search, edit, preview, delete.
- **Dark mode**: consistent theming across popup/manager/in-page panel.

## 🛠️ Tech Stack

- Chrome Extension Manifest V3 (service worker + content script)
- Vanilla JavaScript / HTML / CSS
- Storage: `chrome.storage.local`
- Quality tools: ESLint + Prettier (see [package.json](./package.json))

## 🚀 Getting Started

### Option A: Load unpacked (recommended)

1. Clone

```bash
git clone https://github.com/kingjly/hunter_note
cd hunter_note
```

2. Open extensions page

- Chrome: `chrome://extensions/`
- Edge: `edge://extensions/`

3. Enable “Developer mode”, then “Load unpacked” and select this project folder.

### Option B: Local development (optional)

This is only for lint/format checks.

```bash
npm i
npm run lint
npm run format
```

## 📖 Usage

### 1) In-page panel (content script)

- A floating button appears at the bottom-right of any page.
- From the panel you can:
  - Toggle tested/untested for the current domain
  - Create a note (Markdown editor + preview)
  - Insert images and save notes
  - Right-click in the editor to open the Markdown menu

### 2) Popup

- **History**: tree view grouped by root domain, with search, batch delete, clear.
- **Notes**: recent notes plus “Open full manager”.
- **Settings**: storage usage and data cleanup.

### 3) Keyboard Shortcuts

Default shortcuts (customizable in the browser’s extensions shortcuts settings):

- Save selected text as a note: `Ctrl+Shift+Y`
- Toggle tested/untested for current domain: `Ctrl+B`

## 🔐 Permissions & Privacy

- Uses `storage` (local data), `tabs/scripting` (read current tab info and selected text).
- `host_permissions` is `<all_urls>` to inject the floating panel on any site.
- Data stays in **local** `chrome.storage.local` and is not uploaded by default.

## 🗂️ Storage Keys (chrome.storage.local)

- `history:<domain>`: domain history/test record
- `note-index:<domain>`: note id list per domain
- `note:<noteId>`: a single note (`{ id, domain, content, createdAt, updatedAt }`)
- `theme`: dark/light

## 🤝 Contributing

PRs and issues are welcome. Before submitting, it’s nice to run:

```bash
npm run lint
npm run format
```

## 📄 License

No LICENSE file is included yet (`package.json` is `UNLICENSED`). If you plan to open-source it, consider adding a proper license.

---

If you ever re-test the same subdomain because “I swear I checked it last week”, Hunter Note is here to keep receipts.
