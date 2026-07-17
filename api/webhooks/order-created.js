// POST /api/webhooks/order-created  (with raw-body fix + diagnostic)
import crypto from 'node:crypto';
import { customAlphabet } from 'nanoid';
import { supabase } from '../../lib/supabase.js';
import { messageFromLineItem } from '../../lib/shopify.js';
import { buildPrintFile } from '../../lib/print-file.js';
import { createPrintfulOrder } from '../../lib/printful.js';

const makeId = customAlphabet('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 6);
export const config = { api: { bodyParser: false } };

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function verify(rawBuf, header) {
  if (!header) return false;
  const secret = (process.env.SHOPIFY_WEBHOOK_SECRET || '').trim();
  const digest = crypto.createHmac('sha256', secret).update(rawBuf).digest('base64');
  try { return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(header)); }
  catch { return false; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end('Method Not Allowed');
  const raw = await readRawBody(req);
  const header = req.headers['x-shopify-hmac-sha256'];
  const ok = verify(raw, header);
  console.log('WEBHOOK_DEBUG ' + JSON.stringify({ rawLen: raw ? raw.length : -1, hasHeader: !!header, ok: ok }));
  if (!ok) return res.status(401).end('Invalid signature');

  const order = JSON.parse(raw.toString('utf8'));
  res.status(200).json({ received: true });
  try { await processOrder(order); } catch (err) { console.error('processing failed:', err); }
}

async function processOrder(order) {
  const propName = process.env.MESSAGE_PROPERTY_NAME || 'Message';
  const recipient = buildRecipient(order);
  for (const li of order.line_items || []) {
    const { data: existing } = await supabase
      .from('shirts').select('id').eq('shopify_line_item_id', li.id).maybeSingle();
    if (existing) continue;
    const message = messageFromLineItem(li, propName) || 'SCAN ME';
    const color = variantPart(li, 'color');
    const size = variantPart(li, 'size');
    const id = makeId();
    await supabase.from('shirts').insert({
      id, shopify_order_id: order.id, shopify_line_item_id: li.id,
      message, product: li.title, color, size, status: 'pending',
    });
    try {
      const scanUrl = process.env.PUBLIC_BASE_URL + '/s/' + id;
      const { publicUrl } = await buildPrintFile({ id, scanUrl });
      const { data: vmap } = await supabase
        .from('variant_map').select('printful_variant_id, placement')
        .eq('color', color).eq('size', size).maybeSingle();
      if (!vmap) throw new Error('No variant_map entry for ' + color + '/' + size);
      const { printfulOrderId } = await createPrintfulOrder({
        externalId: id, recipient,
        item: { printful_variant_id: vmap.printful_variant_id, placement: vmap.placement,
          print_file_url: publicUrl, quantity: li.quantity || 1 },
      });
      await supabase.from('shirts').update({
        print_file_url: publicUrl, printful_variant_id: vmap.printful_variant_id,
        printful_order_id: printfulOrderId, status: 'active',
      }).eq('id', id);
    } catch (err) {
      console.error('shirt ' + id + ' failed:', err.message);
      await supabase.from('shirts').update({ status: 'print_failed' }).eq('id', id);
    }
  }
}

function variantPart(li, which) {
  const parts = (li.variant_title || '').split('/').map((s) => s.trim());
  return which === 'color' ? (parts[0] || '') : (parts[1] || '');
}

function buildRecipient(order) {
  const a = order.shipping_address || order.billing_address || {};
  return {
    name: a.name || ((a.first_name || '') + ' ' + (a.last_name || '')).trim(),
    address1: a.address1, address2: a.address2 || '', city: a.city,
    state_code: a.province_code, country_code: a.country_code, zip: a.zip, email: order.email,
  };
}
