// Supabase Edge Function: oauth-start
// Deno runtime
// Starts OAuth flow for a given provider by redirecting to provider authorize URL.
// Query: ?provider=xxx&state=base64url({ k: user_key, t: ts, r: redirect_url })&site=<SITE_URL>

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

function b64urlDecode(s: string) {
  try { return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0)))); } catch { return {}; }
}

function providerConfig(provider: string) {
  const p = provider.toLowerCase();
  switch (p) {
    case 'youtube':
      return {
        authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        clientId: Deno.env.get('YOUTUBE_CLIENT_ID') || Deno.env.get('GOOGLE_CLIENT_ID') || '',
        scope: 'https://www.googleapis.com/auth/youtube.upload openid email profile',
        responseType: 'code',
      };
    case 'instagram':
      return {
        authUrl: 'https://api.instagram.com/oauth/authorize',
        clientId: Deno.env.get('INSTAGRAM_CLIENT_ID') || '',
        scope: 'user_profile,user_media',
        responseType: 'code',
      };
    case 'x':
    case 'twitter':
      return {
        authUrl: 'https://twitter.com/i/oauth2/authorize',
        clientId: Deno.env.get('TWITTER_CLIENT_ID') || Deno.env.get('X_CLIENT_ID') || '',
        scope: 'tweet.read tweet.write users.read offline.access',
        responseType: 'code',
      };
    case 'tiktok':
      return {
        authUrl: 'https://www.tiktok.com/v2/auth/authorize/',
        clientId: Deno.env.get('TIKTOK_CLIENT_ID') || '',
        scope: 'user.info.basic,video.upload',
        responseType: 'code',
      };
    case 'facebook':
      return {
        authUrl: 'https://www.facebook.com/v18.0/dialog/oauth',
        clientId: Deno.env.get('FACEBOOK_CLIENT_ID') || '',
        scope: 'public_profile,pages_show_list,pages_read_engagement,pages_manage_posts,pages_read_user_content',
        responseType: 'code',
      };
    default:
      return null;
  }
}

serve(async (req) => {
  const url = new URL(req.url);
  const provider = (url.searchParams.get('provider') || '').toLowerCase();
  const state = url.searchParams.get('state') || '';
  const site = url.searchParams.get('site') || '';
  const cfg = providerConfig(provider);
  if (!provider || !cfg || !cfg.clientId) {
    return new Response('Invalid provider', { status: 400 });
  }
  const callbackBase = new URL(req.url).origin.replace('.functions.supabase.co', '.supabase.co');
  const projectRef = callbackBase.split('https://')[1]?.split('.supabase.co')[0] || '';
  const redirectUri = `https://${projectRef}.functions.supabase.co/oauth-callback`;
  const params = new URLSearchParams();
  params.set('client_id', cfg.clientId);
  params.set('redirect_uri', redirectUri);
  params.set('response_type', cfg.responseType);
  params.set('scope', cfg.scope);
  params.set('state', state);
  // Provider-specific extras
  if (provider === 'instagram') params.set('enable_fb_login', '1');
  if (provider === 'x' || provider === 'twitter') params.set('code_challenge_method', 'plain');
  // We omit code challenge generation for brevity
  const authUrl = `${cfg.authUrl}?${params.toString()}`;
  return Response.redirect(authUrl, 302);
});
