// GET /s/:id  (rewritten to /api/scan?id=:id by vercel.json)
// The page anyone sees when they scan a shirt. Fast, minimal, no personal data.
import { supabase } from '../lib/supabase.js';

export default async function handler(req, res) {
  const id = (req.query.id || '').toUpperCase().slice(0, 12);

  const { data: shirt } = await supabase
    .from('shirts').select('message, status').eq('id', id).maybeSingle();

  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  if (!shirt || shirt.status !== 'active') {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(404).send(page('This code is no longer available.', false));
  }

  supabase.rpc('increment_scan', { shirt_id: id }).then(() => {}).catch(() => {});
  res.setHeader('Cache-Control', 'public, max-age=30');
  return res.status(200).send(page(shirt.message, true));
}

function esc(s) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(s).replace(/[&<>"']/g, (c) => map[c]);
}

function page(message, active) {
  const store = process.env.PUBLIC_BASE_URL || '#';
  const css = [
    ':root{color-scheme:dark}',
    '*{margin:0;box-sizing:border-box}',
    'body{min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2rem;background:radial-gradient(circle at 50% 30%,#1a1a2e,#0a0a0f);color:#fff;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;text-align:center;padding:2rem}',
    'h1{font-size:clamp(2.5rem,12vw,6rem);font-weight:900;letter-spacing:-.02em;line-height:1.05;text-transform:uppercase;animation:pop .5s cubic-bezier(.2,.8,.2,1)}',
    '@keyframes pop{from{transform:scale(.7);opacity:0}to{transform:scale(1);opacity:1}}',
    '.actions{display:flex;gap:.75rem;flex-wrap:wrap;justify-content:center}',
    'a.btn,button.btn{font:inherit;font-weight:700;border:0;border-radius:999px;padding:.85rem 1.5rem;background:#fff;color:#111;text-decoration:none;cursor:pointer}',
    'a.ghost{background:transparent;color:#fff;border:2px solid #ffffff55}'
  ].join('');
  const actions = active
    ? '<div class="actions"><button class="btn" onclick="share()">Share</button><a class="btn ghost" href="' + esc(store) + '">Get your own shirt</a></div>'
    : '';
  const script = 'function share(){var d={title:document.title,text:document.title,url:location.href};if(navigator.share){navigator.share(d).catch(function(){})}else{if(navigator.clipboard){navigator.clipboard.writeText(location.href)}alert(\'Link copied!\')}}';
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1">'
    + '<title>' + esc(message) + '</title><style>' + css + '</style></head>'
    + '<body><h1>' + esc(message) + '</h1>' + actions
    + '<script>' + script + '</scr' + 'ipt></body></html>';
}
