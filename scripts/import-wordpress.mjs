// WordPress マルチサイト (ja.myecom.net) から全サイトの固定ページ・記事・画像を取り込む一回限りのスクリプト。
// 使い方: node scripts/import-wordpress.mjs <書き出しディレクトリ>
//   <dir>/<site>/site.json        … /wp-json/
//   <dir>/<site>/front.html       … サイトのトップの表示 HTML（ロゴ・メニュー・フッター用）
//   <dir>/<site>/{posts,pages,categories,tags,media}.json … /wp-json/wp/v2/...
//   <dir>/<site>/html/<id>.html   … 固定ページ（と一部の記事）の表示 HTML（WPBakery 展開済み）
// <site> は root, english, english_children ... （SITES を参照）
import fs from 'node:fs';
import path from 'node:path';
import { parseHTML } from 'linkedom';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

const SRC = process.argv[2];
const ROOT = path.resolve(import.meta.dirname, '..');
const ORIGIN = 'https://ja.myecom.net';
const SITES = ['root', 'english', 'english_children', 'english_schools', 'english_news', 'english_corporation', 'english_onki', 'monki', 'russian'];
const baseOf = (key) => (key === 'root' ? '' : `/${key.replace('_', '/')}`);

// 画像を取り込んだ後にもう一度実行するときは --drop-missing を付ける。旧サイトでも表示されていなかった画像（public/ に無いもの）を本文から外す
const DROP_MISSING = process.argv.includes('--drop-missing');
const missing = (p) => DROP_MISSING && p.startsWith('/') && /\/wp-content\//.test(p) && !fs.existsSync(path.join(ROOT, 'public', p));

const readJson = (f) => JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf8'));
const decode = (s) => {
  const t = s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
  return t.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/&hellip;/g, '…');
};
const yaml = (s) => JSON.stringify(s);
const safeDecode = (s) => { try { return decodeURI(s); } catch { return s; } };

