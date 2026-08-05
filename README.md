# MINELOG

MINELOG 是一个以 Minecraft 视觉语言构建的本地个人知识仓库，面向技术博客的整理、检索、编辑与沉浸式阅读。

## 核心功能

- 以板块组织知识内容，通过可拖拽工具槽快速切换首页、常用板块与“更多板块”页。
- 首页聚合最近更新与论文推送，并提供全库搜索。
- 支持 Markdown、GFM、KaTeX 数学公式、代码块、表格与本地图片资源渲染。
- 提供文章新建、编辑、实时预览、图片粘贴与预览宽度调整。
- 阅读页包含文章元信息、分级目录、锚点导航与响应式沉浸布局。
- 本地开发时，板块与文章继续保存到本地 Markdown 文件；线上环境改用 Cloudflare R2 持久化文章、板块和图片。

## 技术栈

- React 19、TypeScript、Vinext、Vite
- React Markdown、Remark GFM、Remark Math
- Rehype KaTeX、KaTeX
- CSS、Tailwind CSS 基础样式
- Vite 本地插件：Markdown 文件与文章图片资源读写
- Cloudflare Workers + R2：线上文章、板块与图片对象存储
- ESLint、Node.js Test Runner

## 编辑密钥

线上与本地编辑功能需要服务端环境变量 `EDITOR_ACCESS_KEY`。该值必须是 6 位数字；真实密钥仅配置在 `.env.local` 或部署平台的加密环境变量中，不要使用 `VITE_` 前缀，也不要提交到仓库。连续验证失败 5 次后会临时锁定 15 分钟；验证成功后会签发仅当前浏览器会话有效的 HttpOnly Cookie。


## 存储与部署

项目采用双适配器方案，无需改变编辑界面：

- 本地运行 `npm run dev` 时，由 Vite 插件读写 `content/local/` 与本地图片目录。
- Sites/Cloudflare 生产环境通过 Worker 的同源 API 读写 R2 绑定 `CONTENT_BUCKET`。文章列表仅返回元数据，正文按打开或编辑时加载；图片使用内容哈希文件名和一年不可变缓存。
- `.openai/hosting.json` 声明 `"r2": "CONTENT_BUCKET"`，发布时由 Sites 创建并绑定存储桶。
- 生产环境必须把 `EDITOR_ACCESS_KEY` 配置为加密环境变量。修改密钥后需要重新部署，已有浏览器会话将在关闭浏览器后失效。

部署前执行：

```powershell
npm.cmd run lint
npm.cmd test
```

不要把 `.env.local`、R2 凭据或真实编辑密钥提交到 Git。R2 不需要公开桶或单独的客户端访问密钥，所有读写都经过同域 Worker API。
