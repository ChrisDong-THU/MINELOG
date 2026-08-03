# MINELOG 矿脉日志

MINELOG 是一个以 Minecraft 界面语言为灵感的本地个人知识仓库，用于按板块整理技术博客、论文笔记与长期知识。项目提供工具槽导航、全文搜索、Markdown 阅读、数学公式渲染和实时预览编辑，并支持浏览器原生的前进与回退。

> 当前版本面向本地使用。文章编辑结果默认保存在当前浏览器中，不会自动同步到其他设备或写回仓库文件。

## 功能

- **首页信息流**：展示最近更新与论文推送；最近更新自动选取更新时间最新的文章。
- **动态工具槽**：首页和“更多”页固定在两端，中间板块可选择、排序和调整显示状态。
- **板块管理**：新增、编辑和删除板块，支持从 Minecraft 物品贴图中选择或随机确定图标。
- **文章管理**：在任意板块新增文章，或编辑、删除已有文章。
- **全文搜索**：检索文章标题、副标题、板块、标签和 Markdown 正文，按相关度排序并高亮关键词。
- **沉浸阅读**：支持目录、表格、引用、代码块、任务列表以及行内和行间数学公式。
- **实时预览**：编辑 Markdown 时即时显示与阅读页一致的正文效果。
- **本地持久化**：文章和界面配置保存在浏览器中，同一站点的多个标签页可同步更新。
- **可回退导航**：板块、文章、搜索、编辑器和章节定位均写入地址，可使用浏览器前进与回退。

## 快速开始

### 环境要求

- Node.js `>= 22.13.0`
- npm

### 安装与启动

```bash
npm install
npm run dev
```

启动后访问 [http://localhost:3000](http://localhost:3000)。

### 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动本地开发服务 |
| `npm run lint` | 检查代码规范 |
| `npm test` | 构建项目并运行关键架构测试 |
| `npm run build` | 生成生产构建产物 |
| `npm run start` | 启动已构建的本地服务 |

## 文章和配置如何保存

MINELOG 采用“仓库初始内容 + 浏览器本地修改”的数据模型：

1. 初始文章元数据定义在 `app/section-articles.ts`。
2. 仓库内置 Markdown 正文存放在 `content/`。
3. 通过网页编辑器产生的文章和正文变化保存在 `localStorage` 的 `minelog-content-v1`。
4. 板块、顺序和工具槽配置保存在 `minelog-toolbar-v1`。
5. 清除该站点的浏览器数据后，界面会恢复到仓库内置内容。

网页编辑器不会直接改写 `content/`。如需将内容长期纳入 Git 历史，应把正文整理为 Markdown 文件，并同步更新内置文章元数据。

## Markdown 支持

正文使用 `react-markdown` 渲染，并组合以下扩展：

- `remark-gfm`：表格、任务列表、删除线等 GitHub Flavored Markdown 语法。
- `remark-math`：识别行内公式与行间公式。
- `rehype-katex` 与 `KaTeX`：输出数学公式排版。

阅读页与编辑器预览共用同一渲染组件和正文样式，减少保存前后的排版差异。

## 页面地址

页面状态通过查询参数和 URL hash 表达：

| 页面 | 地址格式 |
| --- | --- |
| 首页 | `/` |
| 搜索 | `/?view=search&q=<关键词>` |
| 更多板块 | `/?view=more` |
| 板块 | `/?section=<id>` |
| 阅读文章 | `/?section=<id>&article=<title>` |
| 新增文章 | `/?section=<id>&editor=new` |
| 编辑文章 | `/?section=<id>&article=<title>&editor=edit` |
| 阅读页章节 | 在文章地址后使用 `#<章节锚点>` |

## 项目结构

```text
.
├─ app/
│  ├─ components/          # 首页、板块、搜索、阅读、编辑与通用弹窗
│  ├─ page.tsx             # 应用状态编排和页面入口
│  ├─ navigation.ts        # URL、历史记录与页面路由
│  ├─ browser-storage.ts   # 本地持久化和跨标签页同步
│  ├─ section-articles.ts  # 内置文章索引与元数据
│  └─ article-markdown.ts  # Markdown 装载与默认正文生成
├─ content/                # 仓库内置 Markdown 正文
├─ public/
│  ├─ fonts/               # 本地字体及授权说明
│  └─ minecraft/           # Minecraft 风格界面贴图资源
├─ tests/                  # 构建产物与关键架构检查
├─ worker/                 # vinext 的 Cloudflare Worker 入口
├─ build/                  # Sites/Vite 构建辅助代码
└─ vite.config.ts          # 本地开发和构建配置
```

## 技术栈

- vinext / Vite
- React 19
- TypeScript
- Tailwind CSS 4
- react-markdown
- remark-gfm / remark-math
- rehype-katex / KaTeX

## 当前限制

- 数据默认只保存在当前浏览器，不支持跨设备同步。
- 清除浏览器站点数据后，网页编辑产生的内容会丢失。
- 网页编辑不会自动回写仓库中的 Markdown 文件。
- 论文推送目前使用示例数据，尚未连接外部订阅源。
- 项目没有配置正式线上发布流程。

## 资源说明

界面使用的像素贴图集中在 `public/minecraft/`，字体授权信息位于 `public/fonts/OFL.txt`。MINELOG 是个人知识仓库项目，与 Mojang Studios 或 Microsoft 无隶属关系。
