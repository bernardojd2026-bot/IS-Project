// functions/api/resolve.js
// Cloudflare Pages Function — marks an outage report as resolved
// Uses a private resolve_token so only the original reporter can resolve their report

export async function onRequestPost(context) {
  const { request, env } = context;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request.' }), {
      status: 400, headers: corsHeaders,
    });
  }

  const { token } = body;
  if (!token || typeof token !== 'string' || token.length < 10) {
    return new Response(JSON.stringify({ error: 'Invalid or missing token.' }), {
      status: 400, headers: corsHeaders,
    });
  }

  // Patch the matching report — only works if resolved=false (can't re-resolve)
  const patchRes = await fetch(
    `${env.SUPABASE_URL}/rest/v1/outage_reports?resolve_token=eq.${encodeURIComponent(token)}&resolved=eq.false`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type':  'application/json',
        'apikey':        env.SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        'Prefer':        'return=representation',
      },
      body: JSON.stringify({
        resolved:    true,
        resolved_at: new Date().toISOString(),
      }),
    }
  );

  if (!patchRes.ok) {
    console.error('Supabase patch error:', await patchRes.text());
    return new Response(JSON.stringify({ error: 'Failed to resolve report.' }), {
      status: 500, headers: corsHeaders,
    });
  }

  const data = await patchRes.json();

  if (!data || data.length === 0) {
    return new Response(JSON.stringify({
      error: 'Report not found or already marked as resolved.',
      alreadyResolved: true,
    }), { status: 404, headers: corsHeaders });
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200, headers: corsHeaders,
  });
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