// Submits one order to Printful (API v2) with a custom design file per shirt.
// Docs: https://developers.printful.com/docs/v2-beta/
const BASE = 'https://api.printful.com';

function headers() {
  const h = {
    'Authorization': 'Bearer ' + process.env.PRINTFUL_TOKEN,
    'Content-Type': 'application/json',
  };
  if (process.env.PRINTFUL_STORE_ID) h['X-PF-Store-Id'] = process.env.PRINTFUL_STORE_ID;
  return h;
}

export async function createPrintfulOrder({ externalId, recipient, item }) {
  const confirm = String(process.env.PRINTFUL_AUTO_CONFIRM).toLowerCase() === 'true';

  const body = {
    external_id: externalId,
    recipient,
    order_items: [
      {
        source: 'catalog',
        catalog_variant_id: item.printful_variant_id,
        quantity: item.quantity || 1,
        placements: [
          {
            placement: item.placement || 'front',
            technique: 'dtg',
            layers: [{ type: 'file', url: item.print_file_url }],
          },
        ],
      },
    ],
  };

  const url = BASE + '/v2/orders' + (confirm ? '?confirm=true' : '');
  const res = await fetch(url, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error('Printful ' + res.status + ': ' + JSON.stringify(json).slice(0, 500));
  }
  const orderId = (json && json.data && json.data.id) || (json && json.result && json.result.id) || null;
  return { printfulOrderId: orderId ? String(orderId) : null, raw: json };
}
