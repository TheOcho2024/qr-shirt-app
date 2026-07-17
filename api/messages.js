// GET /api/messages - public list of active messages for the storefront picker.
import { supabase } from '../lib/supabase.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=300');
  const { data, error } = await supabase
    .from('messages').select('label').eq('active', true).order('sort_order');
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ messages: (data || []).map((r) => r.label) });
}
