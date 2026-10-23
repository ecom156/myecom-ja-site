// 予約投稿のうち、直近 26 時間以内に公開日時を過ぎた記事があるかを調べる（scheduled-publish.yml から使う）
// あれば public/published-at.txt を更新する。これを main にコミットすると Cloudflare がサイトを作り直し、記事が公開される
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const now = Date.now();
const due = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (p.endsWith('.md')) {
      const m = fs.readFileSync(p, 'utf8').match(/^date:\s*(.+)$/m);
      const t = m && Date.parse(m[1].trim().replace(/^"|"$/g, ''));
      if (t && t <= now && t > now - 26 * 3600 * 1000) due.push(path.relative(ROOT, p));
    }
  }
};
walk(path.join(ROOT, 'src/content/posts'));
if (due.length) {
  fs.writeFileSync(path.join(ROOT, 'public/published-at.txt'), `${new Date(now).toISOString()}\n${due.join('\n')}\n`);
  console.log(`due: ${due.join(', ')}`);
} else {
  console.log('no posts due');
}
