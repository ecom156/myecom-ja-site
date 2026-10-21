# ja.myecom.net

ECOMオンライン語学学校のサイト一式（旧 WordPress マルチサイト 9 サイト分）。Astro で静的に書き出し、Cloudflare Workers で配信する。

| サイト | URL | フォルダ名 |
| --- | --- | --- |
| ECOMオンライン語学学校 | `/` | `root` |
| ECOMオンライン英会話学校 | `/english/` | `english` |
| ECOM子供オンライン英会話 | `/english/children/` | `english_children` |
| ECOM for Schools | `/english/schools/` | `english_schools` |
| ECOM 週間英語ニュース | `/english/news/` | `english_news` |
| ECOMオンライン英語研修 | `/english/corporation/` | `english_corporation` |
| Onki | `/english/onki/` | `english_onki` |
| Monki | `/monki/` | `monki` |
| ECOMロシア語ネット | `/russian/` | `russian` |

- 記事: `src/content/posts/<フォルダ名>/*.md`
- 固定ページ: `src/content/pages/<フォルダ名>/*.md`（`path` がそのページの URL）
- ロゴ・メニュー・GA: `src/data/sites.json`、カテゴリ: `src/data/categories.json`
- フォーム: 定義は `src/data/forms.json`、送信は `src/pages/api/form.ts`。ページの `forms:` に書いたフォームが本文中の `<div data-form="..."></div>` の位置に出る
- 画像などは旧サイトと同じパスで `public/` に置いてある
- 旧 WordPress からの転送: `public/_redirects`

## 記事の追加

`src/content/posts/root/` などに Markdown を 1 つ置く。`path` を省略すると URL は `<サイト>/blog/<ファイル名>/` になる。カテゴリ名は `src/data/categories.json` にあるものを使う。

```md
---
title: "記事のタイトル"
date: 2026-11-01
categories: ["ドイツ語"]
description: "一覧に出る短い紹介文"
image: "/wp-content/uploads/2026/11/example.jpg"
---

本文
```

## フォームの設定（Cloudflare の「変数とシークレット」）

- `TURNSTILE_SECRET_KEY` … Turnstile のシークレットキー
- `RESEND_API_KEY` … Resend の API キー
- `MAIL_FROM`（任意）… 送信元。省略時 `ECOM <noreply@ecominc.co.jp>`
- `CONTACT_TO`（任意）… 受信先。省略時 `info@myecom.net`

受信メールとは別に、入力されたメールアドレスへ自動返信を送る。

## 開発

```sh
npm install
npm run dev     # http://localhost:4321
npm run build
```

main への push で Cloudflare が自動でビルド・デプロイする（GitHub アプリ「Cloudflare Workers and Pages」にこのリポジトリのアクセス権が必要）。
