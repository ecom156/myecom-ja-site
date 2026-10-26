import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import formsJson from '../../data/forms.json';
import sitesJson from '../../data/sites.json';
import paymentJson from '../../data/payment.json';
import { createPrefilledLink } from '../../square';

export const prerender = false;

// 必要な設定（Cloudflare の「変数とシークレット」）
//   TURNSTILE_SECRET_KEY … Turnstile のシークレットキー
//   RESEND_API_KEY       … Resend の API キー
//   MAIL_FROM            … 送信元（省略時 ECOM <noreply@ecominc.co.jp>。Resend で認証済みのドメインに限る）
//   CONTACT_TO           … 受信先（省略時 info@myecom.net）
//   SQUARE_ACCESS_TOKEN  … Square のアクセストークン（任意。あれば決済画面に名前・メール・電話を入れておく）
//   SQUARE_LOCATION_ID   … Square のロケーションID（任意。省略時はメインのロケーション）
const vars = env as unknown as Record<string, string | undefined>;
type Field = { name: string; label: string; type: string; required: boolean; choices?: string[] };
const forms = formsJson as Record<string, { site: string; fields: Field[]; payment?: string }>;
const payments = paymentJson as Record<string, { label: string; url: string; amount?: number; paid?: string }>;
const sites = sitesJson as Record<string, { name: string }>;

async function verifyTurnstile(token: string, ip: string) {
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: new URLSearchParams({ secret: vars.TURNSTILE_SECRET_KEY!, response: token, remoteip: ip }),
  });
  const data = (await res.json()) as { success: boolean; 'error-codes'?: string[] };
  if (!data.success) console.error('form: turnstile rejected', data['error-codes']);
  return data.success;
}

async function send(mail: { to: string[]; reply_to?: string; subject: string; text: string }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${vars.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: vars.MAIL_FROM ?? 'ECOM <noreply@ecominc.co.jp>', ...mail }),
  });
  if (!res.ok) throw new Error(`resend ${res.status}: ${await res.text()}`);
}

const isTrial = (labels: string, page: string) => /trial|体験|form-intensive|coupon|josei/.test(page) || /体験/.test(labels);

export const POST: APIRoute = async ({ request, redirect, url }) => {
  const data = await request.formData();
  const str = (k: string, max = 5000) => String(data.get(k) ?? '').trim().slice(0, max);
  const key = str('form', 100);
  const page = str('page', 500).startsWith('/') ? str('page', 500) : '/';
  const thanks = str('thanks', 500).startsWith('/') ? str('thanks', 500) : '';
  const back = (q: string) => redirect(`${encodeURI(page)}?form=${encodeURIComponent(key)}&${q}`, 303);
  const def = forms[key];
  if (!def) return redirect('/', 303);
  // ボット対策のダミー欄に入力があれば、成功したふりをして捨てる
  if (str('website', 200)) return back('sent=1');

  // 失敗理由は ?error= に短いコードで返す（v: 入力, c: 設定不足, t: Turnstile, m: メール送信）
  const values = def.fields.map((f) => ({ f, v: data.getAll(f.name).map((x) => String(x).trim().slice(0, 5000)).filter(Boolean).join('、') }));
  const email = values.find((x) => x.f.type === 'email')?.v ?? '';
  if (values.some((x) => x.f.required && !x.v) || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return back('error=v');
  if (!vars.TURNSTILE_SECRET_KEY || !vars.RESEND_API_KEY) {
    console.error('form: missing secret', { turnstile: !!vars.TURNSTILE_SECRET_KEY, resend: !!vars.RESEND_API_KEY });
    return back('error=c');
  }
  try {
    if (!(await verifyTurnstile(str('cf-turnstile-response', 4096), request.headers.get('CF-Connecting-IP') ?? ''))) return back('error=t');
  } catch (e) {
    console.error('form: turnstile failed', e);
    return back('error=t');
  }

  const siteName = sites[def.site]?.name ?? 'ECOM';
  const name = values.find((x) => x.f.type === 'text' || x.f.type === 'name')?.v ?? '';
  const kind = isTrial(def.fields.map((f) => f.label).join(' '), page) ? 'お申し込み' : 'お問い合わせ';
  // 価格.com の比較ページ（フォームを枠で埋め込み）から送られたものは、件名で分かるようにする。印は Form.astro が付ける
  const via = str('via', 20) === 'kakaku' || page.includes('/kakaku/') ? '［価格.com経由］' : '';
  const body = values.map(({ f, v }) => `■ ${f.label}\n${v || '-'}`).join('\n\n');
  try {
    await send({
      to: [vars.CONTACT_TO ?? 'info@myecom.net'],
      reply_to: email || undefined,
      subject: `【${siteName}】${via}${kind}：${name || email} 様`,
      text: `${siteName} のフォームから${kind}がありました。\nページ: ${url.origin}${page}\n\n${body}\n`,
    });
  } catch (e) {
    console.error('form: mail failed', e);
    return back('error=m');
  }
  // 体験料などの支払い。決済リンクはメールに載せず、送信直後に Square の画面へ移す。
  // 事前相談を希望した人は、相談の場で了承を得てから担当者が案内する
  const pay = def.payment ? payments[def.payment] : undefined;
  const wantsConsult = /^希望する/.test(values.find((x) => x.f.name === 'consult')?.v ?? '');
  const payNow = !!pay?.url && !wantsConsult;
  const payText = !pay ? '' : payNow
    ? `■ お支払い（${pay.label}）\nお申込みの直後に表示された Square の画面で、クレジットカードでお支払いください。お支払いがまだの場合は、担当者からご案内します。\n※決済のリンクをメールでお送りすることはありません。\n\n`
    : `■ お支払い（${pay.label}）\nお支払い方法は、${wantsConsult ? '事前相談のあとに' : '担当者から改めて'}ご案内します。\n\n`;
  // 申込者への自動返信（失敗しても受付は完了扱い）
  if (email) {
    try {
      await send({
        to: [email],
        reply_to: vars.CONTACT_TO ?? 'info@myecom.net',
        subject: `【${siteName}】${kind}ありがとうございます`,
        text: `${name ? `${name} 様\n\n` : ''}このたびは${siteName}に${kind}いただき、ありがとうございます。\n以下の内容で受け付けました。内容を確認のうえ、担当者よりご連絡いたします。\n\n${payText}${body}\n\n※このメールは自動送信です。ご不明な点は info@myecom.net までご連絡ください。\n\n${siteName}\n運営：株式会社イーコミュニケーション\n`,
      });
    } catch (e) {
      console.error('form: auto-reply failed', e);
    }
  }
  if (payNow) {
    const phone = values.find((x) => x.f.type === 'phone' || /電話/.test(x.f.label))?.v ?? '';
    const payer = values.find((x) => x.f.name === 'parent')?.v || name;
    const prefilled = vars.SQUARE_ACCESS_TOKEN && pay!.amount && pay!.paid
      ? await createPrefilledLink({ name: payer, email, phone }, {
          token: vars.SQUARE_ACCESS_TOKEN,
          locationId: vars.SQUARE_LOCATION_ID,
          label: pay!.label,
          amount: pay!.amount,
          redirectUrl: `${url.origin}${pay!.paid}`,
          note: `${siteName} ${key} ${payer} ${email}`,
        })
      : undefined;
    return redirect(prefilled ?? pay!.url, 303);
  }
  return thanks ? redirect(encodeURI(thanks), 303) : back('sent=1');
};
