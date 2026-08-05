# MINELOG

MINELOG 是一个采用 Minecraft 视觉语言的个人知识库，适合整理技术笔记、论文阅读记录和长期知识档案。

同一套界面支持两种持久化方式：

- 本地模式：内容直接写入项目目录中的 Markdown 和资源文件，适合个人电脑、离线使用与完整备份。
- 线上模式：Vercel 承载应用和同源 API，Cloudflare R2 私有桶保存板块、文章和图片，适合跨设备访问。

## 技术结构

| 目录 | 用途 |
| --- | --- |
| app/ | 页面、组件、编辑器、阅读器和客户端数据模型 |
| app/api/ | Vercel Route Handler，负责鉴权并转发线上存储请求 |
| build/ | 本地开发模式的 Vite 文件存储插件 |
| shared/ | 本地与线上共同使用的鉴权、图片格式和安全规则 |
| server/ | Vercel 访问 R2 S3 API 的服务端适配器 |
| worker/ | 统一的 R2 内容接口及 Vinext Worker 入口 |
| tests/ | 鉴权、存储、渲染与回归测试 |
| public/ | 字体和 Minecraft 界面资源；物品图标路径由代码动态生成 |

文章和图片通过相同的浏览器接口读写，运行模式只在服务端适配层切换。R2 桶无需公开，也不需要配置公开开发 URL。

## 环境要求

- Node.js 22.x
- npm
- 本地模式不需要 Cloudflare 或 Vercel 账号
- 线上模式需要 Vercel 项目、Cloudflare R2 桶和桶级 S3 凭据

安装依赖：

    npm install

Windows PowerShell 如果限制 npm.ps1，可使用：

    npm.cmd install

## 本地运行与恢复

启动开发服务器：

    npm run dev

打开终端显示的本地地址即可。本地模式具有以下行为：

- 文章统一保存为 `content/local/articles/<文章 UUID>.md`，板块归属仅记录在文档元数据中。
- 图片等附件统一保存在 `content/local/assets/<内容哈希>.<扩展名>`，不再创建板块子目录。
- 板块配置和初始化状态保存在 `content/local/state/`。
- 浏览器本地状态会在首次运行时迁移到文件存储，重启后恢复。
- 保存文章时会清理已不再被任何正文引用的本地文章图片。

content/local/ 已被 Git 忽略。要迁移或备份本地知识库，请停止开发服务器后完整复制该目录；恢复时把目录放回项目同一位置再启动。

本地生产构建与启动：

    npm run build
    npm run start

## 线上部署：Vercel + Cloudflare R2

### 1. 创建私有 R2 桶

在 Cloudflare 控制台进入 R2 Object Storage，创建一个桶，例如 minelog-content。保持 Public Development URL 和自定义公开域名关闭；应用通过服务端 S3 API 访问该桶。

### 2. 创建最小权限凭据

从 R2 概览页进入 Manage R2 API Tokens，建议设置：

- Permissions：Object Read & Write。
- Specify bucket：只选择本项目使用的桶。
- TTL：按维护策略设置；长期部署可不设到期时间，但应定期轮换。
- Client IP filtering：Vercel 出口 IP 不固定时留空。
- 其余账号和桶权限不要额外授予。

创建后只会完整显示一次 Access Key ID 和 Secret Access Key。将它们放入本地忽略文件或 Vercel 加密环境变量，不要粘贴到提交记录。

### 3. 配置环境变量

复制 .env.example 为 .env.local 可在本机验证线上配置；真实值不要提交。Vercel 项目至少需要：

| 变量 | 说明 |
| --- | --- |
| EDITOR_ACCESS_KEY | 6 位数字的编辑密钥 |
| R2_ACCOUNT_ID | Cloudflare Account ID |
| R2_ACCESS_KEY_ID | R2 S3 Access Key ID |
| R2_SECRET_ACCESS_KEY | R2 S3 Secret Access Key |
| R2_BUCKET_NAME | R2 桶名 |
| R2_ENDPOINT | 可选；仅特殊区域端点需要 |

这些变量只应配置在服务端，不要添加 VITE_ 前缀。建议在 Vercel 的 Production 环境配置真实桶；如果 Preview 也要编辑，应使用独立测试桶和独立凭据。

### 4. 部署到 Vercel

1. 将项目推送到私有或受控 Git 仓库。
2. 在 Vercel 导入仓库。
3. Framework Preset 保持 Other；vercel.json 已指定 npm run build:vercel。
4. Node.js 版本使用 22.x。
5. 添加上表环境变量后触发部署。

也可以在安装并登录 Vercel CLI 后从项目目录部署，但生产环境变量仍建议在 Vercel 控制台集中管理。

## 线上数据与安全

- 文章索引位于 R2 的 `state/article-index.json`，正文统一保存为 `articles/<文章 UUID>.json`。
- 板块配置位于 `state/sections.json`，图片等附件统一保存为 `assets/<内容哈希>.<扩展名>`；文章和附件路径均不依赖板块。
- 阅读请求不需要编辑密钥；新建、修改、删除和上传资源必须通过密钥验证。
- 验证成功后使用 HttpOnly、SameSite=Strict 的签名 Cookie 信任当前设备 5 天。
- 连续失败 5 次会锁定 15 分钟。
- SVG 可以上传，但响应带有限制脚本执行的 CSP 与 nosniff 头。
- 单篇 Markdown 上限 3 MB，单张图片上限 10 MB。
- R2 凭据和编辑密钥仅存在于服务端环境变量中。

R2 应启用适合自己的备份策略。最低成本做法是定期用兼容 S3 的工具同步整个桶到本地归档；恢复时必须同时保留 state/、articles/ 和 assets/，不要只备份正文对象。

## 开发与质量检查

常用命令：

| 命令 | 用途 |
| --- | --- |
| npm run dev | 启动本地文件模式 |
| npm run test:unit | 快速运行鉴权和存储单元测试，不构建 |
| npm run typecheck | 运行严格 TypeScript 检查 |
| npm run lint | 运行 ESLint |
| npm test | 构建后运行全部测试，包括服务端渲染 |
| npm run check | 依次执行 lint、类型检查和完整测试 |
| npm run build:vercel | 生成 Vercel/Nitro 构建 |

正式推送或部署前建议执行：

    npm run check
    npm run build:vercel

## 版本库注意事项

以下内容不应提交：

- .env.local 和其他真实环境变量文件
- content/local/ 中的个人笔记与图片
