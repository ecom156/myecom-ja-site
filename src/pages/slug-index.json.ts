import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { postPath, sortPosts } from '../lib';

export const prerender = true;

// 旧 WordPress は存在しない URL でも末尾のスラッグが一致するページへ転送していた。
// 404 ページがこの一覧を見て同じことをする（{ スラッグ: [パス...] }）
export const GET: APIRoute = async () => {
  const paths = [...(await getCollection('pages')).map((p) => p.data.path), ...sortPosts(await getCollection('posts')).map(postPath)];
  const index: Record<string, string[]> = {};
  for (const p of paths) {
    const slug = p.replace(/\/$/, '').split('/').pop();
    if (slug) (index[slug] ??= []).push(p);
  }
  return new Response(JSON.stringify(index), { headers: { 'Content-Type': 'application/json' } });
};
