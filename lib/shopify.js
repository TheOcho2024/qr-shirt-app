// Verifies that an incoming webhook really came from Shopify.
import crypto from 'node:crypto';

export function verifyShopifyWebhook(rawBody, hmacHeader) {
  if (!hmacHeader) return false;
  const digest = crypto
    .createHmac('sha256', process.env.SHOPIFY_WEBHOOK_SECRET)
    .update(rawBody, 'utf8')
    .digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader));
  } catch {
    return false;
  }
}

// Reads the raw request body as a string (needed for HMAC).
export function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

// Pull the chosen message out of a line item's properties array.
export function messageFromLineItem(lineItem, propName) {
  const props = lineItem.properties || [];
  const hit = props.find(
    (p) => (p.name || '').toLowerCase() === propName.toLowerCase()
  );
  return hit ? String(hit.value).trim() : null;
}
