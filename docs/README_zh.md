<p align="center">
  <img width="48%" src="../public/minecraft/ui/minelog-title.png" alt="MINELOG">
</p>

<h1 align="center">MINELOG</h1>

<p align="center">
  把知识写进方块世界。一个采用 Minecraft 视觉语言的自托管个人知识库。
</p>

<div align="center">

[![Node.js](https://img.shields.io/badge/Node.js-22.x-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![GPLv3](https://img.shields.io/badge/License-GPLv3-4C1?logo=gnu&logoColor=white)](../LICENSE)
[![Storage](https://img.shields.io/badge/Storage-Local%20%7C%20Cloudflare%20R2-F38020?logo=cloudflare&logoColor=white)](#数据存储)

</div>

<p align="center">
  <a href="../README.md">English</a> | 简体中文
</p>

<p align="center">
  <a href="#界面预览">界面预览</a> ·
  <a href="#快速开始">快速开始</a> ·
  <a href="#部署到-vercel">部署指南</a> ·
  <a href="#参与贡献">参与贡献</a>
</p>

<a id="界面预览"></a>

![MINELOG 界面预览](./assets/minelog.png)

## 关于 MINELOG

MINELOG 面向技术笔记、论文阅读记录与长期知识归档。它把 Minecraft 风格的书架、物品栏和像素界面，与完整的 Markdown 写作体验放在同一个响应式 Web 应用中。

项目同时支持本地文件与云端对象存储：你可以把它当作一套完全离线、便于备份的个人笔记工具，也可以部署到 Vercel，通过 Cloudflare R2 在不同设备间访问同一份知识库。

## 功能特性

- **沉浸式知识库界面**：以书架、方块、物品栏和像素动效组织板块与文章，同时适配桌面端和移动端。
- **完整 Markdown 写作**：实时预览、编辑工具栏、GFM 表格与任务列表、代码高亮、公式渲染、图片上传和拖拽缩放。
- **灵活的内容组织**：自由创建板块、调整物品栏入口、编辑文章元数据。
- **本地与云端双模式**：开发环境直接读写 Markdown 和资源文件；线上环境使用 Vercel 同源 API 与私有 R2 桶。
- **受保护的编辑入口**：阅读保持公开，写入操作需要编辑密钥。

## 快速开始

### 环境要求

- Node.js 22.x
- npm

### 安装与运行

```shell
git clone https://github.com/ChrisDong-THU/MINELOG.git
cd MINELOG
npm install
npm run dev
```

打开终端显示的本地地址即可开始使用。本地开发模式不需要 Vercel、Cloudflare 账号或任何环境变量。

构建并运行本地生产版本：

```shell
npm run build
npm run start
```

## 数据存储

### 本地模式

执行 `npm run dev` 时，MINELOG 会启用本地文件适配器：

```text
content/local/
├─ articles/    # <文章 UUID>.md
├─ assets/      # 按内容哈希保存的图片与附件
└─ state/       # 板块配置与初始化状态
```

`content/local/` 已被 Git 忽略。备份或迁移时，请先停止开发服务器，再完整复制该目录；恢复时放回相同位置后重新启动即可。

### 云端模式

线上构建使用 Vercel 承载应用与同源 API，使用 Cloudflare R2 私有桶存储数据：

```text
R2 bucket
├─ state/article-index.json
├─ state/sections.json
├─ articles/<文章 UUID>.json
└─ assets/<内容哈希>.<扩展名>
```

R2 桶不需要公开域名或 Public Development URL。所有对象均由服务端通过 S3 API 访问。

## 部署到 Vercel

### 1. 创建 Cloudflare R2 桶

创建一个私有 R2 桶，并生成仅限该桶的 **Object Read & Write** S3 凭据。不要把 Access Key、Secret Key 或编辑密钥提交到仓库。

### 2. 配置环境变量

可参考 [`.env.example`](../.env.example) 配置 Vercel。

### 3. 导入并部署

1. 在 Vercel 中导入仓库。
2. Framework Preset 选择 **Other**。
3. Node.js 版本选择 **22.x**。
4. 添加`.env.example`中的环境变量并触发部署。

[`vercel.json`](../vercel.json) 已将线上构建命令配置为 `npm run build:vercel`。

> [!IMPORTANT]
> R2 是知识库的唯一线上数据源。请定期使用兼容 S3 的工具备份整个桶，并同时保留 `state/`、`articles/` 与 `assets/`。

## 项目结构

| 目录 | 说明 |
| --- | --- |
| [`app/`](../app) | 页面、组件、Markdown 编辑器与阅读器 |
| [`app/api/`](../app/api) | Vercel Route Handler 与编辑鉴权入口 |
| [`build/`](../build) | 本地开发模式的文件存储插件 |
| [`server/`](../server) | Cloudflare R2 S3 服务端适配器 |
| [`shared/`](../shared) | 本地与线上共用的鉴权、资源和安全规则 |
| [`worker/`](../worker) | 统一内容接口与 Vinext Worker 入口 |
| [`tests/`](../tests) | 鉴权、存储、渲染和回归测试 |
| [`public/`](../public) | 字体、方块纹理和界面资源 |

## 开发与测试

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动本地文件模式开发服务器 |
| `npm run lint` | 运行 ESLint |
| `npm run typecheck` | 运行 TypeScript 类型检查 |
| `npm run test:unit` | 运行快速单元测试 |
| `npm test` | 完成构建并运行全部测试 |
| `npm run check` | 依次执行 lint、类型检查与完整测试 |
| `npm run build:vercel` | 生成 Vercel/Nitro 构建 |

提交 Pull Request 前建议运行：

```shell
npm run check
npm run build:vercel
```

## 参与贡献

欢迎通过 Issue 和 Pull Request 改进 MINELOG。提交问题时，请尽量包含：

- 操作系统、Node.js 版本与运行模式（本地或 Vercel + R2）
- 可复现问题的最小步骤
- 预期行为与实际行为
- 必要的截图或错误日志（请先移除密钥和私人内容）

请勿提交 `.env.local`、真实凭据或 `content/local/` 中的个人知识库数据。

## 许可与声明

MINELOG 使用 [GNU General Public License v3.0](../LICENSE) 开源。你可以在遵守该许可证条款的前提下使用、修改和分发本项目。

MINELOG 是独立的社区项目，与 Mojang Studios 或 Microsoft 无关联。Minecraft 名称、标识及相关素材的权利归其各自权利人所有。

## 致谢

- [React](https://react.dev/) 与 [TypeScript](https://www.typescriptlang.org/)
- [react-markdown](https://github.com/remarkjs/react-markdown)、[KaTeX](https://katex.org/) 与 [highlight.js](https://highlightjs.org/)
- [Vinext](https://github.com/cloudflare/vinext)、[Vercel](https://vercel.com/) 与 [Cloudflare R2](https://developers.cloudflare.com/r2/)

<p align="center">Made with blocks, books and curiosity.</p>
