import type { CollectionEntry } from 'astro:content';
import sitesJson from './data/sites.json';
import categoriesJson from './data/categories.json';
import tagsJson from './data/tags.json';

export type NavItem = { label: string; href: string; children?: NavItem[] };
export type Site = {
  key: string;
  base: string;
  name: string;
  tagline: string;
  logo?: string;
  icon?: string;
  ga?: string;
  nav: NavItem[];
  footer: { title?: string; items: NavItem[] }[];
  frontIsPosts: boolean;
  // ヘッダー右の目立つボタン（体験予約など）
  cta?: NavItem;
};
export type Category = { name: string; path: string; parent?: string };

export const sites = sitesJson as unknown as Record<string, Site>;
export const categories = categoriesJson as Record<string, Category[]>;
export const tags = tagsJson as Record<string, { name: string; path: string }[]>;
export const PER_PAGE = 20;

export const siteKeyOf = (entry: { id: string }) => entry.id.split('/')[0];
export const siteOf = (entry: { id: string }) => sites[siteKeyOf(entry)];

// URL のパスからどのサイトのページかを決める（一番長い base に一致したもの）
export function siteForPath(pathname: string) {
  const p = decodeURI(pathname);
  return Object.values(sites)
    .filter((s) => p === s.base || p.startsWith(`${s.base}/`))
    .sort((a, b) => b.base.length - a.base.length)[0] ?? sites.root;
}

export function postPath(post: CollectionEntry<'posts'>) {
  if (post.data.path) return post.data.path;
  const file = post.id.split('/').slice(1).join('/');
  return `${siteOf(post).base}/blog/${file}/`;
}

export function blogPath(site: Site) {
  return site.frontIsPosts ? `${site.base}/` : `${site.base}/blog/`;
}

// 異文化ブログ（root の記事）の言語圏。カテゴリの URL /blog/category/<言語>/ から決める（K 2026-10-24）
export function langOf(post: CollectionEntry<'posts'>) {
  if (siteKeyOf(post) !== 'root') return undefined;
  for (const name of post.data.categories) {
    const m = categoryPath('root', name).match(/^\/blog\/category\/(english|german|french|chinese|russian|arabic|spanish|korean|italian|portuguese)\//);
    if (m) return m[1];
  }
  return undefined;
}
// 言語ページ /chinese/ や、異文化ブログのカテゴリ一覧 /blog/category/chinese/ のパスから、その言語圏を返す
export function langForPath(pathname: string) {
  const m = decodeURI(pathname).match(/^\/(?:blog\/category\/)?(english|german|french|chinese|russian|arabic|spanish|korean|italian|portuguese)(\/|$)/);
  return m?.[1];
}

export function formatDate(d: Date) {
  return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日`;
}

// 下書きと、日時が未来の記事（予約投稿）は出さない。予約投稿は .github/workflows/scheduled-publish.yml が公開日時の後にサイトを作り直して公開する
export function sortPosts(posts: CollectionEntry<'posts'>[]) {
  const now = Date.now();
  return posts.filter((p) => !p.data.draft && p.data.date.valueOf() <= now).sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

// カテゴリ名 → 一覧ページ。子カテゴリの記事は親カテゴリの一覧にも出す
// categories.json に無い新しいカテゴリは <サイト>/blog/category/<カテゴリ名>/ に一覧を作る
export function categoryPath(siteKey: string, name: string) {
  return categories[siteKey]?.find((c) => c.name === name)?.path ?? `${sites[siteKey].base}/blog/category/${name}/`;
}
export function allCategories(siteKey: string, posts: CollectionEntry<'posts'>[]): Category[] {
  const known = categories[siteKey] ?? [];
  const extra = [...new Set(posts.flatMap((p) => p.data.categories))].filter((n) => !known.some((c) => c.name === n));
  return [...known, ...extra.map((name) => ({ name, path: categoryPath(siteKey, name) }))];
}
export function inCategory(siteKey: string, post: CollectionEntry<'posts'>, name: string): boolean {
  const cats = categories[siteKey] ?? [];
  const hit = (n: string, depth = 0): boolean => {
    if (n === name) return true;
    const parent = cats.find((c) => c.name === n)?.parent;
    return !!parent && depth < 5 && hit(parent, depth + 1);
  };
  return post.data.categories.some((c) => hit(c));
}

// 旧サイトと同じ URL を作る。先頭と末尾の / を除いたものが [...path] の params.path
export const param = (p: string) => decodeURI(p).replace(/^\/|\/$/g, '') || undefined;
export const chunk = <T>(all: T[]) => Array.from({ length: Math.max(1, Math.ceil(all.length / PER_PAGE)) }, (_, i) => all.slice(i * PER_PAGE, (i + 1) * PER_PAGE));
