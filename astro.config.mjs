// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

// ページはすべて静的に書き出し、フォーム送信（/api/form/）だけ Worker で動かす
export default defineConfig({
  site: 'https://ja.myecom.net',
  trailingSlash: 'ignore',
  adapter: cloudflare(),
});
