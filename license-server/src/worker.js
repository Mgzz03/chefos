// ChefOS License Server — Cloudflare Worker
// ----------------------------------------------------------------------------
// KV binding required:  LICENSES
// Secrets required:     JWT_SECRET   (signs activation tokens — keep private)
//                       ADMIN_TOKEN  (gate for /admin/* — keep private)
//
// Public endpoints (called by the app's backend):
//   POST /activate     { key, fingerprint, device_name? }
//   POST /validate     { key, fingerprint }        ← periodic re-check
//   POST /deactivate   { key, fingerprint }
//
// Admin endpoints (require header  X-Admin-Token: <ADMIN_TOKEN> ):
//   POST   /admin/keys           { chef_name, email, max_devices, expires_at? }
//   GET    /admin/keys
//   POST   /admin/revoke         { key }
//   POST   /admin/enable         { key }
//   POST   /admin/extend         { key, expires_at|null }
//   POST   /admin/reset-devices  { key }
//   DELETE /admin/keys?key=KEY
// ----------------------------------------------------------------------------

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json', ...CORS },
  });

const now = () => Math.floor(Date.now() / 1000);

// ── base64url + HS256 JWT signing (Web Crypto) ──
function b64url(input) {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function signJWT(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const data = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return `${data}.${b64url(sig)}`;
}

// ── Generate a key: CHEF-XXXX-XXXX-XXXX (no ambiguous chars) ──
function genKey() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0, 1
  const rnd = crypto.getRandomValues(new Uint8Array(12));
  const parts = [];
  for (let g = 0; g < 3; g++) {
    let s = '';
    for (let i = 0; i < 4; i++) s += alphabet[rnd[g * 4 + i] % alphabet.length];
    parts.push(s);
  }
  return 'CHEF-' + parts.join('-');
}

