// functions/api/report.js
// Cloudflare Pages Function — rate limited, Turnstile-verified report submission

export async function onRequestPost(context) {
  const { request, env } = context;

  const corsHeaders = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  const json = (data, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: corsHeaders });

  // ── Parse body ────────────────────────────────────────────
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request body.' }, 400);
  }

  const { email, isp, issue_type, lat, lng, turnstileToken } = body;

  // ── Field validation ──────────────────────────────────────
  if (!isp || !issue_type || lat == null || lng == null) {
    return json({ error: 'Missing required fields.' }, 400);
  }

  const inBounds =
    lat >= 36.0 && lat <= 36.5 &&
    lng >= -82.1 && lng <= -81.4;

  if (!inBounds) {
    return json({ error: 'Location is outside Watauga County.' }, 400);
  }

  // ── Turnstile verification ────────────────────────────────
  if (!turnstileToken) {
    return json({ error: 'CAPTCHA token missing.' }, 400);
  }

  const ip = request.headers.get('CF-Connecting-IP') || '0.0.0.0';

  let tsData;
  try {
    const tsRes = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret:   env.TURNSTILE_SECRET,
          response: turnstileToken,
          remoteip: ip,
        }),
      }
    );
    tsData = await tsRes.json();
  } catch (e) {
    console.error('Turnstile fetch error:', e);
    return json({ error: 'Could not verify security check. Please try again.' }, 500);
  }

  if (!tsData.success) {
    return json({ error: 'Security check failed. Please refresh and try again.' }, 403);
  }

  // ── Rate limit (1 per IP per hour via KV) ─────────────────
  const rlKey = `rl:${ip}`;

  try {
    const hit = await env.RATE_LIMIT_KV.get(rlKey);
    if (hit !== null) {
      // Already submitted within the last hour
      return json({
        error: 'You have already submitted a report recently. Please wait up to an hour.',
        rateLimited: true,
      }, 429);
    }
  } catch (e) {
    // KV unavailable — log but allow the submission through
    console.error('KV read error:', e);
  }

  // ── Generate resolve token ────────────────────────────────
  const resolveToken = crypto.randomUUID();

  // ── Insert to Supabase ────────────────────────────────────
  let insertRes;
  try {
    insertRes = await fetch(
      `${env.SUPABASE_URL}/rest/v1/outage_reports`,
      {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'apikey':        env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          'Prefer':        'return=representation',
        },
        body: JSON.stringify({
          email:         email || null,
          isp,
          issue_type,
          lat:           parseFloat(lat),
          lng:           parseFloat(lng),
          resolve_token: resolveToken,
          resolved:      false,
        }),
      }
    );
  } catch (e) {
    console.error('Supabase fetch error:', e);
    return json({ error: 'Could not reach database. Please try again.' }, 500);
  }

  if (!insertRes.ok) {
    const errText = await insertRes.text().catch(() => 'unknown');
    console.error('Supabase insert error:', insertRes.status, errText);
    return json({ error: 'Failed to save report. Please try again.' }, 500);
  }

  // ── Write rate limit key (expires in 1 hour) ──────────────
  try {
    await env.RATE_LIMIT_KV.put(rlKey, '1', { expirationTtl: 3600 });
  } catch (e) {
    console.error('KV write error:', e);
    // Not fatal — report was saved successfully
  }

  return json({ success: true, resolveToken });
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}