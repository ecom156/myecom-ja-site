// 体験料の Square 決済画面を、フォームに入力した名前・メール・電話を入れた状態で開くためのリンクを作る。
// SQUARE_ACCESS_TOKEN が無いときや失敗したときは undefined を返し、呼び出し側は固定の決済リンクを使う。
// https://developer.squareup.com/reference/square/checkout-api/create-payment-link

type Buyer = { name: string; email: string; phone: string };
type Opts = { token: string; locationId?: string; base?: string; label: string; amount: number; redirectUrl: string; note: string };

const SQUARE_VERSION = '2025-01-23';

// 「090-1234-5678」「+81 90 1234 5678」などを +819012345678 にする。日本の番号として読めなければ空にする
export function toE164(phone: string) {
  const d = phone.normalize('NFKC').replace(/[^\d+]/g, '');
  if (/^\+[1-9]\d{7,14}$/.test(d)) return d;
  if (/^0\d{9,10}$/.test(d)) return `+81${d.slice(1)}`;
  return '';
}

// 「山田 太郎」は姓・名に分ける。区切りが無ければ全体を姓に入れる
export function splitName(name: string) {
  const parts = name.normalize('NFKC').trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { last_name: parts[0] ?? '' };
  return { last_name: parts[0], first_name: parts.slice(1).join(' ') };
}

export async function createPrefilledLink(buyer: Buyer, o: Opts): Promise<string | undefined> {
  const base = o.base ?? 'https://connect.squareup.com';
  const headers = { Authorization: `Bearer ${o.token}`, 'Square-Version': SQUARE_VERSION, 'Content-Type': 'application/json' };
  try {
    let locationId = o.locationId;
    if (!locationId) {
      const res = await fetch(`${base}/v2/locations/main`, { headers, signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`locations ${res.status}: ${await res.text()}`);
      locationId = ((await res.json()) as { location?: { id?: string } }).location?.id;
      if (!locationId) throw new Error('locations: no id');
    }
    const phone = toE164(buyer.phone);
    const name = splitName(buyer.name);
    const res = await fetch(`${base}/v2/online-checkout/payment-links`, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(5000),
      body: JSON.stringify({
        idempotency_key: crypto.randomUUID(),
        quick_pay: { name: o.label, price_money: { amount: o.amount, currency: 'JPY' }, location_id: locationId },
        checkout_options: { redirect_url: o.redirectUrl, ask_for_shipping_address: false },
        pre_populated_data: {
          buyer_email: buyer.email || undefined,
          buyer_phone_number: phone || undefined,
          buyer_address: name.last_name ? { ...name, country: 'JP' } : undefined,
        },
        payment_note: o.note.slice(0, 500),
      }),
    });
    if (!res.ok) throw new Error(`payment-links ${res.status}: ${await res.text()}`);
    return ((await res.json()) as { payment_link?: { url?: string } }).payment_link?.url;
  } catch (e) {
    console.error('square: prefilled link failed', e);
    return undefined;
  }
}
