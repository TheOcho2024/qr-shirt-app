// POST /api/resubmit?id=8K4P7X   header: x-admin-token: <ADMIN_TOKEN>
// Re-runs Printful submission for a shirt that failed.
import { supabase } from '../lib/supabase.js';
import { createPrintfulOrder } from '../lib/printful.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end('Method Not Allowed');
  if (req.headers['x-admin-token'] !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const id = (req.query.id || '').toUpperCase();
  const { data: shirt } = await supabase.from('shirts').select('*').eq('id', id).maybeSingle();
  if (!shirt) return res.status(404).json({ error: 'not found' });
  if (!shirt.print_file_url || !shirt.printful_variant_id) {
    return res.status(400).json({ error: 'missing print file or variant; regenerate first' });
  }

  const recipient = req.body && req.body.recipient;
  if (!recipient) return res.status(400).json({ error: 'pass { recipient } in body' });

  try {
    const { printfulOrderId } = await createPrintfulOrder({
      externalId: id, recipient,
      item: {
        printful_variant_id: shirt.printful_variant_id,
        placement: 'front',
        print_file_url: shirt.print_file_url,
        quantity: 1,
      },
    });
    await supabase.from('shirts')
      .update({ printful_order_id: printfulOrderId, status: 'active' }).eq('id', id);
    return res.status(200).json({ ok: true, printfulOrderId });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
