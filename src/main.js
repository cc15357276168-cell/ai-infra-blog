import './style.css';

const postModules = import.meta.glob('./content/posts/*.md', { eager: true, query: '?raw', import: 'default' });
const list = document.querySelector('#postList');
const tagList = document.querySelector('#tagList');
const input = document.querySelector('#searchInput');
const toggle = document.querySelector('#themeToggle');
let posts = [];

function escapeHtml(value) { return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char])); }
function markdown(source) {
  let html = escapeHtml(source).replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>').replace(/^## (.+)$/gm, '<h2>$1</h2>').replace(/^# (.+)$/gm, '<h1>$1</h1>');
  html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>').replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/^[-*] (.+)$/gm, '<li>$1</li>').replace(/(?:<li>.*<\/li>\n?)+/g, (items) => `<ul>${items}</ul>`);
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2">').replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return html.split(/\n\n+/).map((block) => /^<(h[1-3]|pre|ul|blockquote|img)/.test(block.trim()) ? block : `<p>${block.replace(/\n/g, '<br>')}</p>`).join('');
}
function parse(text) {
  const match = text.match(/^---\s*([\s\S]*?)\s*---\s*([\s\S]*)$/); const meta = {};
  (match?.[1] || '').split('\n').forEach((line) => { const [key, ...value] = line.split(':'); if (key) meta[key.trim()] = value.join(':').trim(); });
  return { ...meta, tags: (meta.tags || '').split(',').map((tag) => tag.trim()).filter(Boolean), body: match?.[2] || text };
}
function render(items) {
  list.innerHTML = items.length ? items.map((post) => `<article class="post"><div class="post-meta"><span>${post.category || 'Notes'}</span><time>${post.date || ''}</time><span>${post.minutes || ''}</span></div><h3>${post.title || 'Untitled'}</h3><p>${post.excerpt || ''}</p><div class="markdown">${markdown(post.body)}</div><div class="post-tags">${post.tags.map((tag) => `<button data-tag="${tag}"># ${tag}</button>`).join('')}</div></article>`).join('') : '<p class="empty">No articles yet. Add a Markdown file to <code>src/content/posts/</code>.</p>';
  document.querySelectorAll('[data-tag]').forEach((button) => button.addEventListener('click', () => { input.value = button.dataset.tag; filter(); }));
}
function filter() { const keyword = input.value.toLowerCase().trim(); render(posts.filter((post) => `${post.title} ${post.category} ${post.tags.join(' ')} ${post.excerpt}`.toLowerCase().includes(keyword))); }
posts = Object.values(postModules).map(parse).sort((a, b) => String(b.date).localeCompare(String(a.date)));
const tags = [...new Set(posts.flatMap((post) => post.tags))];
tagList.innerHTML = tags.map((tag) => `<button data-topic="${tag}"># ${tag}</button>`).join('');
document.querySelectorAll('[data-topic]').forEach((button) => button.addEventListener('click', () => { input.value = button.dataset.topic; filter(); }));
render(posts);
input.addEventListener('input', filter);
toggle.addEventListener('click', () => { document.documentElement.classList.toggle('dark'); localStorage.setItem('theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light'); });
if (localStorage.getItem('theme') === 'dark') document.documentElement.classList.add('dark');
