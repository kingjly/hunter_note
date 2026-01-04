# Hunter Note（BugBounty Tracker）

[English](./README.en.md)

![manifest](https://img.shields.io/badge/Chrome%20Extension-MV3-blue)
![stars](https://img.shields.io/github/stars/kingjly/hunter_note?style=flat)
![issues](https://img.shields.io/github/issues/kingjly/hunter_note?style=flat)
![last-commit](https://img.shields.io/github/last-commit/kingjly/hunter_note?style=flat)

面向漏洞赏金/安全测试场景的浏览器插件：把“我到底测过哪些域、写过哪些笔记”这件事，从记忆力游戏变成可检索的历史记录。

## 🎯 典型场景

- **复测/复盘时忘记上次做到哪**：再次访问目标页面，右下角一键打开面板，就能看到该域的历史记录与你之前写过的笔记，把“回忆流程”换成“继续流程”。
- **信息散落在一堆目录/文件里**：不需要手动搭“域名/子域/路径”的目录结构，域名本身就是索引；只要访问站点，你记录过的内容就能直接出现在眼前。
- **边测边记，手别离开浏览器**：面板内双栏 Markdown 编辑/预览，常用格式菜单 + 图片粘贴/拖拽，减少在外部笔记软件来回切换。
- **随手收集关键线索**：选中页面上的关键文本，用快捷键直接保存为笔记，省去复制粘贴的仪式感。

## ✨ 特点

- **域名历史追踪**：按根域聚合展示子域访问/测试记录。
- **一键标记已测/未测**：面板按钮、弹窗按钮、以及快捷键都能切换状态。
- **页面内快速笔记**：右下角悬浮入口，编辑区 + 预览区双栏，随手记。
- **Markdown 常用菜单**：标题、粗体/斜体/删除线、行内/代码块、列表/引用、链接/图片、分割线。
- **图片友好**：支持粘贴/拖拽图片，自动以 Markdown 图片语法插入（可存为 data URL）。
- **完整管理器**：独立管理页面（manager.html）支持搜索、编辑、预览、删除。
- **深色模式**：弹窗、管理器、页面内面板统一主题切换。

## 🛠️ 技术栈

- Chrome Extension Manifest V3（Service Worker + Content Script）
- 原生 JavaScript / HTML / CSS（无框架依赖）
- 存储：`chrome.storage.local`
- 代码质量：ESLint + Prettier（见 [package.json](./package.json)）

## 🚀 快速开始

### 方式一：开发者模式加载（推荐）

1. 克隆仓库

```bash
git clone https://github.com/kingjly/hunter_note
cd hunter_note
```

2. 打开 Chrome/Edge 扩展管理页

- Chrome：`chrome://extensions/`
- Edge：`edge://extensions/`

3. 打开“开发者模式”，点击“加载已解压的扩展程序”，选择本项目目录。

### 方式二：本地开发（可选）

仅用于格式化/检查代码，不影响扩展运行。

```bash
npm i
npm run lint
npm run format
```

## 📖 使用说明

### 1) 页面内面板（Content Script）

- 任意网页右下角会出现悬浮按钮：点击打开详情面板。
- 面板中可：
  - 标记当前域为已测/未测
  - 新建笔记（Markdown 编辑 + 预览）
  - 插入图片/保存笔记
  - 通过编辑器右键打开 Markdown 菜单

### 2) 扩展弹窗（Popup）

- “历史记录”：树状按根域聚合，支持搜索、批量删除、清空。
- “笔记管理”：展示最近笔记，并提供“打开完整管理器”。
- “设置”：查看存储占用、清空数据。

### 3) 快捷键

默认快捷键（可在浏览器扩展快捷键页面自行修改）：

- 保存选中文本为笔记：`Ctrl+Shift+Y`
- 标记当前域为已测试/未测试：`Ctrl+B`

## 🔐 权限与隐私

- 本项目主要使用：`storage`（本地存储）、`tabs/scripting`（读取当前页面选中文本、获取当前标签信息）。
- `host_permissions` 为 `<all_urls>`：用于在任意站点注入悬浮入口与面板。
- **数据默认仅保存在本机**的 `chrome.storage.local`，不会主动上传。

## 🗂️ 数据结构（chrome.storage.local）

- `history:<domain>`：访问/测试记录（首次/最后访问时间、次数、是否有笔记等）
- `note-index:<domain>`：该域下的笔记 id 列表
- `note:<noteId>`：单条笔记（`{ id, domain, content, createdAt, updatedAt }`）
- `theme`：主题（深色/浅色）

## 🤝 如何贡献

- 欢迎 PR / Issue（尤其是：更强的 Markdown 渲染、更好的域名归并规则、以及更多“安全测试常用操作”的工作流）。
- 提交前建议跑一下：

```bash
npm run lint
npm run format
```

## 📄 许可证

当前仓库未提供 LICENSE（`package.json` 标记为 `UNLICENSED`）。如需开源发布，建议补充合适的许可证文件。

---

如果你发现自己在同一个子域上反复“重新开始测试”，那就让 Hunter Note 负责记住它——你负责继续打点就行。
