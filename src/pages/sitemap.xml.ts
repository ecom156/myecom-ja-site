import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { postPath, sortPosts } from '../lib';

export const prerender = true;

export const GET: APIRoute = async ({ site }) => {
  // ページは index.html で書き出すので、末尾に / を付けて canonical と同じ URL にする（付けないと転送つきの URL になる）
  const slash = (p: string) => (p.endsWith('/') || /\.[a-z]+$/i.test(p) ? p : `${p}/`);
  // 送信完了ページなど noindex のページは載せない。記事には更新日（無ければ公開日）を付ける
  const entries = new Map<string, Date | undefined>();
  for (const p of await getCollection('pages', (p) => !p.data.noindex)) entries.set(slash(p.data.path), undefined);
  for (const p of sortPosts(await getCollection('posts'))) entries.set(slash(postPath(p)), p.data.updated ?? p.data.date);
  const urls = [...entries].map(([p, d]) => ({ loc: new URL(encodeURI(p), site).href, d })).sort((a, b) => a.loc.localeCompare(b.loc));
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(({ loc, d }) => `  <url><loc>${loc}</loc>${d ? `<lastmod>${d.toISOString().slice(0, 10)}</lastmod>` : ''}</url>`).join('\n')}
</urlset>
`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml' } });
};