// ---- URL の書き換え（自サイト内は相対パスに。wp-content のファイルは同じパスで public/ に置く）
const files = new Set();
const OWN = /^(?:https?:)?\/\/ja\.myecom\.net(?=\/|$)/;
const localize = (url) => {
  if (!url) return url;
  const u = url.trim();
  if (!OWN.test(u)) return u;
  const p = u.replace(OWN, '') || '/';
  if (/\/wp-content\//.test(p)) {
    const clean = p.split(/[?#]/)[0];
    files.add(clean);
    return safeDecode(clean);
  }
  return safeDecode(p);
};

// ---- Gravity Forms をフォーム定義（JSON）に変換する
const forms = {};
function extractForm(wrapper, siteKey) {
  const form = wrapper.querySelector('form');
  if (!form) return null;
  const key = `${siteKey}-${form.getAttribute('data-formid') || form.id.replace('gform_', '')}`;
  if (forms[key]) return key;
  const fields = [];
  for (const el of wrapper.querySelectorAll('.gfield')) {
    const cls = el.getAttribute('class') || '';
    if (/gfield_visibility_hidden|gform_validation_container/.test(cls)) continue;
    const type = (cls.match(/gfield--type-(\w+)/) || [])[1];
    const labelEl = el.querySelector('.gfield_label');
    if (!type || !labelEl) continue;
    const req = labelEl.querySelector('.gfield_required');
    req?.remove();
    const label = labelEl.textContent.replace(/\s+/g, ' ').trim();
    const desc = el.querySelector('.gfield_description')?.textContent.replace(/\s+/g, ' ').trim();
    const input = el.querySelector('input:not([type=hidden]), textarea, select');
    const placeholder = input?.getAttribute('placeholder') || undefined;
    const f = { name: `f${fields.length + 1}`, label, type, required: !!req || /gfield_contains_required/.test(cls) };
    if (desc) f.description = desc;
    if (placeholder) f.placeholder = placeholder;
    if (['checkbox', 'radio', 'select', 'consent'].includes(type)) {
      if (type === 'select') f.choices = [...el.querySelectorAll('option')].map((o) => o.textContent.trim()).filter(Boolean);
      else if (type === 'consent') f.choices = [el.querySelector('.gfield_consent_label, label.gform-field-label--type-inline')?.textContent.trim() || '同意する'];
      else f.choices = [...el.querySelectorAll('.gchoice label')].map((l) => l.textContent.trim());
    }
    fields.push(f);
  }
  const button = wrapper.querySelector('.gform_button')?.getAttribute('value') || '送信';
  forms[key] = { site: siteKey, button, fields };
  return key;
}

// ---- Markdown 変換
const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' });
td.use(gfm);
td.keep(['iframe', 'select', 'table', 'video', 'audio']);
td.addRule('formMarker', {
  filter: (node) => node.nodeName === 'DIV' && node.hasAttribute('data-form'),
  replacement: (_, node) => `\n\n<div data-form="${node.getAttribute('data-form')}"></div>\n\n`,
});
td.addRule('image', {
  filter: 'img',
  replacement: (_, node) => {
    const src = node.getAttribute('data-src') || node.getAttribute('src');
    if (!src || src.startsWith('data:') || missing(localize(src))) return '';
    return `![${(node.getAttribute('alt') || '').replace(/[[\]\n]/g, '')}](${encodeURI(safeDecode(localize(src))).replace(/\(/g, '%28').replace(/\)/g, '%29')})`;
  },
});
td.addRule('figcaption', {
  filter: 'figcaption',
  replacement: (content) => `\n\n*${content.trim()}*\n\n`,
});
td.addRule('link', {
  filter: (node) => node.nodeName === 'A' && node.getAttribute('href'),
  replacement: (content, node) => {
    const text = content.trim();
    if (!text) return '';
    const href = localize(node.getAttribute('href'));
    if (/^javascript:/i.test(href)) return text;
    return `[${text}](${encodeURI(safeDecode(href)).replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/%25/g, '%')})`;
  },
});

// 表・セレクト等そのまま残す HTML の中の URL と不要な属性を整える
function tidy(root) {
  for (const el of root.querySelectorAll('script, style, noscript, link, meta, .akismet-fields-container, .sharedaddy, .vc_separator, .vc_empty_space')) el.remove();
  for (const el of root.querySelectorAll('[src], [data-src]')) {
    const v = el.getAttribute('data-src') || el.getAttribute('src');
    if (v && !v.startsWith('data:') && el.nodeName === 'IMG' && missing(localize(v))) { el.remove(); continue; }
    if (v && !v.startsWith('data:')) el.setAttribute('src', localize(v));
    el.removeAttribute('data-src');
    el.removeAttribute('srcset');
    el.removeAttribute('data-srcset');
    el.removeAttribute('sizes');
    el.removeAttribute('data-sizes');
  }
  for (const el of root.querySelectorAll('option[value]')) el.setAttribute('value', localize(el.getAttribute('value')));
  for (const el of root.querySelectorAll('table [class], table[class]')) el.removeAttribute('class');
  for (const el of root.querySelectorAll('.vc_table_content')) el.replaceWith(...el.childNodes);
}

function toMarkdown(root) {
  tidy(root);
  return td.turndown(root.innerHTML)
    .replace(/\n{3,}/g, '\n\n')
    .trim() + '\n';
}

// 表示 HTML から本文・スライダー・フォームを取り出す
function parsePage(html, siteKey) {
  const { document } = parseHTML(html);
  const content = document.querySelector('.czr-wp-the-content') || document.querySelector('.entry-content');
  // スライダー（新旧どちらの Customizr のマークアップにも対応）
  const slides = [...document.querySelectorAll('.czr-slider-holder .carousel-cell, .customizr-slide .czr-item')].map((c) => {
    const img = c.querySelector('img');
    const cta = c.querySelector('.czrs-cta, .carousel-caption a.btn');
    return {
      image: localize(img?.getAttribute('data-src') || img?.getAttribute('src') || ''),
      title: c.querySelector('.czrs-title, .slide-title')?.textContent.trim() || undefined,
      text: c.querySelector('.czrs-subtitle, .carousel-caption .lead')?.textContent.trim() || undefined,
      button: cta?.textContent.trim() || undefined,
      link: cta ? localize(cta.getAttribute('href')) : undefined,
    };
  }).filter((s) => s.image && !s.image.startsWith('data:'));
  const formKeys = [];
  if (content) {
    for (const w of content.querySelectorAll('.gform_wrapper')) {
      const key = extractForm(w, siteKey);
      const marker = document.createElement('div');
      if (key) { marker.setAttribute('data-form', key); formKeys.push(key); }
      w.replaceWith(marker);
    }
    // フォームの外側に残る Gravity Forms の確認メッセージ等
    for (const el of content.querySelectorAll('.gform_confirmation_wrapper, .gf_browser_unknown, iframe[name^=gform_ajax_frame]')) el.remove();
  }
  return { body: content ? toMarkdown(content) : '', slides, forms: formKeys };
}

const urlPath = (link) => safeDecode(new URL(link).pathname);

// ---- サイト情報（ロゴ・メニュー・フッター）
function menu(ul) {
  if (!ul) return [];
  return [...ul.children].filter((li) => li.nodeName === 'LI').map((li) => {
    const a = [...li.children].find((c) => c.nodeName === 'A');
    const item = { label: (a?.querySelector('.nav__title') || a)?.textContent.trim() ?? '', href: localize(a?.getAttribute('href') || '#') };
    const sub = [...li.children].find((c) => c.nodeName === 'UL');
    if (sub) item.children = menu(sub);
    return item;
  });
}

const sites = {};
for (const key of SITES) {
  const info = readJson(`${key}/site.json`);
  const { document } = parseHTML(fs.readFileSync(path.join(SRC, key, 'front.html'), 'utf8'));
  const logoImg = document.querySelector('.primary-navbar__wrapper .navbar-brand img') || document.querySelector('a.site-logo img:not(.sticky)');
  const html = document.documentElement.outerHTML;
  const footerMenus = [...document.querySelectorAll('#footer-widget-area .widget_nav_menu, #footer_one .widget_nav_menu, #footer_two .widget_nav_menu, #footer_three .widget_nav_menu')].map((w) => ({
    title: w.querySelector('.widget-title')?.textContent.trim() || undefined,
    items: menu(w.querySelector('ul')),
  }));
  const icon = document.querySelector('link[rel=icon][sizes="32x32"]')?.getAttribute('href');
  sites[key] = {
    key,
    base: baseOf(key),
    name: decode(info.name),
    tagline: decode(info.description),
    logo: logoImg ? localize(logoImg.getAttribute('data-src') || logoImg.getAttribute('src')) : undefined,
    icon: icon ? localize(icon) : undefined,
    ga: (html.match(/gtag\/js\?id=((?:G|GT)-[A-Z0-9]+)/) || [])[1],
    nav: menu(document.querySelector('#main-menu') || document.querySelector('.primary-nav__menu') || document.querySelector('header ul.nav.tc-hover-menu')),
    footer: footerMenus.filter((m) => m.items.length),
    frontIsPosts: info.show_on_front === 'posts',
    postsPage: info.page_for_posts || undefined,
  };
}

// ---- 固定ページ
const pageDir = path.join(ROOT, 'src/content/pages');
const postDir = path.join(ROOT, 'src/content/posts');
fs.rmSync(pageDir, { recursive: true, force: true });
fs.rmSync(postDir, { recursive: true, force: true });
const categories = {};
const tagPaths = {};
let pageCount = 0;
let postCount = 0;
for (const key of SITES) {
  const site = sites[key];
  const dir = path.join(pageDir, key);
  fs.mkdirSync(dir, { recursive: true });
  for (const p of readJson(`${key}/pages.json`)) {
    const file = path.join(SRC, key, 'html', `${p.id}.html`);
    if (!fs.existsSync(file)) { console.log(`skip page (no html): ${p.link}`); continue; }
    const { body, slides, forms: formKeys } = parsePage(fs.readFileSync(file, 'utf8'), key);
    const isFront = new URL(p.link).pathname.replace(/\/$/, '') === site.base;
    if (p.slug === 'sample-page' && !isFront) continue;
    const fm = [
      `title: ${yaml(decode(p.title.rendered))}`,
      `path: ${yaml(urlPath(p.link))}`,
      isFront ? 'front: true' : null,
      p.id === site.postsPage ? 'postsPage: true' : null,
      formKeys.length ? `forms:\n${formKeys.map((k) => `  - ${k}`).join('\n')}` : null,
      slides.length ? `slides: ${JSON.stringify(slides)}` : null,
    ].filter(Boolean);
    const name = urlPath(p.link).slice(site.base.length).replace(/^\/|\/$/g, '').replace(/\//g, '--') || 'index';
    fs.writeFileSync(path.join(dir, `${name}.md`), `---\n${fm.join('\n')}\n---\n\n${body}`);
    pageCount++;
  }

  // ---- カテゴリ（記事一覧ページの URL を旧サイトと同じにする）
  const cats = readJson(`${key}/categories.json`);
  const catById = new Map(cats.map((c) => [c.id, c]));
  categories[key] = cats.filter((c) => c.count > 0 || cats.some((d) => d.parent === c.id)).map((c) => ({
    name: decode(c.name),
    path: urlPath(c.link),
    parent: c.parent ? decode(catById.get(c.parent)?.name ?? '') : undefined,
  }));
  const tagList = readJson(`${key}/tags.json`);
  const tags = new Map(tagList.map((t) => [t.id, decode(t.name)]));
  tagPaths[key] = tagList.filter((t) => t.count > 0).map((t) => ({ name: decode(t.name), path: urlPath(t.link) }));
  const media = new Map(readJson(`${key}/media.json`).map((m) => [m.id, m.source_url]));

  // ---- 記事
  const pdir = path.join(postDir, key);
  fs.mkdirSync(pdir, { recursive: true });
  for (const p of readJson(`${key}/posts.json`)) {
    const file = path.join(SRC, key, 'html', `${p.id}.html`);
    let body;
    let formKeys = [];
    if (fs.existsSync(file)) {
      ({ body, forms: formKeys } = parsePage(fs.readFileSync(file, 'utf8'), key));
    } else {
      const { document } = parseHTML(`<!doctype html><html><body><div id="c">${p.content.rendered}</div></body></html>`);
      body = toMarkdown(document.getElementById('c'));
    }
    const excerpt = decode(p.excerpt.rendered.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim().replace(/\s*\[…\]$|…$/, '');
    const image = media.get(p.featured_media);
    const fm = [
      `title: ${yaml(decode(p.title.rendered))}`,
      `date: ${p.date.slice(0, 10)}`,
      p.modified.slice(0, 10) !== p.date.slice(0, 10) ? `updated: ${p.modified.slice(0, 10)}` : null,
      `categories: ${JSON.stringify(p.categories.map((c) => decode(catById.get(c)?.name ?? '')).filter(Boolean))}`,
      p.tags.length ? `tags: ${JSON.stringify(p.tags.map((t) => tags.get(t)).filter(Boolean))}` : null,
      excerpt ? `description: ${yaml(excerpt.slice(0, 120))}` : null,
      image ? `image: ${yaml(localize(image))}` : null,
      `path: ${yaml(urlPath(p.link))}`,
      formKeys.length ? `forms:\n${formKeys.map((k) => `  - ${k}`).join('\n')}` : null,
    ].filter(Boolean);
    fs.writeFileSync(path.join(pdir, `${p.id}.md`), `---\n${fm.join('\n')}\n---\n\n${body}`);
    postCount++;
  }
}

fs.mkdirSync(path.join(ROOT, 'src/data'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'src/data/sites.json'), JSON.stringify(sites, null, 2) + '\n');
fs.writeFileSync(path.join(ROOT, 'src/data/categories.json'), JSON.stringify(categories, null, 2) + '\n');
fs.writeFileSync(path.join(ROOT, 'src/data/tags.json'), JSON.stringify(tagPaths, null, 2) + '\n');
fs.writeFileSync(path.join(ROOT, 'src/data/forms.json'), JSON.stringify(forms, null, 2) + '\n');
fs.writeFileSync(path.join(SRC, 'files.txt'), [...files].sort().join('\n') + '\n');
console.log(`pages: ${pageCount}, posts: ${postCount}, forms: ${Object.keys(forms).length}, files: ${files.size}`);