const getRec = async (env, key) => {
  const raw = await env.LICENSES.get((key || '').trim().toUpperCase());
  return raw ? JSON.parse(raw) : null;
};
const putRec = (env, rec) => env.LICENSES.put(rec.key, JSON.stringify(rec));

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const method = request.method;

    try {
      // ───────────────────────── PUBLIC ─────────────────────────
      if (method === 'POST' && path === '/activate') {
        const { key, fingerprint, device_name } = await request.json();
        if (!key || !fingerprint) return json({ ok: false, error: 'Missing key or fingerprint' }, 400);
        const rec = await getRec(env, key);
        if (!rec) return json({ ok: false, error: 'Invalid license key' }, 404);
        if (!rec.is_active) return json({ ok: false, error: 'This license has been deactivated' }, 403);
        if (rec.expires_at && now() > rec.expires_at) return json({ ok: false, error: 'This license has expired' }, 403);

        rec.activated_devices = rec.activated_devices || [];
        let dev = rec.activated_devices.find((d) => d.fingerprint === fingerprint);
        if (!dev) {
          if (rec.activated_devices.length >= (rec.max_devices || 1))
            return json({ ok: false, error: 'Device limit reached for this license' }, 403);
          rec.activated_devices.push({ fingerprint, device_name: device_name || '', activated_at: now() });
          await putRec(env, rec);
        }
        const token = await signJWT({ sub: rec.key, fp: fingerprint, iat: now(), exp: now() + 30 * 86400 }, env.JWT_SECRET);
        return json({ ok: true, token, chef_name: rec.chef_name, expires_at: rec.expires_at || null });
      }

      if (method === 'POST' && path === '/validate') {
        const { key, fingerprint } = await request.json();
        if (!key || !fingerprint) return json({ ok: false, error: 'Missing key or fingerprint' }, 400);
        const rec = await getRec(env, key);
        if (!rec) return json({ ok: false, error: 'Invalid license key' }, 404);
        if (!rec.is_active) return json({ ok: false, error: 'License deactivated' }, 403);
        if (rec.expires_at && now() > rec.expires_at) return json({ ok: false, error: 'License expired' }, 403);
        const dev = (rec.activated_devices || []).find((d) => d.fingerprint === fingerprint);
        if (!dev) return json({ ok: false, error: 'Device not registered' }, 403);
        const token = await signJWT({ sub: rec.key, fp: fingerprint, iat: now(), exp: now() + 30 * 86400 }, env.JWT_SECRET);
        return json({ ok: true, token, chef_name: rec.chef_name, expires_at: rec.expires_at || null });
      }

      if (method === 'POST' && path === '/deactivate') {
        const { key, fingerprint } = await request.json();
        const rec = await getRec(env, key);
        if (!rec) return json({ ok: false, error: 'Invalid license key' }, 404);
        rec.activated_devices = (rec.activated_devices || []).filter((d) => d.fingerprint !== fingerprint);
        await putRec(env, rec);
        return json({ ok: true });
      }

      // ───────────────────────── AI ASSISTANT ───────────────────
      // Free, server-side LLM (Cloudflare Workers AI). Gated behind an active
      // license so the free quota isn't abused. The app sends a compact summary
      // of the chef's own data as `context`, plus the question.
      if (method === 'POST' && path === '/ai') {
        const { key, question, context } = await request.json();
        if (!question) return json({ ok: false, error: 'Missing question' }, 400);
        const rec = await getRec(env, key);
        if (!rec || !rec.is_active) return json({ ok: false, error: 'Inactive or invalid license' }, 403);
        if (rec.expires_at && now() > rec.expires_at) return json({ ok: false, error: 'License expired' }, 403);
        if (!env.AI) return json({ ok: false, error: 'AI is not enabled on this server' }, 503);

        const sys =
          "You are ChefOS's kitchen assistant for a professional chef. " +
          "Use the chef's own data below when relevant (recipes, ingredients, stock, costs). " +
          "You may also use general culinary knowledge: substitutions, techniques, food safety, " +
          "nutrition, flavour pairings, yields and scaling. Be concise and practical, use short " +
          "bullet points, and prices are in EGP. If the data doesn't cover something, say so briefly.\n\n" +
          "CHEF'S DATA:\n" + String(context || '(none provided)').slice(0, 6000);

        try {
          const out = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
            messages: [
              { role: 'system', content: sys },
              { role: 'user', content: String(question).slice(0, 1500) },
            ],
            max_tokens: 800,
          });
          const answer = (out && (out.response || out.result || out.text)) || '';
          if (!answer) return json({ ok: false, error: 'No answer' }, 502);
          return json({ ok: true, answer });
        } catch (e) {
          return json({ ok: false, error: 'AI error: ' + (e && e.message || e) }, 502);
        }
      }

      // ───────────────────────── ADMIN ─────────────────────────
      if (path.startsWith('/admin')) {
        if (request.headers.get('x-admin-token') !== env.ADMIN_TOKEN)
          return json({ ok: false, error: 'Unauthorized' }, 401);

        if (method === 'POST' && path === '/admin/keys') {
          const { chef_name, email, max_devices, expires_at } = await request.json();
          let key = genKey();
          while (await env.LICENSES.get(key)) key = genKey();
          const rec = {
            key, chef_name: chef_name || '', email: email || '',
            max_devices: Math.max(1, parseInt(max_devices || 1, 10)),
            activated_devices: [], created_at: now(), is_active: true,
            expires_at: expires_at || null,
          };
          await putRec(env, rec);
          return json({ ok: true, ...rec });
        }

        if (method === 'GET' && path === '/admin/keys') {
          const out = [];
          let cursor;
          do {
            const list = await env.LICENSES.list({ cursor });
            for (const k of list.keys) {
              const raw = await env.LICENSES.get(k.name);
              if (raw) out.push(JSON.parse(raw));
            }
            cursor = list.list_complete ? null : list.cursor;
          } while (cursor);
          out.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
          return json({ ok: true, keys: out });
        }

        if (method === 'POST' && (path === '/admin/revoke' || path === '/admin/enable')) {
          const { key } = await request.json();
          const rec = await getRec(env, key);
          if (!rec) return json({ ok: false, error: 'Not found' }, 404);
          rec.is_active = path === '/admin/enable';
          await putRec(env, rec);
          return json({ ok: true, ...rec });
        }

        if (method === 'POST' && path === '/admin/extend') {
          const { key, expires_at } = await request.json();
          const rec = await getRec(env, key);
          if (!rec) return json({ ok: false, error: 'Not found' }, 404);
          rec.expires_at = expires_at || null;
          await putRec(env, rec);
          return json({ ok: true, ...rec });
        }

        if (method === 'POST' && path === '/admin/reset-devices') {
          const { key } = await request.json();
          const rec = await getRec(env, key);
          if (!rec) return json({ ok: false, error: 'Not found' }, 404);
          rec.activated_devices = [];
          await putRec(env, rec);
          return json({ ok: true, ...rec });
        }

        if (method === 'DELETE' && path === '/admin/keys') {
          await env.LICENSES.delete((url.searchParams.get('key') || '').trim().toUpperCase());
          return json({ ok: true });
        }
      }

      if (path === '/') return json({ ok: true, service: 'ChefOS License Server' });
      return json({ ok: false, error: 'Not found' }, 404);
    } catch (e) {
      return json({ ok: false, error: String((e && e.message) || e) }, 500);
    }
  },
};
