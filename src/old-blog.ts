import type { APIRoute } from 'astro';
import oldBlog from './data/old-blog.json';

// 旧サイトの言語別ブログ（例: /german/blog/2014/062225/）は、記事を /blog/ に投稿し直したときに転送されず 404 になっていた。
// 末尾の数字は「月2桁＋記事番号」。記事番号が同じで、その言語のカテゴリに入っている記事があればそこへ、無ければ言語のページへ転送する。
// 投稿日は投稿し直しで変わっているので照合に使わない。old-blog.json は src/content/posts/root の記事番号・カテゴリから作ったもの
const map = oldBlog as Record<string, Record<string, string>>;

export const oldBlogRedirect = (lang: string): APIRoute => ({ params, redirect }) => {
  const id = /^\d\d(\d+)$/.exec(params.mmid ?? '')?.[1];
  const to = (id && map[lang]?.[id]) || `/${lang}/`;
  return redirect(encodeURI(to), 301);
};
