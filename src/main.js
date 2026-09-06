import './style.css';

const postModules = import.meta.glob('./content/posts/*.md', { eager: true, query: '?raw', import: 'default' });
const list = document.querySelector('#postList');
const tagList = document.querySelector('#tagList');
const input = document.querySelector('#searchInput');
const toggle = document.querySelector('#themeToggle');
const sectionHead = document.querySelector('.section-head');
const topics = document.querySelector('#topics');
let posts = [];

function escapeHtml(value = '') { return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char])); }
function slugify(value) { return value.toLowerCase().trim().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').replace(/^-+|-+$/g, '') || 'post'; }
function markdown(source) {
  const codeBlocks = [];
  let html = escapeHtml(source).replace(/```([^\n]*)\n?([\s\S]*?)```/g, (_, language, code) => { const token = `@@CODE${codeBlocks.length}@@`; codeBlocks.push(`<pre data-language="${escapeHtml(language)}"><code>${code}</code></pre>`); return token; });
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>').replace(/^## (.+)$/gm, '<h2>$1</h2>').replace(/^# (.+)$/gm, '<h1>$1</h1>');
  html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>').replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/^[-*] (.+)$/gm, '<li>$1</li>').replace(/(?:<li>.*<\/li>\n?)+/g, (items) => `<ul>${items}</ul>`);
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2">').replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/_([^_]+)_/g, '<em>$1</em>');
  html = html.split(/\n\n+/).map((block) => /^(<h[1-3]|<pre|<ul|<blockquote|<img|@@CODE)/.test(block.trim()) ? block : `<p>${block.replace(/\n/g, '<br>')}</p>`).join('');
  return html.replace(/@@CODE(\d+)@@/g, (_, index) => codeBlocks[Number(index)]);
}
function parse(text, sourcePath) {
  const match = text.match(/^---\s*([\s\S]*?)\s*---\s*([\s\S]*)$/); const meta = {};
  (match?.[1] || '').split('\n').forEach((line) => { const [key, ...value] = line.split(':'); if (key) meta[key.trim()] = value.join(':').trim(); });
  const title = meta.title || sourcePath.split('/').pop().replace(/\.md$/, '');
  let body = match?.[2] || text;
  const firstHeading = body.match(/^\s*#\s+(.+?)\s*(?:\r?\n|$)/);
  if (firstHeading && firstHeading[1].trim() === title.trim()) body = body.slice(firstHeading[0].length).trim();
  return { ...meta, title, slug: slugify(title), sourcePath, tags: (meta.tags || '').split(',').map((tag) => tag.trim()).filter(Boolean), body };
}
function renderHome(items) {
  document.body.classList.remove('detail-page');
  sectionHead.hidden = false; topics.hidden = false;
  list.innerHTML = items.length ? items.map((post) => `<a class="post post-link" href="?post=${encodeURIComponent(post.slug)}"><div class="post-meta"><span>${escapeHtml(post.category || 'Notes')}</span><time>${escapeHtml(post.date || '')}</time><span>${escapeHtml(post.minutes || '')}</span></div><h3>${escapeHtml(post.title || 'Untitled')}</h3><p>${escapeHtml(post.excerpt || '')}</p><div class="post-tags">${post.tags.map((tag) => `<button type="button" data-tag="${escapeHtml(tag)}"># ${escapeHtml(tag)}</button>`).join('')}</div><span class="read-more">Read article →</span></a>`).join('') : '<p class="empty">No articles yet. Add a Markdown file to <code>src/content/posts/</code>.</p>';
  document.querySelectorAll('[data-tag]').forEach((button) => button.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); input.value = button.dataset.tag; filter(); }));
}
function renderDetail(post) {
  document.body.classList.add('detail-page');
  sectionHead.hidden = true; topics.hidden = true;
  list.innerHTML = `<article class="article-detail"><a class="back-link" href="./">← Back to articles</a><div class="post-meta"><span>${escapeHtml(post.category || 'Notes')}</span><time>${escapeHtml(post.date || '')}</time><span>${escapeHtml(post.minutes || '')}</span></div><h1>${escapeHtml(post.title || 'Untitled')}</h1><p class="article-excerpt">${escapeHtml(post.excerpt || '')}</p><div class="markdown">${markdown(post.body)}</div><div class="post-tags">${post.tags.map((tag) => `<span># ${escapeHtml(tag)}</span>`).join('')}</div></article>`;
  list.querySelectorAll('.article-detail .markdown img').forEach((image) => image.addEventListener('click', () => openLightbox(image)));
}

function openLightbox(image) {
  const overlay = document.createElement('div');
  overlay.className = 'image-lightbox';
  overlay.innerHTML = `<button type="button" aria-label="Close image">×</button><img src="${image.src}" alt="${escapeHtml(image.alt || '')}">`;
  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKeyDown); };
  const onKeyDown = (event) => { if (event.key === 'Escape') close(); };
  overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
  overlay.querySelector('button').addEventListener('click', close);
  document.addEventListener('keydown', onKeyDown);
  document.body.append(overlay);
}
function filter() { const keyword = input.value.toLowerCase().trim(); renderHome(posts.filter((post) => `${post.title} ${post.category} ${post.tags.join(' ')} ${post.excerpt}`.toLowerCase().includes(keyword))); }
posts = Object.entries(postModules).map(([sourcePath, text]) => parse(text, sourcePath)).sort((a, b) => String(b.date).localeCompare(String(a.date)));
const tags = [...new Set(posts.flatMap((post) => post.tags))];
tagList.innerHTML = tags.map((tag) => `<button data-topic="${escapeHtml(tag)}"># ${escapeHtml(tag)}</button>`).join('');
document.querySelectorAll('[data-topic]').forEach((button) => button.addEventListener('click', () => { input.value = button.dataset.topic; filter(); }));
input.addEventListener('input', filter);
toggle.addEventListener('click', () => { document.documentElement.classList.toggle('dark'); localStorage.setItem('theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light'); });
if (localStorage.getItem('theme') === 'dark') document.documentElement.classList.add('dark');
const requestedSlug = new URLSearchParams(window.location.search).get('post');
const requestedPost = posts.find((post) => post.slug === requestedSlug);
if (requestedPost) renderDetail(requestedPost); else renderHome(posts);
