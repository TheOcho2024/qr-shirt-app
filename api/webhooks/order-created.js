// POST /api/webhooks/order-created
// Fires when Shopify creates a paid order. For each shirt line item we make a
// unique code, save a DB row (idempotent), generate a QR + print file, submit
// to Printful, and save tracking.
import { customAlphabet } from 'nanoid';
import { supabase } from '../../lib/supabase.js';
import { verifyShopifyWebhook, readRawBody, messageFromLineItem } from '../../lib/shopify.js';
import { buildPrintFile } from '../../lib/print-file.js';
import { createPrintfulOrder } from '../../lib/printful.js';

const makeId = customAlphabet('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 6);

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end('Method Not Allowed');

  const raw = await readRawBody(req);
  if (!verifyShopifyWebhook(raw, req.headers['x-shopify-hmac-sha256'])) {
    return res.status(401).end('Invalid signature');
  }

  const order = JSON.parse(raw);
  res.status(200).json({ received: true });

  try {
    await processOrder(order);
  } catch (err) {
    console.error('order processing failed:', err);
  }
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
        item: {
          printful_variant_id: vmap.printful_variant_id,
          placement: vmap.placement,
          print_file_url: publicUrl,
          quantity: li.quantity || 1,
        },
      });

      await supabase.from('shirts').update({
        print_file_url: publicUrl,
        printful_variant_id: vmap.printful_variant_id,
        printful_order_id: printfulOrderId,
        status: 'active',
      }).eq('id', id);
    } catch (err) {
      console.error('shirt ' + id + ' failed:', err.message);
      await supabase.from('shirts').update({ status: 'print_failed' }).eq('id', id);
    }
  }
}

function variantPart(li, which) {
  const parts = (li.variant_title || '').split('/').map((s) => s.trim());
  if (which === 'color') return parts[0] || '';
  return parts[1] || '';
}

function buildRecipient(order) {
  const a = order.shipping_address || order.billing_address || {};
  return {
    name: a.name || ((a.first_name || '') + ' ' + (a.last_name || '')).trim(),
    address1: a.address1, address2: a.address2 || '',
    city: a.city, state_code: a.province_code,
    country_code: a.country_code, zip: a.zip, email: order.email,
  };
}
