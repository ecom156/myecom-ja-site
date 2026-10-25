import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// どちらも src/content/<種類>/<サイト>/ に置く。サイトは root, english, english_children など（src/data/sites.json）
const pages = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/pages' }),
  schema: z.object({
    title: z.string(),
    path: z.string(),
    // サイトのトップページ
    front: z.boolean().default(false),
    // 検索結果に出る説明文（meta description）。省略するとサイト名と一言紹介
    description: z.string().optional(),
    // 検索に出さないページ（送信完了・お支払い完了など）。サイトマップからも外す
    noindex: z.boolean().default(false),
    // 本文の下に記事一覧を出すページ（旧サイトの「投稿ページ」）
    postsPage: z.boolean().default(false),
    // リニューアルのページ。top・kids・corporate は src/components/lp/ の部品で作り、本文は使わない。language と price は本文の前に共通の案内・月額プランを出す
    template: z.enum(['top', 'kids', 'corporate', 'language', 'price', 'osaka', 'adult', 'trial', 'trialKids']).optional(),
    // 本文中の <div data-form="..."></div> の位置に出すフォーム（src/data/forms.json のキー）
    forms: z.array(z.string()).default([]),
    slides: z.array(z.object({
      image: z.string(),
      title: z.string().optional(),
      text: z.string().optional(),
      button: z.string().optional(),
      link: z.string().optional(),
    })).default([]),
  }),
});

const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    categories: z.array(z.string()).default([]),
    tags: z.array(z.string()).default([]),
    description: z.string().optional(),
    image: z.string().optional(),
    // 旧 WordPress の URL。新しい記事では省略でき、その場合は <サイト>/blog/<ファイル名>/ になる
    path: z.string().optional(),
    forms: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});

export const collections = { pages, posts };
