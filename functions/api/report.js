// functions/api/report.js
// Cloudflare Pages Function — rate limited, Turnstile-verified report submission

export async function onRequestPost(context) {
  const { request, env } = context;

  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  function respond(data, status) {
    return new Response(JSON.stringify(data), { status: status || 200, headers });
  }

  // Parse request body
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return respond({ error: "Invalid request body." }, 400);
  }

  const { email, isp, issue_type, lat, lng, turnstileToken } = body;

  // Validate required fields
  if (!isp || !issue_type || lat == null || lng == null) {
    return respond({ error: "Missing required fields." }, 400);
  }

  // Validate coordinates are within Watauga County
  const inBounds = lat >= 36.0 && lat <= 36.5 && lng >= -82.1 && lng <= -81.4;
  if (!inBounds) {
    return respond({ error: "Location is outside Watauga County." }, 400);
  }

  // Require CAPTCHA token
  if (!turnstileToken) {
    return respond({ error: "CAPTCHA token missing." }, 400);
  }

  const ip = request.headers.get("CF-Connecting-IP") || "0.0.0.0";

  // Verify Turnstile CAPTCHA
  let tsData;
  try {
    const tsRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: env.TURNSTILE_SECRET,
        response: turnstileToken,
        remoteip: ip,
      }),
    });
    tsData = await tsRes.json();
  } catch (e) {
    console.error("Turnstile error:", e);
    return respond({ error: "Could not verify security check. Please try again." }, 500);
  }

  if (!tsData.success) {
    return respond({ error: "Security check failed. Please refresh and try again." }, 403);
  }

  // Check rate limit — 1 report per IP per hour
  const rlKey = "rl:" + ip;
  try {
    const hit = await env.RATE_LIMIT_KV.get(rlKey);
    if (hit !== null) {
      return respond({
        error: "You have already submitted a report recently. Please wait up to an hour.",
        rateLimited: true,
      }, 429);
    }
  } catch (e) {
    // KV unavailable — allow submission through rather than blocking users
    console.error("KV read error:", e);
  }

  // Generate a unique token so the reporter can resolve their own report
  const resolveToken = crypto.randomUUID();

  // Insert report into Supabase
  let insertRes;
  try {
    insertRes = await fetch(env.SUPABASE_URL + "/rest/v1/outage_reports", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": env.SUPABASE_SERVICE_KEY,
        "Authorization": "Bearer " + env.SUPABASE_SERVICE_KEY,
        "Prefer": "return=representation",
      },
      body: JSON.stringify({
        email: email || null,
        isp: isp,
        issue_type: issue_type,
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        resolve_token: resolveToken,
        resolved: false,
      }),
    });
  } catch (e) {
    console.error("Supabase fetch error:", e);
    return respond({ error: "Could not reach database. Please try again." }, 500);
  }

  if (!insertRes.ok) {
    const errText = await insertRes.text().catch(function() { return "unknown"; });
    console.error("Supabase insert error:", insertRes.status, errText);
    return respond({ error: "Failed to save report. Please try again." }, 500);
  }

  // Set rate limit key — expires after 1 hour
  try {
    await env.RATE_LIMIT_KV.put(rlKey, "1", { expirationTtl: 3600 });
  } catch (e) {
    // Not fatal — report was already saved successfully
    console.error("KV write error:", e);
  }

  return respond({ success: true, resolveToken: resolveToken });
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}