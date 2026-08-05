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
- Vercel Functions + Cloudflare R2 S3 API：线上文章、板块与图片对象存储
- ESLint、Node.js Test Runner

## 编辑密钥

本地运行不启用编辑密钥，页面右上角会显示 `LOCAL` 标识，板块、快捷栏、文章正文和图片均持久化到忽略提交的 `content/local/`，重启后可从这些文件恢复。线上编辑功能需要服务端环境变量 `EDITOR_ACCESS_KEY`，该值必须是 6 位数字；真实密钥只配置在部署平台的加密环境变量中，不要使用 `VITE_` 前缀，也不要提交到仓库。连续验证失败 5 次后会临时锁定 15 分钟；验证成功后会签发有效期 5 天的 HttpOnly 设备凭据，超时后需重新验证。


## 存储与部署

项目采用双适配器方案，无需改变编辑界面：

- 本地运行 `npm run dev` 时，由 Vite 插件读写 `content/local/` 与本地图片目录。
- Vercel 生产环境通过同源 Route Handler 调用 Cloudflare R2 的 S3 兼容 API。文章列表仅返回元数据，正文按打开或编辑时加载；图片使用内容哈希文件名和一年不可变缓存。
- Vercel 需要配置 `R2_ACCOUNT_ID`、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY`、`R2_BUCKET_NAME` 和 `EDITOR_ACCESS_KEY`，全部只保存在生产环境变量中。
- R2 凭据应使用仅限指定桶的 Object Read & Write 权限；存储桶无需公开访问。修改密钥后需要重新部署。

部署前执行：

```powershell
npm.cmd run lint
npm.cmd test
```

不要把 `.env.local`、R2 凭据或真实编辑密钥提交到 Git。R2 存储桶不公开，所有读写都经过 Vercel 的同域服务端接口。
