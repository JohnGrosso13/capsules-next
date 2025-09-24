// Supabase Edge Function: oauth-callback
// Exchanges authorization code for tokens and stores in social_links

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function b64urlDecode(s: string) {
  try { return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0)))); } catch { return {}; }
}

function providerTokenConfig(provider: string) {
  const p = provider.toLowerCase();
  switch (p) {
    case 'youtube':
      return {
        tokenUrl: 'https://oauth2.googleapis.com/token',
        clientId: Deno.env.get('YOUTUBE_CLIENT_ID') || Deno.env.get('GOOGLE_CLIENT_ID') || '',
        clientSecret: Deno.env.get('YOUTUBE_CLIENT_SECRET') || Deno.env.get('GOOGLE_CLIENT_SECRET') || '',
      };
    case 'instagram':
      return {
        tokenUrl: 'https://api.instagram.com/oauth/access_token',
        clientId: Deno.env.get('INSTAGRAM_CLIENT_ID') || '',
        clientSecret: Deno.env.get('INSTAGRAM_CLIENT_SECRET') || '',
      };
    case 'x':
    case 'twitter':
      return {
        tokenUrl: 'https://api.twitter.com/2/oauth2/token',
        clientId: Deno.env.get('TWITTER_CLIENT_ID') || Deno.env.get('X_CLIENT_ID') || '',
        clientSecret: Deno.env.get('TWITTER_CLIENT_SECRET') || Deno.env.get('X_CLIENT_SECRET') || '',
      };
    case 'tiktok':
      return {
        tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
        clientId: Deno.env.get('TIKTOK_CLIENT_ID') || '',
        clientSecret: Deno.env.get('TIKTOK_CLIENT_SECRET') || '',
      };
    case 'facebook':
      return {
        tokenUrl: 'https://graph.facebook.com/v18.0/oauth/access_token',
        clientId: Deno.env.get('FACEBOOK_CLIENT_ID') || '',
        clientSecret: Deno.env.get('FACEBOOK_CLIENT_SECRET') || '',
      };
    default:
      return null;
  }
}

function supabaseAdmin() {
  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(url, key);
}

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const provider = (url.searchParams.get('provider') || '').toLowerCase();
    const code = url.searchParams.get('code') || '';
    const stateRaw = url.searchParams.get('state') || '';
    const state = b64urlDecode(stateRaw);
    const redirect = state?.r || '/settings.html?tab=account#linked';
    const userKey = state?.k || '';
    const cfg = providerTokenConfig(provider);
    if (!provider || !cfg || !cfg.clientId || !cfg.clientSecret) {
      return new Response('Invalid provider', { status: 400 });
    }
    const projectRef = new URL(req.url).host.split('.functions.supabase.co')[0];
    const redirectUri = `https://${projectRef}.functions.supabase.co/oauth-callback`;

    // Exchange code -> tokens (provider-specific payloads)
    const body = new URLSearchParams();
    body.set('client_id', cfg.clientId);
    body.set('client_secret', cfg.clientSecret);
    body.set('redirect_uri', redirectUri);
    body.set('grant_type', 'authorization_code');
    body.set('code', code);

    const tokenResp = await fetch(cfg.tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    const tokenJson = await tokenResp.json().catch(()=>({}));
    if (!tokenResp.ok) {
      console.error('Token exchange failed', tokenJson);
      return Response.redirect(`${redirect}&connected=0&provider=${provider}`, 302);
    }

    const access = tokenJson.access_token || tokenJson.accessToken || '';
    const refresh = tokenJson.refresh_token || tokenJson.refreshToken || '';
    const expiresIn = tokenJson.expires_in ? Number(tokenJson.expires_in) : null;
    const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;

    // Ensure users row exists from userKey
    const supa = supabaseAdmin();
    let { data: u } = await supa.from('users').select('id').eq('user_key', userKey).maybeSingle();
    if (!u) {
      const ins = await supa.from('users').insert([{ user_key: userKey, provider: userKey.startsWith('clerk:') ? 'clerk' : 'other' }]).select('id').single();
      u = ins.data;
    }
    const ownerId = u?.id;

    // Upsert social link
    const link = {
      owner_user_id: ownerId,
      provider,
      remote_user_id: null,
      remote_username: null,
      access_token: access,
      refresh_token: refresh || null,
      expires_at: expiresAt,
      scope: tokenJson.scope || null,
      meta: tokenJson,
    } as Record<string, unknown>;

    await supa.from('social_links').upsert([link], { onConflict: 'owner_user_id,provider' });

    return Response.redirect(`${redirect}&connected=1&provider=${provider}`, 302);
  } catch (e) {
    console.error('OAuth callback error', e);
    return new Response('Error', { status: 500 });
  }
});
