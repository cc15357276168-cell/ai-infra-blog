# AI Infra Notes

一个可直接发布到 Cloudflare Pages 的轻量个人博客。

## 本地运行

```powershell
npm install
npm run dev
```

浏览器打开终端显示的网址，通常是 `http://localhost:5173`。

## 发布到 Cloudflare Pages

将项目推到 GitHub，然后在 Cloudflare Pages 导入仓库：

- Build command: `npm run build`
- Build output directory: `dist`

Cloudflare 会免费提供 `项目名.pages.dev` 地址。

## 写文章

- 用 Obsidian 打开 `src/content/posts/` 作为写作文件夹。
- 每一篇文章是一个 `.md` 文件；新建文件后，网站会自动读取，无需修改代码。
- 图片放在 `public/images/`，正文中写：`![图片说明](/images/图片文件名.png)`。
- 网站名称、简介、链接：编辑 `index.html`。
