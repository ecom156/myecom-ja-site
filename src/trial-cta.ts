import plans from './data/plans.json';
import languages from './data/languages.json';

// 訪問者を体験レッスン（法人は導入相談）へ案内する共通の文言。ブログ記事の途中と最後、スマホ下部の固定ボタン、404 ページで使う（K 2026-10-29）
export interface TrialCta {
  title: string;
  text: string;
  href: string;
  label: string;
  // スマホ下部の固定ボタンの文言
  short: string;
  more?: { href: string; label: string };
}

const langNames = languages as Record<string, { name: string }>;

// 学校・Onki・Monki はお客さまが違うので出さない
export function trialCtaFor(siteKey: string, lang?: string): TrialCta | undefined {
  if (siteKey === 'english_children') {
    return {
      title: 'お子さまの英語を、毎週同じ担任の先生とマンツーマンで',
      text: `フォニックスと音読を軸にしたカリキュラムで、保護者の方には日本語でフィードバックをお送りします。体験は30分×2回で${plans.trial.price}です。`,
      href: '/english/children/trial/',
      label: 'お子さまの体験レッスンを予約する',
      short: `子供の体験レッスン（${plans.trial.price}）`,
      more: { href: '/english/children/', label: '子供オンライン英会話を見る' },
    };
  }
  if (siteKey === 'english_corporation') {
    return {
      title: '英語研修のご相談は、オンラインで',
      text: 'Google Meet・Teamsで、御社の目的に合った研修の進め方と費用をご提案します。相談は無料です。',
      href: '/corporation/contact/',
      label: 'オンライン導入相談（無料）',
      short: 'オンライン導入相談（無料）',
      more: { href: '/corporation/', label: '法人研修のご案内' },
    };
  }
  if (siteKey !== 'root' && siteKey !== 'english' && siteKey !== 'english_news' && siteKey !== 'russian') return undefined;
  const page = lang && lang !== 'english' ? `/${lang}/` : undefined;
  const name = page ? langNames[page]?.name : undefined;
  return {
    title: `${name ?? '英語'}を、日本語が分かるプロ講師とマンツーマンで`,
    text: `${plans.unit}のオンラインレッスン。担任の先生が、目的とレベルに合わせて進めます。体験は30分×2回で${plans.trial.price}です。`,
    href: '/trial/',
    label: '体験レッスンを予約する',
    short: `体験レッスン（30分×2回・${plans.trial.price}）`,
    more: name ? { href: page!, label: `オンライン${name}レッスンを見る` } : { href: '/english/', label: 'オンライン英会話を見る' },
  };
}

// ブログ記事の中に入れる案内の HTML。mid は本文の途中に入れる短い版
export function trialCtaHtml(cta: TrialCta, where: 'mid' | 'end') {
  const more = cta.more ? `<a href="${cta.more.href}" data-cta="post_${where}_more">${cta.more.label}</a>` : '';
  if (where === 'mid') {
    return `<aside class="post-cta mid"><b>${cta.title}</b><a class="post-cta-btn" href="${cta.href}" data-cta="post_mid">${cta.label}</a></aside>`;
  }
  return `<aside class="post-cta"><b>${cta.title}</b><p>${cta.text}</p><div class="post-cta-btns"><a class="post-cta-btn" href="${cta.href}" data-cta="post_end">${cta.label}</a>${more}</div></aside>`;
}

// 本文の真ん中に近い見出し（h2・h3）の前に入れる。見出しが無ければ真ん中に近い段落の後に入れる。短い記事には入れない
export function insertMid(html: string, box: string) {
  if (html.replace(/<[^>]+>/g, '').length < 1200) return html;
  const middle = html.length / 2;
  const near = (re: RegExp, after: boolean) => {
    let best: number | undefined;
    for (const m of html.matchAll(re)) {
      const at = after ? m.index! + m[0].length : m.index!;
      if (at < html.length * 0.25 || at > html.length * 0.75) continue;
      if (best === undefined || Math.abs(at - middle) < Math.abs(best - middle)) best = at;
    }
    return best;
  };
  const at = near(/<h[23][\s>]/g, false) ?? near(/<\/p>/g, true);
  return at === undefined ? html : html.slice(0, at) + box + html.slice(at);
}
