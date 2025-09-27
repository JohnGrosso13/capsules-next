// Minimal Capsules dev server with AI prompter actions (theme, navigation, capsule select)
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { clerkMiddleware, getAuth } = require('@clerk/express');

require('dotenv').config();
try { require('dotenv').config({ path: path.join(__dirname, '.env.local') }); } catch (_) {}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({ crossOriginResourcePolicy: false, contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

const CLERK_PUBLISHABLE_KEY = process.env.CLERK_PUBLISHABLE_KEY || '';
const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY || process.env.CLERK_API_KEY || '';
const CLERK_ENABLED = !!(CLERK_PUBLISHABLE_KEY && CLERK_SECRET_KEY);

if (CLERK_ENABLED) {
  app.use(clerkMiddleware());
} else {
  console.warn('[Clerk] CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY not fully configured; authenticated routes will require guest fallback.');
}

function getRequestAuth(req) {
  if (!CLERK_ENABLED || !req) return null;
  try {
    if (req.__clerkAuthCached) return req.__clerkAuthCached;
    let authResult = null;
    if (typeof req.auth === 'function') authResult = req.auth();
    else authResult = getAuth(req);
    req.__clerkAuthCached = authResult;
    return authResult;
  } catch (_) {
    return null;
  }
}

const OPENAI_API_KEY = process.env.OPENAI_API_KEY
  || process.env.OPENAI_KEY
  || process.env.OPENAI_SECRET_KEY
  || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';
const OPENAI_TRANSCRIBE_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL
  || process.env.OPENAI_TRANSCRIPTION_MODEL
  || process.env.OPENAI_WHISPER_MODEL
  || '';
// Quality override for testing/dev. Accepts: 'low' | 'standard' | 'high' (maps to OpenAI params)
const OPENAI_IMAGE_QUALITY_OVERRIDE = (process.env.OPENAI_IMAGE_QUALITY || process.env.IMAGE_QUALITY_OVERRIDE || process.env.AI_IMAGE_QUALITY || process.env.TEST_IMAGE_QUALITY || '').toLowerCase();
const OPENAI_IMAGE_SIZE = process.env.OPENAI_IMAGE_SIZE || '1024x1024';
const OPENAI_IMAGE_SIZE_LOW = process.env.OPENAI_IMAGE_SIZE_LOW || '512x512';

// Supabase (server-side)
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  || process.env.SUPABASE_SERVICE_ROLE
  || process.env.SUPABASE_SECRET
  || process.env.SUPABASE_KEY
  || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY
  || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  || process.env.SUPABASE_KEY
  || '';
const SUPABASE_BUCKET = process.env.AI_IMAGES_BUCKET || 'ai-images';
const SITE_URL = process.env.SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : `http://localhost:${process.env.PORT || 3000}`);

let supabase = null;
try {
  if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  }
} catch (_) { supabase = null; }

function parseEnvList(...keys) {
  const values = new Set();
  keys.forEach((key) => {
    if (!key) return;
    const raw = process.env[key];
    if (!raw) return;
    raw
      .split(/[\,\n\r\s]+/)
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach((value) => values.add(value));
  });
  return Array.from(values);
}

function normalizeAdminValue(value) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  return trimmed.toLowerCase();
}

function createAdminList(...keys) {
  return parseEnvList(...keys)
    .map(normalizeAdminValue)
    .filter(Boolean);
}

const ADMIN_CONFIG = {
  ids: createAdminList('CAPSULES_ADMIN_IDS', 'ADMIN_USER_IDS'),
  keys: createAdminList('CAPSULES_ADMIN_KEYS', 'ADMIN_USER_KEYS', 'ADMIN_KEYS'),
  emails: createAdminList('CAPSULES_ADMIN_EMAILS', 'ADMIN_EMAILS'),
};

function hasAdminPrivilegesConfigured() {
  return ADMIN_CONFIG.ids.length > 0
    || ADMIN_CONFIG.keys.length > 0
    || ADMIN_CONFIG.emails.length > 0;
}
function getOAuthProviderConfig(provider) {
  const p = (provider || '').toLowerCase();
  switch (p) {
    case 'youtube': {
      const clientId = process.env.YOUTUBE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '';
      const clientSecret = process.env.YOUTUBE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || '';
      if (!clientId || !clientSecret) throw new Error('YOUTUBE client credentials not configured');
      return {
        authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        params: {
          client_id: clientId,
          response_type: 'code',
          scope: 'https://www.googleapis.com/auth/youtube.upload openid email profile',
          access_type: 'offline',
          include_granted_scopes: 'true',
          prompt: 'consent'
        },
        tokenUrl: 'https://oauth2.googleapis.com/token',
        clientId,
        clientSecret,
      };
    }
    case 'instagram': {
      const clientId = process.env.INSTAGRAM_CLIENT_ID || '';
      const clientSecret = process.env.INSTAGRAM_CLIENT_SECRET || '';
      if (!clientId || !clientSecret) throw new Error('INSTAGRAM client credentials not configured');
      return {
        authUrl: 'https://api.instagram.com/oauth/authorize',
        params: {
          client_id: clientId,
          response_type: 'code',
          scope: 'user_profile,user_media'
        },
        tokenUrl: 'https://api.instagram.com/oauth/access_token',
        clientId,
        clientSecret,
      };
    }
    case 'x':
    case 'twitter': {
      const clientId = process.env.TWITTER_CLIENT_ID || process.env.X_CLIENT_ID || '';
      const clientSecret = process.env.TWITTER_CLIENT_SECRET || process.env.X_CLIENT_SECRET || '';
      if (!clientId || !clientSecret) throw new Error('Twitter/X client credentials not configured');
      return {
        authUrl: 'https://twitter.com/i/oauth2/authorize',
        params: {
          client_id: clientId,
          response_type: 'code',
          scope: 'tweet.read tweet.write users.read offline.access',
          code_challenge_method: 'plain',
        },
        tokenUrl: 'https://api.twitter.com/2/oauth2/token',
        clientId,
        clientSecret,
        requiresVerifier: true,
      };
    }
    case 'tiktok': {
      const clientId = process.env.TIKTOK_CLIENT_ID || '';
      const clientSecret = process.env.TIKTOK_CLIENT_SECRET || '';
      if (!clientId || !clientSecret) throw new Error('TikTok client credentials not configured');
      return {
        authUrl: 'https://www.tiktok.com/v2/auth/authorize/',
        params: {
          client_key: clientId,
          response_type: 'code',
          scope: 'user.info.basic,video.upload'
        },
        tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
        clientId,
        clientSecret,
      };
    }
    case 'facebook': {
      const clientId = process.env.FACEBOOK_CLIENT_ID || '';
      const clientSecret = process.env.FACEBOOK_CLIENT_SECRET || '';
      if (!clientId || !clientSecret) throw new Error('Facebook client credentials not configured');
      return {
        authUrl: 'https://www.facebook.com/v18.0/dialog/oauth',
        params: {
          client_id: clientId,
          response_type: 'code',
          scope: 'public_profile,pages_show_list,pages_read_engagement,pages_manage_posts,pages_read_user_content'
        },
        tokenUrl: 'https://graph.facebook.com/v18.0/oauth/access_token',
        clientId,
        clientSecret,
      };
    }
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

function encodeState(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function decodeState(state) {
  try {
    return JSON.parse(Buffer.from(String(state || ''), 'base64url').toString('utf8'));
  } catch (_) {
    return null;
  }
}

async function upsertSocialLink({ ownerId, provider, remoteUserId, remoteUsername, tokens }) {
  const row = {
    owner_user_id: ownerId,
    provider,
    remote_user_id: remoteUserId || null,
    remote_username: remoteUsername || null,
    access_token: tokens.access_token || tokens.accessToken || null,
    refresh_token: tokens.refresh_token || tokens.refreshToken || null,
    expires_at: tokens.expires_at || null,
    scope: tokens.scope || null,
    meta: tokens,
  };
  const { error } = await supabase
    .from('social_links')
    .upsert([row], { onConflict: 'owner_user_id,provider' });
  if (error) throw error;
}

function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
}

function extFromContentType(ct) {
  const m = String(ct||'').toLowerCase();
  if (m.includes('png')) return 'png';
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
  if (m.includes('webp')) return 'webp';
  if (m.includes('gif')) return 'gif';
  if (m.includes('svg')) return 'svg';
  if (m.includes('mp4')) return 'mp4';
  if (m.includes('webm')) return 'webm';
  return 'bin';
}

async function uploadBufferToSupabase(buf, contentType, filenameHint) {
  requireSupabase();
  const ts = new Date();
  const y = ts.getUTCFullYear();
  const m = String(ts.getUTCMonth()+1).padStart(2,'0');
  const d = String(ts.getUTCDate()).padStart(2,'0');
  const ext = extFromContentType(contentType);
  const base = (filenameHint || 'image').replace(/[^a-z0-9_\-]/gi,'').slice(0,40) || 'image';
  const key = `generated/${y}/${m}/${d}/${base}-${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
  const { error } = await supabase.storage.from(SUPABASE_BUCKET).upload(key, buf, { contentType, upsert: false });
  if (error) throw error;
  const pub = supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(key);
  let url = pub && pub.data && pub.data.publicUrl ? pub.data.publicUrl : null;
  if (!url) {
    const signed = await supabase.storage.from(SUPABASE_BUCKET).createSignedUrl(key, 60*60*24*365);
    url = signed && signed.data && signed.data.signedUrl ? signed.data.signedUrl : null;
  }
  return { url, key };
}

async function storeImageSrcToSupabase(src, filenameHint) {
  // src may be data: URI or an http(s) URL
  if (!src) throw new Error('No image source provided');
  if (/^data:/i.test(src)) {
    const m = src.match(/^data:([^;]+);base64,(.*)$/i);
    if (!m) throw new Error('Invalid data URI');
    const contentType = m[1] || 'image/png';
    const b64 = m[2] || '';
    const buf = Buffer.from(b64, 'base64');
    return uploadBufferToSupabase(buf, contentType, filenameHint);
  }
  // Fetch remote URL and upload
  const response = await fetch(src);
  if (!response.ok) throw new Error(`Failed to fetch remote image (${response.status})`);
  const arrayBuf = await response.arrayBuffer();
  const buf = Buffer.from(arrayBuf);
  const contentType = response.headers.get('content-type') || 'image/png';
  return uploadBufferToSupabase(buf, contentType, filenameHint);
}

// ---- Feed summary helpers ----
const feedSummarySchema = {
  name: 'FeedSummary',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['message'],
    properties: {
      message: { type: 'string' },
      bullets: { type: 'array', items: { type: 'string' } },
      next_actions: { type: 'array', items: { type: 'string' } },
      suggested_title: { type: 'string' },
      suggested_post_prompt: { type: 'string' },
    },
  },
};

async function summarizeFeedFromDB({ capsuleId, limit = 30 }) {
  requireSupabase();
  let q = supabase
    .from('posts_view')
    .select('id,kind,content,media_url,media_prompt,user_name,capsule_id,created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (capsuleId) q = q.eq('capsule_id', capsuleId);
  const { data, error } = await q;
  if (error) throw error;
  const posts = (data || []).map(p => ({
    id: p.id,
    kind: p.kind,
    content: p.content || '',
    media: Boolean(p.media_url),
    media_prompt: p.media_prompt || null,
    user: p.user_name || null,
    created_at: p.created_at,
  }));

  const { content } = await callOpenAIChat([
    { role: 'system', content: 'You are Capsules AI. Summarize a feed of user posts concisely and helpfully. Keep it friendly, specific, and short. Mention image themes briefly. Also provide one relevant post idea for the user to publish next.' },
    { role: 'user', content: JSON.stringify({ capsule_id: capsuleId || null, posts }) },
  ], feedSummarySchema, { temperature: 0.5 });
  let parsed = extractJSON(content) || {};
  const message = (parsed.message || '').trim() || 'Here is a brief summary of recent activity.';
  let suggestionTitle = (parsed.suggested_title || '').trim();
  let suggestionPrompt = (parsed.suggested_post_prompt || '').trim();

  // Fallback: derive a suggestion if missing
  if (!suggestionPrompt) {
    try {
      const { content: c2 } = await callOpenAIChat([
        { role: 'system', content: 'Given a feed summary, propose a single relevant post idea. Return JSON with suggested_title and suggested_post_prompt fields. Keep the prompt one sentence.' },
        { role: 'user', content: JSON.stringify({ summary: message, bullets: parsed.bullets || [] }) },
      ], {
        name: 'SuggestionOnly',
        schema: { type: 'object', additionalProperties: false, required: ['suggested_post_prompt'], properties: { suggested_title: { type: 'string' }, suggested_post_prompt: { type: 'string' } } },
      }, { temperature: 0.6 });
      const p2 = extractJSON(c2) || {};
      suggestionTitle = (p2.suggested_title || suggestionTitle || '').trim();
      suggestionPrompt = (p2.suggested_post_prompt || '').trim();
    } catch(_){}
  }

  return { message, bullets: parsed.bullets || [], next_actions: parsed.next_actions || [], suggestion: { title: suggestionTitle || null, prompt: suggestionPrompt || null } };
}

class AIConfigError extends Error {
  constructor(message) {
    super(message);
    this.code = 'AI_CONFIG_ERROR';
  }
}

function requireOpenAIKey() {
  if (!OPENAI_API_KEY) {
    throw new AIConfigError('OpenAI API key is not configured. Set OPENAI_API_KEY in the environment.');
  }
}

function extractJSON(maybeJSONString) {
  try { return JSON.parse(maybeJSONString); } catch (_) {}
  try {
    const s = String(maybeJSONString || '');
    // strip code fences if present
    const fenced = s.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
    return JSON.parse(fenced);
  } catch (_) {}
  try {
    const s = String(maybeJSONString || '');
    const start = s.indexOf('{');
    const end = s.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(s.slice(start, end + 1));
    }
  } catch (_) {}
  return null;
}

async function callOpenAIChat(messages, schema, options = {}) {
  requireOpenAIKey();

  const body = {
    model: OPENAI_MODEL,
    messages,
    temperature: options.temperature ?? 0.7,
  };

  // Prefer structured output; if unsupported we'll fall back below
  if (schema) body.response_format = { type: 'json_schema', json_schema: schema };
  else body.response_format = { type: 'json_object' };

  let response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  let json = await response.json().catch(() => ({}));
  if (!response.ok) {
    // Fallback: retry without response_format (some routes/models reject it)
    const fallbackBody = { model: OPENAI_MODEL, messages, temperature: options.temperature ?? 0.7 };
    response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify(fallbackBody),
    });
    json = await response.json().catch(() => ({}));
    if (!response.ok) {
      const err = new Error(`OpenAI chat error: ${response.status}`);
      err.meta = json;
      throw err;
    }
  }
  const content = json?.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenAI chat returned empty content.');
  return { content, raw: json };
}

function parseBase64Audio(input, fallbackMime) {
  if (!input || typeof input !== 'string') {
    throw new Error('audio_base64 is required');
  }
  let base64 = input.trim();
  let detectedMime = fallbackMime || '';
  const dataUrlMatch = base64.match(/^data:([^;,]+)(?:;[^,]*)?,/i);
  if (dataUrlMatch) {
    detectedMime = detectedMime || dataUrlMatch[1];
    base64 = base64.slice(dataUrlMatch[0].length);
  }
  const buffer = Buffer.from(base64, 'base64');
  const mime = detectedMime || fallbackMime || 'audio/webm';
  return { buffer, mime };
}

function audioExtensionFromMime(mime) {
  const value = String(mime || '').toLowerCase();
  if (value.includes('ogg')) return 'ogg';
  if (value.includes('mp3')) return 'mp3';
  if (value.includes('mpeg')) return 'mp3';
  if (value.includes('mp4')) return 'mp4';
  if (value.includes('wav')) return 'wav';
  if (value.includes('m4a')) return 'm4a';
  return 'webm';
}

async function transcribeAudioFromBase64({ audioBase64, mime }) {
  requireOpenAIKey();
  const { buffer, mime: resolvedMime } = parseBase64Audio(audioBase64, mime);
  const blob = new Blob([buffer], { type: resolvedMime || 'audio/webm' });
  const filename = `recording.${audioExtensionFromMime(resolvedMime)}`;
  const models = Array.from(new Set([
    OPENAI_TRANSCRIBE_MODEL,
    'gpt-4o-mini-transcribe',
    'whisper-1',
  ].filter(Boolean)));

  let lastError = null;
  for (const model of models) {
    try {
      const fd = new FormData();
      fd.append('file', blob, filename);
      fd.append('model', model);
      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
        body: fd,
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        const err = new Error(json?.error?.message || `OpenAI transcription error: ${response.status}`);
        err.meta = json;
        err.status = response.status;
        lastError = err;
        continue;
      }
      const text = (json?.text || json?.transcript || '').toString();
      return { text, raw: json, model };
    } catch (err) {
      lastError = err;
    }
  }

  if (lastError) throw lastError;
  throw new Error('Transcription failed');
}

function resolveImageParams(options = {}) {
  let quality = options.quality || 'standard';
  let size = options.size || OPENAI_IMAGE_SIZE;
  const isNonProd = (process.env.NODE_ENV || '').toLowerCase() !== 'production';
  // If explicitly requested low quality via env (or in non-prod without explicit override), force small size
  if (OPENAI_IMAGE_QUALITY_OVERRIDE === 'low' || (isNonProd && OPENAI_IMAGE_QUALITY_OVERRIDE !== 'standard' && OPENAI_IMAGE_QUALITY_OVERRIDE !== 'high')) {
    // OpenAI does not support a literal 'low' quality flag; emulate with smaller size and standard quality
    quality = 'standard';
    size = OPENAI_IMAGE_SIZE_LOW;
  } else if (OPENAI_IMAGE_QUALITY_OVERRIDE === 'high') {
    quality = 'hd'; // map to HD for DALLE/gpt-image endpoints
  } else if (OPENAI_IMAGE_QUALITY_OVERRIDE === 'standard') {
    quality = 'standard';
  }
  return { size, quality };
}

async function generateImageFromPrompt(prompt, options = {}) {
  requireOpenAIKey();
  const modelTry = async (modelName) => {
    const params = resolveImageParams(options);
    const body = { model: modelName, prompt, n: 1, size: params.size, quality: params.quality };
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify(body),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      const err = new Error(`OpenAI image error: ${response.status}`);
      err.meta = json;
      throw err;
    }
    const image = json?.data?.[0];
    if (!image) throw new Error('OpenAI image response missing data.');
    if (image.url) return image.url;
    if (image.b64_json) return `data:image/png;base64,${image.b64_json}`;
    throw new Error('OpenAI image response missing url and b64_json.');
  };
  try { return await modelTry(OPENAI_IMAGE_MODEL); }
  catch (e1) {
    try { return await modelTry('dall-e-3'); }
    catch (e2) { throw e1; }
  }
}

// Edit an existing image using OpenAI images/edits API
async function editImageWithInstruction(imageUrl, instruction, options = {}) {
  requireOpenAIKey();
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error(`Failed to fetch source image (${imgRes.status})`);
  const contentType = imgRes.headers.get('content-type') || 'image/png';
  let buf = Buffer.from(await imgRes.arrayBuffer());
  // Ensure PNG for edits (OpenAI expects PNG for edit/variation APIs)
  try {
    const Jimp = require('jimp');
    const image = await Jimp.read(buf);
    buf = await image.png().getBufferAsync('image/png');
  } catch (e) {
    console.warn('PNG conversion failed, attempting edit with original format:', e?.message);
  }
  const blob = new Blob([buf], { type: 'image/png' });
  const fd = new FormData();
  const editModelRaw = (OPENAI_IMAGE_MODEL || '').toLowerCase();
  const allowedEditModels = ['gpt-image-1','dall-e-2','gpt-image-0721-mini-alpha'];
  const modelForEdit = allowedEditModels.includes(editModelRaw) ? OPENAI_IMAGE_MODEL : 'gpt-image-1';
  fd.append('model', modelForEdit);
  fd.append('image', blob, 'image.png');
  fd.append('prompt', instruction || 'Make subtle improvements.');
  const params = resolveImageParams(options);
  if (params.size) fd.append('size', params.size);
  if (params.quality) fd.append('quality', params.quality);
  const response = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: fd,
  });
  const json = await response.json().catch(()=>({}));
  if (!response.ok) { const err = new Error(`OpenAI image edit error: ${response.status}`); err.meta = json; throw err; }
  const image = json?.data?.[0];
  if (!image) throw new Error('OpenAI image edit missing data');
  const dataUri = image.url ? image.url : (image.b64_json ? `data:image/png;base64,${image.b64_json}` : null);
  if (!dataUri) throw new Error('OpenAI image edit missing url/b64');
  const saved = await storeImageSrcToSupabase(dataUri, 'edit');
  return saved?.url || dataUri;
}

// Use GPT-4o vision to localize target region; returns array of boxes [{x,y,w,h}] normalized [0,1]
async function localizeRegionWithVision(imageUrl, instruction) {
  try {
    const body = {
      model: OPENAI_MODEL,
      messages: [
        { role: 'system', content: 'Return only JSON with normalized boxes of regions to edit. Schema: {"boxes":[{"x":0-1,"y":0-1,"w":0-1,"h":0-1}]}. Choose the single best box for the described subject.' },
        { role: 'user', content: [
          { type: 'text', text: `Identify the main region to modify for this request: ${instruction}. Return JSON only.` },
          { type: 'image_url', image_url: { url: imageUrl } }
        ]}
      ],
      temperature: 0.2,
      response_format: { type: 'json_object' }
    };
    const r = await fetch('https://api.openai.com/v1/chat/completions', { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${OPENAI_API_KEY}` }, body: JSON.stringify(body) });
    const j = await r.json().catch(()=>({}));
    const content = j?.choices?.[0]?.message?.content || '{}';
    const parsed = extractJSON(content) || {};
    const boxes = Array.isArray(parsed.boxes) ? parsed.boxes : [];
    return boxes;
  } catch (e) { console.warn('localizeRegionWithVision failed:', e?.message); return []; }
}

// Build a PNG mask with transparent edit area from normalized boxes
async function createEditMask(pngBuffer, boxes, opts={}) {
  const Jimp = require('jimp');
  const img = await Jimp.read(pngBuffer);
  const w = img.bitmap.width; const h = img.bitmap.height;
  const feather = Math.max(0, Math.min(0.2, Number(opts.feather)||0));
  const mask = new Jimp(w, h, 0xffffffff); // opaque white (protected area)
  for (const b of boxes) {
    if (!b || typeof b.x!=='number' || typeof b.y!=='number' || typeof b.w!=='number' || typeof b.h!=='number') continue;
    const x = Math.max(0, Math.min(w, Math.round((b.x - feather) * w)));
    const y = Math.max(0, Math.min(h, Math.round((b.y - feather) * h)));
    const rw = Math.max(1, Math.min(w - x, Math.round((b.w + 2*feather) * w)));
    const rh = Math.max(1, Math.min(h - y, Math.round((b.h + 2*feather) * h)));
    const transparent = Jimp.rgbaToInt(255,255,255,0);
    const region = new Jimp(rw, rh, transparent);
    mask.composite(region, x, y);
  }
  return await mask.getBufferAsync('image/png');
}

const nullableStringSchema = {
  anyOf: [
    { type: 'string' },
    { type: 'null' },
  ],
};

const creationSchema = {
  name: 'CapsulesDraftCreation',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['message', 'post'],
    properties: {
      message: { type: 'string', description: 'Short acknowledgement for the user.' },
      post: {
        type: 'object',
        additionalProperties: false,
        required: ['content'],
        properties: {
          content: { type: 'string', description: 'Complete social post copy ready for publishing.' },
          kind: { type: 'string', enum: ['text', 'image', 'video'] },
          media_prompt: nullableStringSchema,
          media_url: nullableStringSchema,
          notes: nullableStringSchema,
        },
      },
    },
  },
};

const editSchema = {
  name: 'CapsulesDraftEdit',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['message', 'post'],
    properties: {
      message: { type: 'string' },
      post: {
        type: 'object',
        additionalProperties: false,
        required: ['content'],
        properties: {
          content: { type: 'string' },
          kind: { type: 'string', enum: ['text', 'image', 'video'] },
          media_prompt: nullableStringSchema,
          media_url: nullableStringSchema,
          keep_existing_media: { type: 'boolean' },
          edit_current_media: { type: 'boolean' },
        },
      },
    },
  },
};

// Poll draft schema for structured output
const pollSchema = {
  name: 'CapsulesPollDraft',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['message', 'poll'],
    properties: {
      message: { type: 'string', description: 'Short acknowledgement for the user.' },
      poll: {
        type: 'object',
        additionalProperties: false,
        required: ['question', 'options'],
        properties: {
          question: { type: 'string' },
          options: { type: 'array', minItems: 2, maxItems: 6, items: { type: 'string' } }
        }
      }
    }
  }
};

function buildBasePost(incomingPost = {}) {
  return {
    kind: incomingPost.kind || 'text',
    content: incomingPost.content || '',
    mediaUrl: incomingPost.mediaUrl || null,
    mediaPrompt: incomingPost.mediaPrompt || null,
  };
}

async function createPostDraft(userText) {
  const imageIntent = /(image|logo|banner|thumbnail|picture|photo|icon|cover|poster|graphic|illustration|art|avatar|background)\b/i.test(userText);
  async function inferImagePromptFromInstruction(instruction) {
    const { content } = await callOpenAIChat([
      { role: 'system', content: 'You turn user instructions into a single concise image generation prompt (one sentence). Do not return anything except the prompt text.' },
      { role: 'user', content: instruction }
    ], null, { temperature: 0.7 });
    return String(content).replace(/^\s*```(?:json|text)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  }
  const messages = [
    {
      role: 'system',
      content: [
        'You are Capsules AI, an assistant that crafts polished social media posts and image prompts for community managers.',
        'Respond with JSON that follows the provided schema. Include engaging copy, actionable call-to-actions, and 1-3 relevant hashtags when appropriate.',
        'If the user requests an image, provide a vivid scene in post.media_prompt and still include post.content as the accompanying caption.',
        'Use clear, energetic but concise language.',
      ].join(' '),
    },
    {
      role: 'user',
      content: JSON.stringify({ instruction: userText }),
    },
  ];

  const { content } = await callOpenAIChat(messages, creationSchema, { temperature: 0.75 });
  let parsed = extractJSON(content);
  if (!parsed) {
    // last-resort: ask explicitly for JSON without schema
    const { content: fallbackContent } = await callOpenAIChat([
      { role: 'system', content: 'Return only minified JSON matching the expected schema (no commentary).' },
      { role: 'user', content: JSON.stringify({ instruction: userText }) },
    ], null, { temperature: 0.7 });
    parsed = extractJSON(fallbackContent) || {};
  }

  const postResponse = parsed.post || {};
  const statusMessage = (parsed.message || "Here's a draft.").trim();

  const result = buildBasePost();
  result.content = (postResponse.content || '').trim();

  const requestedKind = postResponse.kind;
  let imagePrompt = postResponse.media_prompt || null;
  let mediaUrl = postResponse.media_url || null;

  if (imagePrompt && !imagePrompt.trim()) imagePrompt = null;
  if (mediaUrl && !String(mediaUrl).trim()) mediaUrl = null;

  if (mediaUrl) {
    result.mediaUrl = mediaUrl;
    result.mediaPrompt = imagePrompt || result.mediaPrompt;
    result.kind = requestedKind || 'image';
  } else if (imagePrompt) {
    try {
      result.mediaUrl = await generateImageFromPrompt(imagePrompt);
      result.kind = 'image';
      result.mediaPrompt = imagePrompt;
    } catch (err) {
      console.error('Image generation failed for composer prompt:', err);
      result.kind = requestedKind || 'text';
      imagePrompt = null;
    }
  } else if (!imagePrompt && imageIntent) {
    try { imagePrompt = await inferImagePromptFromInstruction(userText); } catch(_){}
    if (imagePrompt) {
      try { result.mediaUrl = await generateImageFromPrompt(imagePrompt); result.kind = 'image'; result.mediaPrompt = imagePrompt; }
      catch (e) { console.error('Image generation failed (intent path):', e); }
    }
  } else if (requestedKind) {
    result.kind = requestedKind;
  } else {
    result.kind = result.mediaUrl ? 'image' : 'text';
  }

  if (!result.mediaUrl) {
    result.mediaPrompt = null;
  }

  if (!result.content && result.mediaUrl) {
    result.content = 'Here is the new visual. Let me know if you want changes to the copy!';
  }

  // If we generated or were given an image URL, persist it to Supabase storage
  try {
    if (result && result.mediaUrl && /^https?:|^data:/i.test(String(result.mediaUrl))) {
      const saved = await storeImageSrcToSupabase(result.mediaUrl, 'generate');
      if (saved && saved.url) result.mediaUrl = saved.url;
    }
  } catch (e) { console.warn('Supabase store (create) failed:', e.message); }

  return { action: 'draft_post', message: statusMessage, post: result };
}

async function createPollDraft(userText, hint = {}) {
  const system = [
    'You are Capsules AI. Create a concise poll from the user instruction.',
    'Return JSON with a friendly message and a poll containing a question and 2-6 short, distinct options.',
    'Derive specific options from the topic (e.g., days of the week, product names); do not default to Yes/No unless explicitly requested.',
    'Keep options succinct (1-3 words when possible).'
  ].join(' ');

  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: JSON.stringify({ instruction: userText, seed: hint || {} }) }
  ];
  const { content } = await callOpenAIChat(messages, pollSchema, { temperature: 0.5 });
  let parsed = extractJSON(content) || {};
  let question = (parsed?.poll?.question || hint.question || '').toString().trim();
  let options = Array.isArray(parsed?.poll?.options) ? parsed.poll.options.map(s=>String(s||'').trim()).filter(Boolean) : [];
  if (!question) question = 'What do you think?';
  if (!options.length && Array.isArray(hint.options)) options = hint.options.map(s=>String(s||'').trim()).filter(Boolean);
  if (!options.length) options = ['Yes', 'No'];
  options = Array.from(new Set(options)).slice(2, 7).length ? Array.from(new Set(options)).slice(0, 6) : options.slice(0, 6);
  const message = (parsed.message || 'I drafted a poll. Tweak anything you like.').toString();
  return { message, poll: { question, options } };
}

async function refinePostDraft(userText, incomingPost) {
  const base = buildBasePost(incomingPost);
  const messages = [
    {
      role: 'system',
      content: [
        'You are Capsules AI, helping a user refine an in-progress social media post.',
        'Output JSON per the provided schema. Update post.content to reflect the new instruction.',
        'If the user requests new imagery, provide a short, concrete description via post.media_prompt. Lean on the current media description when the edit should be a remix rather than a brand new visual.',
        'If the user wants adjustments to the existing image, set post.edit_current_media to true and combine the current media prompt with the requested changes instead of inventing an unrelated scene.',
        'Keep tone consistent with the instruction and the existing copy.',
      ].join(' '),
    },
    {
      role: 'user',
      content: JSON.stringify({
        instruction: userText,
        current_post: {
          kind: base.kind,
          content: base.content,
          has_media: Boolean(base.mediaUrl),
          media_summary: base.mediaUrl ? 'An image is currently attached to this post.' : 'No media is currently attached.',
          media_prompt: base.mediaPrompt || null,
          media_url: base.mediaUrl || null,
        },
      }),
    },
  ];

  const { content } = await callOpenAIChat(messages, editSchema, { temperature: 0.6 });
  let parsed = extractJSON(content) || {};
  const postResponse = parsed.post || {};
  const result = buildBasePost(base);

  result.content = (postResponse.content || result.content || '').trim();

  const keepExisting = typeof postResponse.keep_existing_media === 'boolean' ? postResponse.keep_existing_media : undefined;
  const editCurrent = typeof postResponse.edit_current_media === 'boolean' ? postResponse.edit_current_media : false;
  let imagePrompt = postResponse.media_prompt || null;
  let mediaUrl = postResponse.media_url || null;

  if (imagePrompt && !imagePrompt.trim()) imagePrompt = null;
  if (mediaUrl && !String(mediaUrl).trim()) mediaUrl = null;

  if (editCurrent && base.mediaUrl) {
    try {
      const combined = [base.mediaPrompt || '', userText, imagePrompt || ''].filter(Boolean).join(' ');
      result.mediaUrl = await editImageWithInstruction(base.mediaUrl, combined, { quality: 'standard' });
      result.kind = 'image';
      result.mediaPrompt = combined;
    } catch (err) {
      console.error('Image edit failed while refining post:', err);
    }
  } else if (imagePrompt) {
    try {
      result.mediaUrl = await generateImageFromPrompt(imagePrompt, { quality: 'standard' });
      result.kind = 'image';
      result.mediaPrompt = imagePrompt;
    } catch (err) {
      console.error('Image generation failed while refining post:', err);
    }
  } else if (mediaUrl) {
    result.mediaUrl = mediaUrl;
    result.mediaPrompt = postResponse.media_prompt || base.mediaPrompt || result.mediaPrompt;
    result.kind = postResponse.kind || 'image';
  } else if (keepExisting === false) {
    result.mediaUrl = null;
    result.kind = 'text';
    result.mediaPrompt = null;
  } else if (keepExisting || (keepExisting === undefined && base.mediaUrl)) {
    result.mediaUrl = base.mediaUrl;
    result.mediaPrompt = base.mediaPrompt;
    result.kind = base.mediaUrl ? base.kind : postResponse.kind || base.kind;
  } else if (postResponse.kind) {
    result.kind = postResponse.kind;
  }

  if (!result.content) {
    result.content = base.content;
  }

  if (!result.mediaUrl) {
    result.mediaPrompt = null;
  }

  // If we have a new/generated image URL, persist it to Supabase
  try {
    if (result && result.mediaUrl && /^https?:|^data:/i.test(String(result.mediaUrl))) {
      const saved = await storeImageSrcToSupabase(result.mediaUrl, 'refine');
      if (saved && saved.url) result.mediaUrl = saved.url;
    }
  } catch (e) { console.warn('Supabase store (refine) failed:', e.message); }

  const statusMessage = (parsed.message || 'Updated the draft.').trim();

  return { action: 'draft_post', message: statusMessage, post: result };
}

// No-cache in dev
if (process.env.NODE_ENV !== 'production') {
  app.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
}

// HTML asset switcher: serve unminified in dev, minified in production
function shouldUseMinified() {
  return process.env.NODE_ENV === 'production' || process.env.ASSET_MODE === 'min' || process.env.USE_MINIFIED === '1';
}

app.use((req, res, next) => {
  try {
    const p = String(req.path || '/').replace(/\/+$/, '') || '/';
    const targets = new Map([
      ['/', 'index.html'],
      ['/index.html', 'index.html'],
      ['/create', 'create.html'],
      ['/create.html', 'create.html'],
      ['/settings', 'settings.html'],
      ['/settings.html', 'settings.html'],
      ['/capsule', 'capsule.html'],
      ['/capsule.html', 'capsule.html'],
      ['/admin', 'admin.html'],
    ]);
    const file = targets.get(p);
    if (!file) return next();
    const abs = path.join(__dirname, file);
    let html = fs.readFileSync(abs, 'utf8');
    if (shouldUseMinified()) {
      html = html.replace(/\/styles\.css/g, '/styles.min.css').replace(/\/script\.js/g, '/script.min.js');
    } else {
      html = html.replace(/\/styles\.min\.css/g, '/styles.css').replace(/\/script\.min\.js/g, '/script.js');
    }
    res.type('html').send(html);
  } catch (_) {
    next();
  }
});

// Serve static assets from src directory
app.use(express.static(__dirname));

// Health
app.get('/api/health', (_req, res) => res.json({ status: 'healthy', ts: new Date().toISOString() }));

// Public client config
app.get('/api/config', (_req, res) => {
  try {
    const supabaseConfig = (SUPABASE_URL && SUPABASE_ANON_KEY)
      ? { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY }
      : null;
    res.json({
      clerkPublishableKey: process.env.CLERK_PUBLISHABLE_KEY || '',
      supabase: supabaseConfig,
      features: { realtime: !!supabaseConfig },
    });
  } catch (e) {
    console.error('Config endpoint error:', e);
    res.status(500).json({ error: 'Failed to load config' });
  }
});

// Model info
app.get('/api/ai/model', (_req, res) => res.json({ model: OPENAI_MODEL }));

// AI prompter endpoint with lightweight intent handling
app.post('/api/ai/prompt', async (req, res) => {
  try {
    const text = String((req.body && req.body.message) || '').trim();
    const incomingPost = (req.body && req.body.post) ? req.body.post : null;
    const options = (req.body && req.body.options) || {};
    const capsuleId = (req.body && req.body.capsuleId) ? String(req.body.capsuleId) : null;
    if (!text) return res.status(400).json({ error: 'Message is required' });
    if (text.length > 2000) return res.status(400).json({ error: 'Message too long' });

    const lc = text.toLowerCase();

    // Summarize feed intent (e.g., "summarize my feed", "summarize recent posts")
    if (/\bsummariz(e|e\s+my)?\b/.test(lc) && /(feed|posts|recent|activity|capsule|this)/.test(lc)) {
      try {
        const s = await summarizeFeedFromDB({ capsuleId, limit: 30 });
        const extra = s.bullets && s.bullets.length ? ('\n\nHighlights:\n- ' + s.bullets.slice(0,5).join('\n- ')) : '';
        return res.json({ action: 'summary', message: s.message + extra, suggestion: s.suggestion || null });
      } catch (e) {
        console.error('Feed summary error:', e);
        return res.json({ action: 'summary', message: 'I could not load recent posts to summarize right now.' });
      }
    }

    // Theme
    if (/(light\s*mode|switch\s*to\s*light|bright(er)?|white\s*theme)/.test(lc) || /(dark\s*mode|switch\s*to\s*dark|darker|night\s*mode)/.test(lc)) {
      const wantsLight = /(light\s*mode|switch\s*to\s*light|bright(er)?|white\s*theme)/.test(lc);
      return res.json({ action: 'set_theme', value: wantsLight ? 'light' : 'dark', message: `Okay  switched to ${wantsLight ? 'light' : 'dark'} mode.` });
    }

    // Poll creation intent (client may hint via options.prefer === 'poll')
    const preferPoll = (options && (options.prefer === 'poll' || options.type === 'poll')) || /(\\bpoll\\b|\\bsurvey\\b|\\bvote\\b|\\bwhich\\b|\\bchoose\\b|would you rather)/.test(lc);
    if (preferPoll) {
      try {
        const seed = (options && options.poll_hint) || {};
        const d = await createPollDraft(text, seed);
        const post = buildBasePost();
        post.kind = 'poll';
        post.content = '';
        post.poll = { question: d.poll.question, options: d.poll.options };
        return res.json({ action: 'draft_post', message: d.message, post });
      } catch (e) {
        console.error('Poll draft error:', e);
        // fall through to generic post creation
      }
    }

    // Navigation and capsule select
    const hasNavVerb = /(go\s+to|navigate\s+to|open|take\s+me\s+to|switch\s+to|bring\s+me\s+to|take\s+me|go\b|navigate\b)/.test(lc);
    if (hasNavVerb || /\b(home|homepage|landing|create|capsule|admin|back|previous)\b/.test(lc)) {
      if (/\bcapsule\b/.test(lc)) {
        const nameExtractors = [
          /["']([^"']{1,40})["']\s+capsule/i,
          /\bcapsule\s+named\s+["']?([A-Za-z0-9][A-Za-z0-9 _-]{0,40})["']?/i,
          /\b(?:my|the|go\s+to|open|bring\s+me\s+to|take\s+me\s+to)\s+([A-Za-z0-9][A-Za-z0-9 _-]{0,40})\s+capsule\b/i
        ];
        let capName = null; for (const re of nameExtractors) { const m = text.match(re); if (m && m[1]) { capName = m[1].trim(); break; } }
        if (capName && capName.toLowerCase() !== 'my' && capName.toLowerCase() !== 'a') {
          return res.json({ action: 'select_capsule', value: capName, message: `Opening "${capName}" capsule.` });
        }
        return res.json({ action: 'navigate', value: '/capsule', message: 'Opening Capsule.' });
      }
      if (/\b(back|previous)\b/.test(lc)) return res.json({ action: 'navigate', value: 'back', message: 'Going back.' });
      if (/\b(home|homepage|landing|start)\b/.test(lc)) return res.json({ action: 'navigate', value: '/', message: 'Opening Home.' });
      if (/\bcreate(\s*page)?\b/.test(lc) && !/\bpost\b/.test(lc)) return res.json({ action: 'navigate', value: '/create', message: 'Opening Create.' });
      if (/\badmin\b/.test(lc)) return res.json({ action: 'navigate', value: '/admin', message: 'Opening Admin.' });
    }
    // Capsule creation intent: draft a new Capsule with starter suggestions
    if (/(create|make|start|set\s*up)\s+(a\s+)?capsule/.test(lc) || /\bnew\s+capsule\b/.test(lc)) {
      // Extract optional capsule name and AI name
      let capName = null; let aiName = null;
      try {
        const m1 = text.match(/(?:called|named)\s+\"?([A-Za-z0-9][A-Za-z0-9 _-]{1,40})\"?/i); if (m1) capName = m1[1];
        const m2 = text.match(/ai\s+(?:called|named)\s+\"?([A-Za-z][A-Za-z0-9 _-]{1,30})\"?/i); if (m2) aiName = m2[1];
        const m3 = text.match(/["?'?]([^"?'?]{1,40})["?'?]\s+capsule/i); if (!capName && m3) capName = m3[1];
      } catch(_){}
      const suggestions = ["Try a new name", "Make me a logo", "Switch my AI's name"];
      return res.json({ action: 'create_capsule', value: null, message: "Here's a starting point. Tweak anything you like and publish.", capsule: { name: capName || "My Capsule", aiName: aiName || "Assistant", bannerUrl: "", logoUrl: "", suggestions } });
    }

    if (incomingPost) {
      const hasImage = Boolean(incomingPost.mediaUrl);
      const editIntent = /(edit|adjust|tweak|modify|change|remix|variation|variations|replace|remove background|replace background|crop|recolor|colorize|recolour|brighten|darken|make\b)/i.test(lc);
      const wantsNew = /(new|another|brand new|fresh|different image|generate)/i.test(lc);
      if (hasImage && editIntent && !options.force) {
        return res.json({ action: 'confirm_edit_choice', message: 'Do you want me to edit the current image or create a new image based on your request?', choices: [ { key: 'edit_current', label: 'Edit current image' }, { key: 'new_image', label: 'Create new image' } ] });
      }
      if (options.force === 'edit_current' && hasImage) {
        try {
          const base = buildBasePost(incomingPost);
          const combined = [base.mediaPrompt || '', text].filter(Boolean).join(' ');
          const editedUrl = await editImageWithInstruction(incomingPost.mediaUrl, combined, { size: '1024x1024' });
          const result = buildBasePost(base);
          result.kind = 'image';
          result.mediaUrl = editedUrl;
          result.content = base.content || 'Updated the image as requested.';
          result.mediaPrompt = combined || null;
          return res.json({ action: 'draft_post', message: 'Edited the current image.', post: result });
        } catch (e) { console.error('Edit current image failed:', e); }
      }
      if (options.force === 'new_image' || wantsNew) {
        try {
          const url = await generateImageFromPrompt(text, { quality: 'standard' });
          const result = buildBasePost(incomingPost);
          result.kind = 'image';
          result.mediaUrl = url;
          result.mediaPrompt = text;
          result.content = result.content || 'Here is a new visual.';
          return res.json({ action: 'draft_post', message: 'Created a new image.', post: result });
        } catch (e) { console.error('Generate new image (forced) failed:', e); }
      }
      const responsePayload = await refinePostDraft(text, incomingPost);
      return res.json(responsePayload);
    }

    const responsePayload = await createPostDraft(text);
    return res.json(responsePayload);
  } catch (e) {
    console.error('AI prompt error:', e);
    if (e instanceof AIConfigError) {
      return res.status(500).json({ error: e.message });
    }
    if (e?.meta) {
      console.error('OpenAI error meta:', e.meta);
  }
    return res.status(500).json({ error: 'Failed to process AI request. Please try again.' });
  }
});

app.post('/api/ai/transcribe', async (req, res) => {
  try {
    const body = req.body || {};
    const audioBase64 = typeof body.audio_base64 === 'string' && body.audio_base64.trim()
      ? body.audio_base64.trim()
      : (typeof body.audioBase64 === 'string' ? body.audioBase64.trim() : '');
    if (!audioBase64) {
      return res.status(400).json({ error: 'audio_base64 is required' });
    }
    const mime = typeof body.mime === 'string' && body.mime ? body.mime : null;
    const result = await transcribeAudioFromBase64({ audioBase64, mime });
    return res.json({
      text: result.text || '',
      model: result.model || null,
      raw: result.raw || null,
    });
  } catch (e) {
    if (e instanceof AIConfigError) {
      return res.status(500).json({ error: e.message });
    }
    const status = Number.isInteger(e?.status) ? e.status : 500;
    console.error('Transcription endpoint error:', e);
    if (e?.meta) console.error('Transcription endpoint meta:', e.meta);
    const payload = { error: e?.message || 'Transcription failed.' };
    if (e?.meta) payload.meta = e.meta;
    return res.status(status).json(payload);
  }
});

// Persist a post record to Supabase DB
async function persistPostToDB(post) {
  requireSupabase();
  const now = new Date().toISOString();
  const row = {
    client_id: String(post.id || ''),
    kind: String(post.kind || 'text'),
    content: String(post.content || ''),
    created_at: post.ts || now,
    updated_at: now,
    source: String(post.source || 'web'),
  };

  if (typeof post.mediaUrl === 'string' && post.mediaUrl.trim()) {
    row.media_url = post.mediaUrl.trim();
  }
  if (typeof post.mediaPrompt === 'string' && post.mediaPrompt.trim()) {
    row.media_prompt = post.mediaPrompt.trim();
  }
  if (typeof post.userName === 'string' && post.userName.trim()) {
    row.user_name = post.userName.trim();
  }
  if (typeof post.userAvatar === 'string' && post.userAvatar.trim()) {
    row.user_avatar = post.userAvatar.trim();
  }
  if (typeof post.capsuleId === 'string' && post.capsuleId.trim()) {
    row.capsule_id = post.capsuleId.trim();
  }
  // Tags: accept array of strings; normalize to lowercase, simple charset, unique, max 10
  if (Array.isArray(post.tags)) {
    try {
      const norm = Array.from(new Set(post.tags
        .filter(t => typeof t === 'string')
        .map(t => t.trim().toLowerCase())
        .filter(Boolean)
        .map(t => t.replace(/[^a-z0-9_\-]/g, '').slice(0, 24))
        .filter(Boolean)
      ));
      if (norm.length) row.tags = norm.slice(0, 10);
    } catch(_) {}
  }
  if (post.author_user_id || post.owner_user_id || post.ownerUserId) {
    row.author_user_id = post.author_user_id || post.owner_user_id || post.ownerUserId;
  }

  // Preserve existing fields when omitted (prevents comment upserts from clearing metadata)
  let existing = null;
  try {
    if (row.client_id) {
      const existingQuery = await supabase
        .from('posts')
        .select('id, capsule_id, media_url, media_prompt, user_name, user_avatar, source, created_at')
        .eq('client_id', row.client_id)
        .is('deleted_at', null)
        .maybeSingle();
      if (!existingQuery.error) existing = existingQuery.data || null;
    }
  } catch (_) {}

  if (existing) {
    if (!row.capsule_id && existing.capsule_id) row.capsule_id = existing.capsule_id;
    if (!row.media_url && existing.media_url) row.media_url = existing.media_url;
    if (!row.media_prompt && existing.media_prompt) row.media_prompt = existing.media_prompt;
    if (!row.user_name && existing.user_name) row.user_name = existing.user_name;
    if (!row.user_avatar && existing.user_avatar) row.user_avatar = existing.user_avatar;
    if (!row.source && existing.source) row.source = existing.source;
    if (existing.created_at) row.created_at = existing.created_at;
  }

  // Only include poll when provided to avoid schema errors on projects without the column
  if (typeof post.poll !== 'undefined' && post.poll !== null) {
    row.poll = post.poll;
  }
  let q = supabase.from('posts').upsert([row], { onConflict: 'client_id' }).select('id').single();
  let { data, error } = await q;
  if (error && (String(error.message||'').includes("'poll' column") || error.code === 'PGRST204')) {
    // Retry without poll, encoding poll as media_prompt for compatibility
    const retryRow = Object.assign({}, row);
    if (typeof retryRow.poll !== 'undefined') {
      const encoded = '__POLL__' + JSON.stringify(retryRow.poll);
      retryRow.media_prompt = retryRow.media_prompt || encoded;
      delete retryRow.poll;
    }
    ({ data, error } = await supabase.from('posts').upsert([retryRow], { onConflict: 'client_id' }).select('id').single());
    if (error) throw error;
  } else if (error) {
    throw error;
  }
  return data.id;
}

// API route to create a post in DB
app.post('/api/posts', async (req, res) => {
  try {
    const post = req.body && req.body.post;
    const userPayload = mergeUserPayloadFromRequest(req, req.body && req.body.user);
    if (!post) return res.status(400).json({ error: 'post required' });
    const ownerId = await ensureUserFromClientPayload(userPayload, req);
    if (!ownerId) return res.status(401).json({ error: 'auth required' });
    post.author_user_id = ownerId;
    // If mediaUrl is a data URL or remote, ensure it is stored in Supabase storage first
    if (post.mediaUrl && /^https?:|^data:/i.test(String(post.mediaUrl))) {
      try {
        const saved = await storeImageSrcToSupabase(post.mediaUrl, 'post');
        if (saved && saved.url) post.mediaUrl = saved.url;
      } catch (e) {
        console.warn('Supabase store (post) failed:', e.message);
      }
    }
    // Index into Memory when saving a media post
    try {
      const isMediaPost = post.mediaUrl && (String(post.kind || '').toLowerCase() === 'image' || String(post.kind || '').toLowerCase() === 'video');
      if (isMediaPost) {
        const memoryOwnerId = ownerId;
        if (memoryOwnerId) {
          const prompt = typeof post.mediaPrompt === 'string' ? post.mediaPrompt.trim() : '';
          const memoryKind = prompt ? 'generated' : 'upload';
          const memoryTitle = (post.title && post.title.trim())
            || (memoryKind === 'generated' ? 'Generated media' : 'Upload');
          const memoryDescription = prompt || (post.content || '');
          await indexMemory({
            ownerId: memoryOwnerId,
            kind: memoryKind,
            mediaUrl: post.mediaUrl,
            mediaType: null,
            title: memoryTitle,
            description: memoryDescription,
            postId: post.id || null,
            metadata: { source: 'post', kind: memoryKind }
          });
        }
      }
    } catch (e) { console.warn('Memory index (post) failed:', e?.message || e); }
    const id = await persistPostToDB(post);
    return res.json({ success: true, id });
  } catch (e) {
    console.error('Persist post error:', e);
    return res.status(500).json({ error: 'Failed to save post' });
  }
});

app.get('/api/posts', async (req, res) => {
  try {
    if (!supabase) return res.json({ posts: [] });
    const { capsuleId, limit, before, after, viewerKey, tags } = req.query || {};

    const parsedLimit = (() => {
      const v = parseInt(limit, 10);
      return (!Number.isNaN(v) && v > 0 && v <= 200) ? v : 60;
    })();

    // Resolve viewer id if provided (supports personalized ranking)
    let viewerId = null;
    try {
      const key = String(viewerKey || '').trim();
      if (key) viewerId = await ensureUserFromClientPayload({ key }, null, { allowGuests: true });
      else viewerId = await ensureUserFromClientPayload({}, req, { allowGuests: true });
    } catch(_) { viewerId = null; }

    // Parse tags (comma-separated string or single value)
    let prefTags = null;
    try {
      if (Array.isArray(tags)) {
        prefTags = tags;
      } else if (typeof tags === 'string' && tags.trim()) {
        prefTags = tags.split(',');
      }
      if (Array.isArray(prefTags)) {
        prefTags = Array.from(new Set(prefTags.map(t => String(t).trim().toLowerCase()).filter(Boolean)));
        if (!prefTags.length) prefTags = null;
      } else {
        prefTags = null;
      }
    } catch(_) { prefTags = null; }

    // Prefer new algorithm via RPC. Fallback to posts_view ordering when RPC missing.
    let data = null; let error = null;
    try {
      const rpcArgs = { p_viewer_id: viewerId, p_capsule_id: capsuleId || null, p_tags: prefTags, p_limit: parsedLimit, p_offset: 0 };
      const res1 = await supabase.rpc('rank_posts', rpcArgs);
      data = res1.data; error = res1.error;
    } catch (e) {
      error = e;
    }

    if (error) {
      // Fallback: algorithm-lite using hot_score
      let q = supabase.from('posts_view').select('*');
      if (capsuleId) q = q.eq('capsule_id', capsuleId);
      if (after) q = q.gt('created_at', after);
      if (before) q = q.lt('created_at', before);
      const r2 = await q.order('hot_score', { ascending: false }).order('created_at', { ascending: false }).limit(parsedLimit);
      data = r2.data || [];
      if (r2.error) throw r2.error;
    }
    const deletedIds = [];
    const activeRows = [];
    (data || []).forEach(row => {
      if (row && row.deleted_at) deletedIds.push(row.client_id || row.id);
      else activeRows.push(row);
    });
    const posts = activeRows.map(row => ({
      id: row.client_id || row.id,
      kind: row.kind || 'text',
      content: row.content || '',
      mediaUrl: row.media_url || null,
      mediaPrompt: row.media_prompt || null,
      userName: row.user_name || null,
      userAvatar: row.user_avatar || null,
      capsuleId: row.capsule_id || null,
      tags: Array.isArray(row.tags) ? row.tags : undefined,
      likes: typeof row.likes_count === 'number' ? row.likes_count : 0,
      comments: typeof row.comments_count === 'number' ? row.comments_count : undefined,
      hotScore: typeof row.hot_score === 'number' ? row.hot_score : undefined,
      rankScore: typeof row.rank_score === 'number' ? row.rank_score : undefined,
      ts: row.created_at || row.updated_at || new Date().toISOString(),
      source: row.source || 'web',
      ownerUserId: row.author_user_id || null,
    }));
        // Enrich polls with their definition and vote counts
    const pollClientIds = posts.filter(p=> (p.kind||'text')==='poll').map(p=>p.id);
    if (pollClientIds.length) {
      try {
        const { data: pollRows } = await supabase.from('posts').select('id,client_id,poll,media_prompt').in('client_id', pollClientIds).is('deleted_at', null);
        const byClient = new Map();
        const dbIds = [];
        (pollRows||[]).forEach(r=>{ const mp = (r && typeof r.media_prompt==='string') ? r.media_prompt : ''; let poll = r && r.poll ? r.poll : null; if (!poll && mp && mp.indexOf('__POLL__')===0) { try { poll = JSON.parse(mp.slice(8)); } catch(_){} } byClient.set(r.client_id, { dbId: r.id, poll }); if (r && r.id) dbIds.push(r.id); });
        let voteRows = [];
        if (dbIds.length) {
          const vr = await supabase.from('poll_votes').select('post_id, option_index').in('post_id', dbIds).limit(10000);
          voteRows = (vr && vr.data) || [];
        }
        const countsByDb = new Map();
        voteRows.forEach(v=>{ const k=String(v.post_id); const arr = countsByDb.get(k) || []; const i = Number(v.option_index)||0; arr[i]=(arr[i]||0)+1; countsByDb.set(k, arr); });
        posts.forEach(p=>{
          if ((p.kind||'text')==='poll'){
            const meta = byClient.get(p.id);
            const poll = (meta && meta.poll) || null;
            if (poll && Array.isArray(poll.options)) {
              const dbId = meta && meta.dbId ? String(meta.dbId) : null;
              const counts = dbId && countsByDb.has(dbId) ? countsByDb.get(dbId) : new Array(poll.options.length).fill(0);
              p.poll = Object.assign({}, poll, { counts: counts.slice(0, Math.max(counts.length, poll.options.length)) });
            } else {
              p.poll = { question: 'Poll', options: ['Yes','No'], counts: [0,0] };
            }
          }
        });
      } catch(_){ }
    }
    return res.json({ posts, deleted: deletedIds });
  } catch (e) {
    console.error('Fetch posts error:', e);
    return res.status(500).json({ error: 'Failed to load posts' });
  }
});

// ---- Comments: persist and fetch ----
async function resolvePostId(maybeId) {
  const s = String(maybeId || '').trim();
  if (!s) return null;
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRe.test(s)) return s;
  // Otherwise, treat as client_id and resolve
  const { data, error } = await supabase.from('posts').select('id').eq('client_id', s).is('deleted_at', null).maybeSingle();
  if (error) throw error;
  return data ? data.id : null;
}

async function persistCommentToDB(comment, userId) {
  requireSupabase();
  const now = new Date().toISOString();
  const postId = await resolvePostId(comment.postId || comment.post_id || '');
  const row = {
    client_id: String(comment.id || ''),
    post_id: postId,
    content: String(comment.content || ''),
    user_id: userId || null,
    user_name: comment.userName || null,
    user_avatar: comment.userAvatar || null,
    capsule_id: comment.capsuleId || null,
    created_at: comment.ts || now,
    updated_at: now,
    source: String(comment.source || 'web'),
  };
  if (!row.post_id || !row.content) {
    const err = new Error('post_id and content required');
    err.code = 'BAD_REQUEST';
    throw err;
  }
  const { data, error } = await supabase
    .from('comments')
    .upsert([row], { onConflict: 'client_id' })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

// Create a comment
app.post('/api/comments', async (req, res) => {
  try {
    const body = req.body || {};
    const comment = body.comment;
    if (!comment) return res.status(400).json({ error: 'comment required' });
    const userPayload = body.user || comment.user || {};
    const userId = await ensureUserFromClientPayload(userPayload, req);
    if (!userId) return res.status(401).json({ error: 'auth required' });
    const id = await persistCommentToDB(comment, userId);
    return res.json({ success: true, id });
  } catch (e) {
    console.error('Persist comment error:', e);
    if (e?.code === 'BAD_REQUEST') return res.status(400).json({ error: e.message });
    return res.status(500).json({ error: 'Failed to save comment' });
  }
});

// ---- Likes (normalized via post_likes) ----
function normalizeProfileFromPayload(payload) {
  const key = String(payload?.key || '').trim();
  if (!key) return null;
  const provider = payload?.provider || (key.startsWith('clerk:') ? 'clerk' : 'guest');
  const clerkId = payload?.clerk_id || (provider === 'clerk' && key.startsWith('clerk:') ? key.slice('clerk:'.length) : null);
  return {
    key,
    provider,
    clerk_id: clerkId || null,
    email: payload?.email || null,
    full_name: payload?.full_name || null,
    avatar_url: payload?.avatar_url || null,
  };
}

function mergeUserPayloadFromRequest(req, basePayload) {
  const merged = Object.assign({}, basePayload || {});
  try {
    if (!merged.key && req && typeof req.get === 'function') {
      const raw = req.get('x-capsules-user') || req.get('x_capsules_user');
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.key) Object.assign(merged, parsed);
        } catch (_) {}
      }
      if (!merged.key) {
        const headerKey = req.get('x-capsules-user-key') || req.get('x_capsules_user_key');
        if (headerKey) merged.key = String(headerKey).trim();
      }
    }
    if (!merged.key && req && req.query) {
      const queryKey = req.query.userKey || req.query.user_key;
      if (queryKey) merged.key = String(queryKey).trim();
    }
  } catch (_) {}
  if (merged.key && !merged.provider) merged.provider = merged.key.startsWith('clerk:') ? 'clerk' : 'guest';
  return merged;
}

function resolveRequestProfile(req, payload = {}, allowGuests = false) {
  if (CLERK_ENABLED && req) {
    const auth = getRequestAuth(req);
    if (auth?.userId) {
      const claims = auth.sessionClaims || {};
      const fullNameClaim = claims.full_name || [claims.first_name, claims.last_name].filter(Boolean).join(' ') || null;
      return {
        key: `clerk:${auth.userId}`,
        provider: 'clerk',
        clerk_id: auth.userId,
        email: payload?.email || claims.email || claims.email_address || null,
        full_name: payload?.full_name || fullNameClaim,
        avatar_url: payload?.avatar_url || claims.picture || null,
      };
    }
    if (!allowGuests) return null;
  }
  return normalizeProfileFromPayload(payload);
}

async function ensureSupabaseUser(profile) {
  if (!profile) return null;
  requireSupabase();
  const { key, provider, clerk_id: clerkId, email, full_name: fullName, avatar_url: avatarUrl } = profile;

  let { data: found, error: selErr } = await supabase.from('users').select('id, user_key').eq('user_key', key).maybeSingle();
  if (selErr) throw selErr;
  if (found) return found.id;

  if (clerkId) {
    ({ data: found, error: selErr } = await supabase.from('users').select('id, user_key').eq('clerk_id', clerkId).maybeSingle());
    if (selErr) throw selErr;
    if (found) {
      if (found.user_key !== key) {
        await supabase.from('users').update({ user_key: key }).eq('id', found.id);
      }
      return found.id;
    }
  }

  if (email) {
    ({ data: found, error: selErr } = await supabase.from('users').select('id').eq('email', email).maybeSingle());
    if (selErr) throw selErr;
    if (found) return found.id;
  }

  const insert = {
    user_key: key,
    provider: provider || 'guest',
    clerk_id: clerkId || null,
    email: email || null,
    full_name: fullName || null,
    avatar_url: avatarUrl || null,
  };
  const { data, error } = await supabase.from('users').insert([insert]).select('id').single();
  if (error) throw error;
  return data.id;
}

async function ensureUserFromClientPayload(payload, req = null, options = {}) {
  const allowGuests = !!(options && options.allowGuests);
  const profile = resolveRequestProfile(req, payload, allowGuests);
  if (!profile) return null;
  return ensureSupabaseUser(profile);
}

function resolveUserKey(req, payload = {}) {
  if (CLERK_ENABLED && req) {
    const auth = getRequestAuth(req);
    if (auth?.userId) {
      return `clerk:${auth.userId}`;
    }
  }
  const key = String(payload?.key || '').trim();
  return key || null;
}

async function isAdminRequest(req, payload = {}, supabaseUserId = null) {
  if (!hasAdminPrivilegesConfigured()) return false;

  const keyCandidates = new Set();
  const emailCandidates = new Set();
  const idCandidates = new Set();

  const addValue = (set, value) => {
    const normalized = normalizeAdminValue(value);
    if (normalized) set.add(normalized);
  };

  try {
  } catch (_) {}

  try {
    const profile = resolveRequestProfile(req, payload, true);
    if (profile) {
      addValue(keyCandidates, profile.key);
      if (profile.clerk_id) addValue(keyCandidates, `clerk:${profile.clerk_id}`);
      addValue(emailCandidates, profile.email);
    }
  } catch (_) {}

  if (supabaseUserId) {
    addValue(idCandidates, supabaseUserId);
  }

  const matchesKey = ADMIN_CONFIG.keys.length && Array.from(keyCandidates).some((value) => ADMIN_CONFIG.keys.includes(value));
  const matchesEmail = ADMIN_CONFIG.emails.length && Array.from(emailCandidates).some((value) => ADMIN_CONFIG.emails.includes(value));
  const matchesId = ADMIN_CONFIG.ids.length && Array.from(idCandidates).some((value) => ADMIN_CONFIG.ids.includes(value));

  return matchesKey || matchesEmail || matchesId;
}

app.post('/api/posts/:id/like', async (req, res) => {
  try {
    requireSupabase();
    const rawId = String(req.params.id || '').trim();
    if (!rawId) return res.status(400).json({ error: 'post id required' });
    const action = (req.body && req.body.action) === 'unlike' ? 'unlike' : 'like';
    const userPayload = req.body && req.body.user || {};
    const postId = await resolvePostId(rawId);
    if (!postId) return res.status(404).json({ error: 'post not found' });
    const userId = await ensureUserFromClientPayload(userPayload, req);
    if (!userId) return res.status(401).json({ error: 'auth required' });

    if (action === 'like') {
      const { error } = await supabase
        .from('post_likes')
        .upsert([{ post_id: postId, user_id: userId }], { onConflict: 'post_id,user_id' });
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('post_likes')
        .delete()
        .eq('post_id', postId)
        .eq('user_id', userId);
      if (error) throw error;
    }
    // Return updated count
    const { data, error: selErr } = await supabase
      .from('posts_view')
      .select('id, likes_count')
      .eq('id', postId)
      .single();
    if (selErr) throw selErr;
    return res.json({ success: true, likes: data?.likes_count || 0 });
  } catch (e) {
    console.error('Like API error:', e);
    return res.status(500).json({ error: 'Failed to update like' });
  }
});
// Fetch comments for a given postId
app.get('/api/comments', async (req, res) => {
  try {
    requireSupabase();
    const rawPostId = String(req.query.postId || req.query.post_id || '').trim();
    if (!rawPostId) return res.status(400).json({ error: 'postId required' });
    const resolved = await resolvePostId(rawPostId);
    if (!resolved) return res.json({ success: true, comments: [] });
    let q = supabase
      .from('comments')
      .select('id,client_id,post_id,content,user_name,user_avatar,capsule_id,created_at')
      .eq('post_id', resolved)
      .order('created_at', { ascending: true })
      .limit(200);
    const { data, error } = await q;
    if (error) throw error;
    const comments = (data || []).map(c => ({
      id: c.client_id || c.id,
      postId: rawPostId, // echo back the caller's identifier
      content: c.content,
      userName: c.user_name,
      userAvatar: c.user_avatar,
      capsuleId: c.capsule_id,
      ts: c.created_at,
    }));
    return res.json({ success: true, comments });
  } catch (e) {
    console.error('Fetch comments error:', e);
    return res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

// ---- Friends (persist across devices) ----
async function ensureAliasUserFromName(name, avatarUrl) {
  requireSupabase();
  const norm = String(name || '').trim();
  if (!norm) return null;
  const key = 'alias:' + norm.toLowerCase();
  // Try by user_key first
  let { data: found, error: selErr } = await supabase.from('users').select('id').eq('user_key', key).maybeSingle();
  if (selErr) throw selErr;
  if (found) return found.id;
  // Create minimal user record
  const insert = {
    user_key: key,
    provider: 'other',
    full_name: norm,
    avatar_url: avatarUrl || null,
  };
  const { data, error } = await supabase.from('users').insert([insert]).select('id').single();
  if (error) throw error;
  return data.id;
}

app.post('/api/friends/sync', async (req, res) => {
  try {
    requireSupabase();
    const userPayload = req.body && req.body.user;
    const ownerId = await ensureUserFromClientPayload(userPayload || {}, req);
    if (!ownerId) return res.status(401).json({ error: 'auth required' });
    const { data, error } = await supabase
      .from('friends')
      .select('friend_user_id, display_name, created_at, users:friend_user_id(full_name,avatar_url)')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    const friends = (data || []).map(row => ({
      name: row.display_name || row.users?.full_name || 'Friend',
      avatar: row.users?.avatar_url || null,
    }));
    return res.json({ friends });
  } catch (e) {
    console.error('Friends sync error:', e);
    return res.status(500).json({ error: 'Failed to load friends' });
  }
});

app.post('/api/friends/update', async (req, res) => {
  try {
    requireSupabase();
    const action = (req.body && req.body.action) === 'remove' ? 'remove' : 'add';
    const friend = req.body && req.body.friend || {};
    const userPayload = req.body && req.body.user || {};
    const ownerId = await ensureUserFromClientPayload(userPayload, req);
    if (!ownerId) return res.status(401).json({ error: 'auth required' });
    const friendId = await ensureAliasUserFromName(friend.name || '', friend.avatar || null);
    if (!friendId) return res.status(400).json({ error: 'friend name required' });
    if (action === 'add') {
      const { error } = await supabase
        .from('friends')
        .upsert([{ owner_id: ownerId, friend_user_id: friendId, display_name: String(friend.name || '') }], { onConflict: 'owner_id,friend_user_id' });
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('friends')
        .delete()
        .eq('owner_id', ownerId)
        .eq('friend_user_id', friendId);
      if (error) throw error;
    }
    // Return latest list
    const { data, error: selErr } = await supabase
      .from('friends')
      .select('friend_user_id, display_name, created_at, users:friend_user_id(full_name,avatar_url)')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: true });
    if (selErr) throw selErr;
    const friends = (data || []).map(row => ({
      name: row.display_name || row.users?.full_name || 'Friend',
      avatar: row.users?.avatar_url || null,
    }));
    return res.json({ success: true, friends });
  } catch (e) {
    console.error('Friends update error:', e);
    return res.status(500).json({ error: 'Failed to update friends' });
  }
});

// ---- Poll votes: persist and aggregate ----
app.post('/api/polls/vote', async (req, res) => {
  try {
    requireSupabase();
    const body = req.body || {};
    const rawPostId = String(body.postId || '').trim();
    const optionIndex = Number(body.optionIndex);
    if (!rawPostId) return res.status(400).json({ error: 'postId required' });
    if (!Number.isFinite(optionIndex) || optionIndex < 0) return res.status(400).json({ error: 'optionIndex required' });
    const userPayload = body.user || {};
    const userId = await ensureUserFromClientPayload(userPayload, req);
    if (!userId) return res.status(401).json({ error: 'auth required' });
    const userKey = resolveUserKey(req, userPayload);
    if (!userKey) return res.status(401).json({ error: 'auth required' });

    const resolved = await resolvePostId(rawPostId);
    if (!resolved) return res.status(404).json({ error: 'post not found' });

    const { error: upErr } = await supabase
      .from('poll_votes')
      .upsert([{ post_id: resolved, user_key: userKey, option_index: optionIndex }], { onConflict: 'post_id,user_key' });
    if (upErr) throw upErr;

    const { data, error: selErr } = await supabase
      .from('poll_votes')
      .select('option_index')
      .eq('post_id', resolved)
      .limit(5000);
    if (selErr) throw selErr;
    const countsMap = new Map();
    (data || []).forEach(row => { const i = Number(row.option_index) || 0; countsMap.set(i, (countsMap.get(i) || 0) + 1); });
    const keys = Array.from(countsMap.keys());
    const maxIndex = keys.length ? Math.max(...keys) : -1;

    const { data: pollRow } = await supabase
      .from('posts')
      .select('poll, media_prompt')
      .eq('id', resolved)
      .maybeSingle();
    let poll = pollRow && pollRow.poll ? pollRow.poll : null;
    if (!poll && pollRow && typeof pollRow.media_prompt === 'string' && pollRow.media_prompt.startsWith('__POLL__')) {
      try { poll = JSON.parse(pollRow.media_prompt.slice(8)); } catch (_) { poll = null; }
    }
    const optionsLength = poll && Array.isArray(poll.options) ? poll.options.length : 0;
    const length = Math.max(maxIndex + 1, optionsLength);
    const counts = Array.from({ length: length > 0 ? length : optionsLength }, (_, i) => countsMap.get(i) || 0);
    return res.json({ success: true, counts });
  } catch (e) {
    console.error('Poll vote error:', e);
    return res.status(500).json({ error: 'Failed to record vote' });
  }
});

// Upload base64 -> Supabase storage (ai-images)
app.post('/api/upload_base64', async (req, res) => {
  try {
    const { filename = `file-${Date.now()}`, content_type = 'application/octet-stream', data_base64 } = req.body || {};
    if (!data_base64) return res.status(400).json({ error: 'data_base64 required' });

    const dataUri = String(data_base64).startsWith('data:')
      ? String(data_base64)
      : `data:${content_type || 'application/octet-stream'};base64,${String(data_base64).split(',').pop()}`;

    const saved = await storeImageSrcToSupabase(dataUri, filename);
    if (!saved || !saved.url) return res.status(500).json({ error: 'Failed to save image' });
    return res.json({ url: saved.url, key: saved.key });
  } catch (e) {
    console.error('upload_base64 error:', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Dev-friendly page routes (mirror Vercel rewrites)
app.get('/admin', (_req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get(['/create', '/create.html'], (_req, res) => res.sendFile(path.join(__dirname, 'create.html')));
app.get(['/settings', '/settings.html'], (_req, res) => res.sendFile(path.join(__dirname, 'settings.html')));

// Root
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ---- Linked Accounts (OAuth via Supabase Edge Functions) ----
app.post('/api/linked-accounts', async (req, res) => {
  try {
    requireSupabase();
    const userPayload = mergeUserPayloadFromRequest(req, req.body && req.body.user);
    const userKey = resolveUserKey(req, userPayload);
    if (!userKey || !userKey.startsWith('clerk:')) return res.status(401).json({ error: 'auth required' });
    const userId = await ensureUserFromClientPayload(userPayload, req);
    if (!userId) return res.status(401).json({ error: 'auth required' });
    const { data, error } = await supabase
      .from('social_links')
      .select('provider, remote_user_id, remote_username, created_at, updated_at')
      .eq('owner_user_id', userId)
      .order('provider', { ascending: true });
    if (error) throw error;
    const accounts = (data || []).map(r => ({
      provider: r.provider,
      connected: true,
      remote_user_id: r.remote_user_id || null,
      remote_username: r.remote_username || null,
      connected_at: r.created_at || null,
      updated_at: r.updated_at || null,
    }));
    return res.json({ accounts });
  } catch (e) {
    console.error('Linked accounts error:', e);
    return res.status(500).json({ error: 'Failed to load linked accounts' });
  }
});

app.post('/api/oauth/disconnect', async (req, res) => {
  try {
    requireSupabase();
    const provider = String(req.body && req.body.provider || '').trim().toLowerCase();
    if (!provider) return res.status(400).json({ error: 'provider required' });
    const userPayload = mergeUserPayloadFromRequest(req, req.body && req.body.user);
    const userKey = resolveUserKey(req, userPayload);
    if (!userKey || !userKey.startsWith('clerk:')) return res.status(401).json({ error: 'auth required' });
    const userId = await ensureUserFromClientPayload(userPayload, req);
    if (!userId) return res.status(401).json({ error: 'auth required' });
    const { error } = await supabase
      .from('social_links')
      .delete()
      .eq('owner_user_id', userId)
      .eq('provider', provider);
    if (error) throw error;
    return res.json({ success: true });
  } catch (e) {
    console.error('Disconnect OAuth error:', e);
    return res.status(500).json({ error: 'Failed to disconnect' });
  }
});

app.post('/api/oauth/start', async (req, res) => {
  try {
    const provider = String(req.body && req.body.provider || '').trim().toLowerCase();
    if (!provider) return res.status(400).json({ error: 'provider required' });
    const redirect = String(req.body && req.body.redirect || '') || (SITE_URL + '/settings.html?tab=account#linked');
    const userPayload = mergeUserPayloadFromRequest(req, req.body && req.body.user);
    const userId = await ensureUserFromClientPayload(userPayload, req);
    if (!userId) return res.status(401).json({ error: 'auth required' });
    const key = resolveUserKey(req, userPayload);
    if (!key || !key.startsWith('clerk:')) return res.status(401).json({ error: 'auth required' });

    const config = getOAuthProviderConfig(provider);
    const redirectUri = `${SITE_URL.replace(/\/$/, '')}/api/oauth/callback`;
    const stateObj = { k: key, t: Date.now(), r: redirect, v: provider };

    // Twitter PKCE (very simplified - plain challenge == verifier)
    if (config.requiresVerifier) {
      stateObj.vf = Buffer.from(`${stateObj.k}:${stateObj.t}`).toString('base64url');
    }

    const state = encodeState(stateObj);

    const params = new URLSearchParams(Object.assign({}, config.params, {
      redirect_uri: redirectUri,
      state,
    }));

    if (config.requiresVerifier && stateObj.vf) {
      params.set('code_challenge', stateObj.vf);
      params.set('code_challenge_method', 'plain');
    }

    const authUrl = `${config.authUrl}?${params.toString()}`;
    return res.json({ url: authUrl });
  } catch (e) {
    console.error('OAuth start error:', e);
    return res.status(500).json({ error: e?.message || 'Failed to start OAuth' });
  }
});

app.get('/api/oauth/callback', async (req, res) => {
  const stateRaw = req.query.state || '';
  const state = decodeState(stateRaw);
  const provider = String(req.query.provider || (state && state.v) || '').trim().toLowerCase();
  const errorHint = String(req.query.error_description || req.query.error || '') || null;
  const code = String(req.query.code || '').trim();
  const fallbackRedirect = `${SITE_URL}/settings.html?tab=account#linked`;

  if (!state || !state.k) {
    return res.redirect(`${fallbackRedirect}?connected=0&provider=${encodeURIComponent(provider || 'unknown')}`);
  }

  const redirect = String(state.r || fallbackRedirect);
  if (errorHint) {
    return res.redirect(`${redirect}${redirect.includes('?') ? '&' : '?'}connected=0&provider=${encodeURIComponent(provider || 'unknown')}&reason=${encodeURIComponent(errorHint)}`);
  }
  if (!provider || !code) {
    return res.redirect(`${redirect}${redirect.includes('?') ? '&' : '?'}connected=0&provider=${encodeURIComponent(provider || 'unknown')}`);
  }

  try {
    const config = getOAuthProviderConfig(provider);
    const redirectUri = `${SITE_URL.replace(/\/$/, '')}/api/oauth/callback`;
    const params = new URLSearchParams();
    params.set('client_id', config.clientId);
    params.set('client_secret', config.clientSecret || '');
    params.set('redirect_uri', redirectUri);
    params.set('code', code);
    params.set('grant_type', 'authorization_code');
    if (config.requiresVerifier && state.vf) params.set('code_verifier', state.vf);

    let tokenResponse;
    const tokenReqOpts = {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    };
    const tokenRes = await fetch(config.tokenUrl, tokenReqOpts);
    tokenResponse = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok) {
      console.error('Token exchange failed:', provider, tokenResponse);
      return res.redirect(`${redirect}${redirect.includes('?') ? '&' : '?'}connected=0&provider=${encodeURIComponent(provider)}&reason=token`);
    }

    if (tokenResponse.expires_in) {
      tokenResponse.expires_at = new Date(Date.now() + Number(tokenResponse.expires_in) * 1000).toISOString();
    }

    const ownerId = await ensureUserFromClientPayload({ key: state.k, provider: 'clerk' });
    if (!ownerId) {
      return res.redirect(`${redirect}${redirect.includes('?') ? '&' : '?'}connected=0&provider=${encodeURIComponent(provider)}&reason=user`);
    }

    await upsertSocialLink({
      ownerId,
      provider,
      remoteUserId: tokenResponse.refresh_token ? null : tokenResponse.user_id || null,
      remoteUsername: tokenResponse.email || tokenResponse.username || null,
      tokens: tokenResponse,
    });

    return res.redirect(`${redirect}${redirect.includes('?') ? '&' : '?'}connected=1&provider=${encodeURIComponent(provider)}`);
  } catch (err) {
    console.error('OAuth callback error:', err);
    return res.redirect(`${fallbackRedirect}?connected=0&provider=${encodeURIComponent(provider || 'unknown')}`);
  }
});

// 404
// ---- Memory page + vector index (pgvector) ----
async function embedText(input) {
  if (!OPENAI_API_KEY) return null;
  const text = String(input || '').slice(0, 8000);
  if (!text) return null;
  const body = { model: 'text-embedding-3-small', input: text, encoding_format: 'float' };
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(()=>({}));
  if (!res.ok) { console.error('Embedding error', json); return null; }
  const vec = json?.data?.[0]?.embedding;
  return Array.isArray(vec) ? vec : null;
}

async function indexMemory({ ownerId, kind, mediaUrl, mediaType, title, description, postId, metadata }){
  requireSupabase();
  const clean = (s) => (s ? String(s).slice(0, 2000) : null);
  const row = {
    owner_user_id: ownerId,
    kind: (kind || 'upload'),
    media_url: mediaUrl || null,
    media_type: mediaType || null,
    title: clean(title) || null,
    description: clean(description) || null,
    post_id: postId || null,
    meta: metadata || null,
  };
  // Build corpus for embedding
  const corpus = [row.title, row.description, row.media_type].filter(Boolean).join('\n');
  const embedding = await embedText(corpus).catch(()=>null);
  if (embedding) row.embedding = embedding;
  // Try primary table
  let ins = await supabase.from('memories').insert([row]);
  if (ins && ins.error) {
    const msg = String(ins.error?.message || '').toLowerCase();
    // Fallback to legacy table name if present
    if (msg.includes("could not find") || msg.includes('not found') || ins.error?.code === 'PGRST205') {
      ins = await insertLegacyMemoryItem({ ownerId, kind, mediaUrl, mediaType, title, description, postId, metadata });
    }
    if (ins.error) throw ins.error;
  }
  return true;
}

function firstDefined(obj, keys) {

  for (const key of keys) {

    const v = obj && typeof obj === 'object' ? obj[key] : undefined;

    if (typeof v !== 'undefined' && v !== null && String(v).length) return v;

  }

  return null;

}



function pruneNullish(payload) {

  const out = {};

  Object.keys(payload || {}).forEach(k => {

    const v = payload[k];

    if (typeof v === 'undefined' || v === null) return;

    if (typeof v === 'string' && !v.length) return;

    out[k] = v;

  });

  return out;

}



function parseMaybeJSON(value) {

  if (value === null || value === undefined) return null;

  if (typeof value === 'string') {

    try { return JSON.parse(value); } catch (_) { return null; }

  }

  if (typeof value === 'object') return value;

  return null;

}



function deepFindByKeys(obj, keys) {

  if (!obj || typeof obj !== 'object') return null;

  const queue = [obj];

  const visited = new Set();

  while (queue.length) {

    const current = queue.shift();

    if (!current || typeof current !== 'object') continue;

    if (visited.has(current)) continue;

    visited.add(current);

    for (const key of keys) {

      if (Object.prototype.hasOwnProperty.call(current, key)) {

        const value = current[key];

        if (typeof value !== 'undefined' && value !== null && String(value).length) return value;

      }

    }

    for (const value of Object.values(current)) {

      if (value && typeof value === 'object') queue.push(value);

    }

  }

  return null;

}



function collectMetaSources(row) {

  const sources = [];

  const candidates = [row.meta, row.metadata, row.data, row.details, row.payload, row.extra, row.info];

  candidates.forEach(candidate => {

    const parsed = parseMaybeJSON(candidate);

    if (parsed) sources.push(parsed);

  });

  return sources;

}



function resolveValue(row, metaSources, keys) {

  const direct = firstDefined(row, keys);

  if (direct) return direct;

  for (const source of metaSources) {

    if (!source || typeof source !== 'object') continue;

    const shallow = firstDefined(source, keys);

    if (shallow) return shallow;

    const deep = deepFindByKeys(source, keys);

    if (deep) return deep;

  }

  return null;

}



async function insertLegacyMemoryItem({ ownerId, kind, mediaUrl, mediaType, title, description, postId, metadata }) {

  const base = pruneNullish({

    owner_user_id: ownerId,

    kind: kind || 'upload',

    title: title || null,

    description: description || null,

  });



  const attempts = [

    pruneNullish(Object.assign({}, base, { media_url: mediaUrl || null, media_type: mediaType || null })),

    pruneNullish(Object.assign({}, base, { url: mediaUrl || null, type: mediaType || null })),

    pruneNullish(Object.assign({}, base, { asset_url: mediaUrl || null, asset_type: mediaType || null })),

    pruneNullish(Object.assign({}, base, { storage_path: mediaUrl || null })),

    pruneNullish(Object.assign({}, base, { meta: { url: mediaUrl || null, media_type: mediaType || null, title: title || null, description: description || null, post_id: postId || null, source: metadata && metadata.source ? metadata.source : null } })),

    pruneNullish(Object.assign({}, base, { data: { url: mediaUrl || null, media_type: mediaType || null, title: title || null, description: description || null, metadata: metadata || null, post_id: postId || null } })),

    pruneNullish(Object.assign({}, base, { metadata: { url: mediaUrl || null, media_type: mediaType || null, title: title || null, description: description || null, post_id: postId || null } })),

    pruneNullish(Object.assign({}, base, { notes: JSON.stringify({ url: mediaUrl || null, media_type: mediaType || null, title: title || null, description: description || null, post_id: postId || null }) })),

  ];



  for (const payload of attempts) {

    if (!Object.keys(payload).length) continue;

    const res = await supabase.from('memory_items').insert([payload]);

    if (!res.error) return res;

    const msg = String(res.error?.message || '').toLowerCase();

    if (!(msg.includes('could not find') || msg.includes('does not exist') || res.error?.code === 'PGRST204' || res.error?.code === '42703')) {

      return res; // real error: propagate

    }

    // else try next variant

  }

  // Final attempt: insert minimal owner/kind with meta blob

  const fallback = pruneNullish({ owner_user_id: ownerId, kind: kind || 'upload' });

  console.warn('Memory schema missing media URL columns; inserted minimal record. Update Supabase schema for memories.');

  return supabase.from('memory_items').insert([fallback]);

}



function normalizeLegacyMemoryRow(row) {

  const metaSources = collectMetaSources(row);

  const mediaUrl = resolveValue(row, metaSources, ['media_url', 'url', 'asset_url', 'storage_path', 'file_url', 'public_url', 'path']);

  const mediaType = resolveValue(row, metaSources, ['media_type', 'type', 'asset_type', 'content_type', 'mime_type']);

  const title = resolveValue(row, metaSources, ['title', 'name', 'label', 'headline']);

  const description = resolveValue(row, metaSources, ['description', 'summary', 'caption', 'notes', 'details', 'text']);

  const createdAt = resolveValue(row, metaSources, ['created_at', 'inserted_at', 'createdAt', 'created_at_utc', 'timestamp']);

  const resolvedKind = resolveValue(row, metaSources, ['kind', 'category', 'type']) || row.kind || row.type || row.category || 'upload';

  const makeId = () => (typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2,10)}`);

  return {

    id: row.id || row.uuid || row.item_id || row.memory_id || makeId(),

    kind: String(resolvedKind || 'upload').toLowerCase(),

    media_url: mediaUrl || null,

    media_type: mediaType || null,

    title: title ? String(title) : '',

    description: description ? String(description) : '',

    created_at: createdAt || new Date().toISOString(),

    meta: metaSources.length ? metaSources[0] : null,

  };

}



async function fetchLegacyMemoryItems(ownerId, kind, limit = 200) {
  const variants = [
    'id, kind, media_url, media_type, title, description, created_at',
    'id, kind, url, type, title, description, created_at',
    'id, kind, asset_url, asset_type, title, summary, created_at',
    '*',
  ];

  for (let i = 0; i < variants.length; i++) {
    const columns = variants[i];
    let q = supabase.from('memory_items').select(columns).eq('owner_user_id', ownerId).order('created_at', { ascending: false }).limit(limit);
    if (kind) q = q.eq('kind', kind);
    const res = await q;
    if (!res.error) {
      return (res.data || []).map(normalizeLegacyMemoryRow);
    }
    const msg = String(res.error?.message || '').toLowerCase();
    if (!(msg.includes('could not find') || msg.includes('does not exist') || res.error?.code === 'PGRST204' || res.error?.code === '42703')) {
      throw res.error;
    }
  }
  return [];
}

// Serve Memory page

function toPlainObject(value) {
  const parsed = parseMaybeJSON(value);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return Object.assign({}, parsed);
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.assign({}, value);
  }
  return {};
}

async function markLegacyMemoryItemsUnused({ ownerId, clientId, mediaUrl, deletionTime }) {
  if (!supabase || !ownerId) return 0;
  let updated = 0;
  const touched = new Set();
  const payload = {
    meta: {
      status: 'unused',
      unused_reason: 'post_deleted',
      unused_at: deletionTime,
      deleted_post_id: clientId || null,
    },
  };
  const attempts = [];
  if (clientId) attempts.push(['post_id', clientId]);
  if (mediaUrl) attempts.push(['media_url', mediaUrl]);
  for (const [column, value] of attempts) {
    try {
      const res = await supabase
        .from('memory_items')
        .update(payload)
        .eq('owner_user_id', ownerId)
        .eq(column, value)
        .select('id');
      if (res.error) {
        const msg = String(res.error.message || '').toLowerCase();
        if (msg.includes('does not exist') || res.error.code === 'PGRST204' || res.error.code === '42703') continue;
        throw res.error;
      }
      (res.data || []).forEach((row) => {
        const id = row && row.id ? String(row.id) : null;
        if (id && !touched.has(id)) {
          touched.add(id);
          updated += 1;
        }
      });
    } catch (err) {
      console.warn('markLegacyMemoryItemsUnused error:', err?.message || err);
    }
  }
  return updated;
}

async function markPostAttachmentsUnused(postRow, deletionTime) {
  if (!supabase || !postRow) return { memories: 0, legacy: 0 };
  const ownerId = postRow.author_user_id || postRow.owner_user_id || null;
  if (!ownerId) return { memories: 0, legacy: 0 };
  const clientId = postRow.client_id || null;
  const mediaUrl = postRow.media_url || null;

  const updatedMemoryIds = new Set();
  let memoryUpdates = 0;

  const applyMemoryUpdate = async (column, value) => {
    if (!value) return;
    try {
      const res = await supabase
        .from('memories')
        .select('id, meta')
        .eq('owner_user_id', ownerId)
        .eq(column, value);
      if (res.error) {
        const msg = String(res.error.message || '').toLowerCase();
        if (msg.includes('does not exist') || res.error.code === 'PGRST204' || res.error.code === '42703') return;
        throw res.error;
      }
      for (const row of res.data || []) {
        if (!row || !row.id) continue;
        const id = String(row.id);
        if (updatedMemoryIds.has(id)) continue;
        const nextMeta = toPlainObject(row.meta);
        nextMeta.status = 'unused';
        nextMeta.unused_reason = 'post_deleted';
        nextMeta.unused_at = deletionTime;
        if (clientId) nextMeta.deleted_post_id = clientId;
        else if (!nextMeta.deleted_post_id) nextMeta.deleted_post_id = postRow.id || null;
        const updateRes = await supabase
          .from('memories')
          .update({ meta: nextMeta, updated_at: deletionTime })
          .eq('id', row.id);
        if (!updateRes.error) {
          updatedMemoryIds.add(id);
          memoryUpdates += 1;
        }
      }
    } catch (err) {
      console.warn('markPostAttachmentsUnused memory error:', err?.message || err);
    }
  };

  await applyMemoryUpdate('post_id', clientId);
  await applyMemoryUpdate('media_url', mediaUrl);

  let legacyUpdates = 0;
  try {
    legacyUpdates = await markLegacyMemoryItemsUnused({ ownerId, clientId, mediaUrl, deletionTime });
  } catch (err) {
    console.warn('markPostAttachmentsUnused legacy error:', err?.message || err);
  }

  return { memories: memoryUpdates, legacy: legacyUpdates };
}

async function fetchPostRowByIdentifier(identifier) {
  requireSupabase();
  const raw = String(identifier || '').trim();
  if (!raw) return { data: null, error: null };
  const attempts = [];
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRe.test(raw)) attempts.push({ column: 'id', value: raw });
  if (/^\d+$/.test(raw)) attempts.push({ column: 'id', value: Number(raw) });
  attempts.push({ column: 'client_id', value: raw });
  const seen = new Set();
  for (const attempt of attempts) {
    const key = String(attempt.column) + ':' + String(attempt.value);
    if (seen.has(key)) continue;
    seen.add(key);
    const { data, error } = await supabase
      .from('posts')
      .select('id, client_id, author_user_id, media_url, deleted_at')
      .eq(attempt.column, attempt.value)
      .maybeSingle();
    if (error) {
      const msg = String(error.message || '').toLowerCase();
      if (msg.includes('row not found') || error.code === 'PGRST116' || error.code === '406') continue;
      return { data: null, error };
    }
    if (data) return { data, error: null };
  }
  return { data: null, error: null };
}

app.get(['/memory', '/memory.html'], (_req, res) => res.sendFile(path.join(__dirname, 'memory.html')));

// Upsert a memory row (insert-only for now)

app.delete('/api/posts/:id', async (req, res) => {
  try {
    requireSupabase();
    const rawId = String(req.params.id || '').trim();
    if (!rawId) return res.status(400).json({ error: 'post id required' });
    const userPayload = mergeUserPayloadFromRequest(req, req.body && req.body.user);
    const requesterId = await ensureUserFromClientPayload(userPayload, req);
    if (!requesterId) return res.status(401).json({ error: 'auth required' });

    const { data: postRow, error: fetchError } = await fetchPostRowByIdentifier(rawId);
    if (fetchError) throw fetchError;
    if (!postRow) return res.status(404).json({ error: 'post not found' });

    const postAuthorId = postRow.author_user_id ? String(postRow.author_user_id) : null;
    const requesterIdStr = String(requesterId);
    const isOwner = postAuthorId ? postAuthorId === requesterIdStr : false;
    const hasAdminOverride = isOwner ? false : await isAdminRequest(req, userPayload, requesterIdStr);
    if (!isOwner && !hasAdminOverride) {
      return res.status(403).json({ error: 'not allowed' });
    }

    const deletionTime = new Date().toISOString();
    if (postRow.deleted_at) {
      return res.json({
        success: true,
        alreadyDeleted: true,
        id: postRow.client_id || postRow.id,
        deletedAt: postRow.deleted_at,
      });
    }

    const { error: updateError } = await supabase
      .from('posts')
      .update({ deleted_at: deletionTime, updated_at: deletionTime })
      .eq('id', postRow.id);
    if (updateError) throw updateError;

    let attachments = { memories: 0, legacy: 0 };
    try {
      attachments = await markPostAttachmentsUnused(postRow, deletionTime);
    } catch (markErr) {
      console.warn('markPostAttachmentsUnused error:', markErr?.message || markErr);
    }

    return res.json({
      success: true,
      id: postRow.client_id || postRow.id,
      deletedAt: deletionTime,
      attachments,
    });
  } catch (e) {
    console.error('Delete post error:', e);
    return res.status(500).json({ error: 'Failed to delete post' });
  }
});

app.post('/api/posts/owned', async (req, res) => {
  try {
    requireSupabase();
    const userPayload = mergeUserPayloadFromRequest(req, req.body && req.body.user);
    const ownerId = await ensureUserFromClientPayload(userPayload, req);
    if (!ownerId) return res.status(401).json({ error: 'auth required' });
    const { data, error } = await supabase
      .from('posts')
      .select('id, client_id')
      .eq('author_user_id', ownerId)
      .is('deleted_at', null);
    if (error) throw error;
    const owned = (data || []).map(row => row.client_id || row.id);
    return res.json({ owned });
  } catch (e) {
    console.error('Owned posts fetch error:', e);
    return res.status(500).json({ owned: [] });
  }
});

app.post('/api/memory/upsert', async (req, res) => {
  try {
    requireSupabase();
    const userPayload = mergeUserPayloadFromRequest(req, req.body && req.body.user);
    const item = (req.body && req.body.item) || {};
    const ownerId = await ensureUserFromClientPayload(userPayload, req);
    if (!ownerId) return res.status(401).json({ error: 'auth required' });
    if (!item || !item.media_url) return res.status(400).json({ error: 'media_url required' });
    await indexMemory({ ownerId, kind: item.kind || 'upload', mediaUrl: item.media_url, mediaType: item.media_type || null, title: item.title || null, description: item.description || null, postId: item.post_id || null, metadata: item.meta || null });
    return res.json({ success: true });
  } catch (e) {
    console.error('memory upsert error:', e);
    return res.status(500).json({ error: 'Failed to index memory' });
  }
});

// List memory items (filtered by kind if provided)
app.post('/api/memory/list', async (req, res) => {
  try {
    requireSupabase();
    const userPayload = mergeUserPayloadFromRequest(req, req.body && req.body.user);
    const kind = (req.body && req.body.kind) || null;
    const ownerId = await ensureUserFromClientPayload(userPayload, req);
    if (!ownerId) return res.status(401).json({ error: 'auth required' });
    let q = supabase.from('memories').select('id, kind, media_url, media_type, title, description, created_at').eq('owner_user_id', ownerId).order('created_at', { ascending: false }).limit(200);
    if (kind) q = q.eq('kind', kind);
    let { data, error } = await q;
    if (error && (String(error.message||'').toLowerCase().includes('could not find') || error.code === 'PGRST205' || error.code === '42703')) {
      // Fallback to legacy table name
      data = await fetchLegacyMemoryItems(ownerId, kind, 200);
      error = null;
    }
    if (error) throw error;
    return res.json({ items: data || [] });
  } catch (e) {
    console.error('memory list error:', e);
    return res.status(500).json({ items: [] });
  }
});

// Vector search across memory
app.post('/api/memory/search', async (req, res) => {
  try {
    requireSupabase();
    const userPayload = mergeUserPayloadFromRequest(req, req.body && req.body.user);
    const q = String((req.body && req.body.q) || '').trim();
    const limit = Math.min(100, Math.max(1, Number((req.body && req.body.limit) || 24)));
    const ownerId = await ensureUserFromClientPayload(userPayload, req);
    if (!ownerId) return res.status(401).json({ error: 'auth required' });
    if (!q) return res.json({ items: [] });
    const queryVec = await embedText(q);
    if (!queryVec) return res.json({ items: [] });
    // Use RPC wrapper to avoid raw SQL here; create or call an existing function if available
    // Inline SQL via rest: select ordered by cosine distance
  const { data, error } = await supabase
    .rpc('search_memories_cosine', { p_owner_id: ownerId, p_query_embedding: queryVec, p_match_threshold: 0.15, p_match_count: limit });
  if (error) {
    // Fallback: return recent items if function missing
    console.warn('search_memories_cosine rpc missing; falling back to recent list');
    let recent;
    let q1 = supabase
      .from('memories')
      .select('id, kind, media_url, media_type, title, description, created_at')
      .eq('owner_user_id', ownerId)
      .order('created_at', { ascending: false })
      .limit(limit);
    const r1 = await q1;
    if (r1.error && (String(r1.error.message||'').toLowerCase().includes('could not find') || r1.error.code === 'PGRST205' || r1.error.code === '42703')) {
      recent = await fetchLegacyMemoryItems(ownerId, null, limit);
    } else {
      recent = r1.data || [];
    }
    return res.json({ items: recent || [] });
  }
  return res.json({ items: data || [] });
} catch (e) {
    console.error('memory search error:', e);
    return res.status(500).json({ items: [] });
  }
});

// Delete memory items (by ids, urls, kind, or all)
app.post('/api/memory/delete', async (req, res) => {
  try {
    requireSupabase();
    const body = req.body || {};
    const userPayload = body.user || {};
    const ownerId = await ensureUserFromClientPayload(userPayload, req);
    if (!ownerId) return res.status(401).json({ error: 'auth required' });

    const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean).map(String) : [];
    const urls = Array.isArray(body.urls) ? body.urls.filter(Boolean).map(String) : [];
    const kind = body.kind && String(body.kind).trim() ? String(body.kind).trim() : null;
    const deleteAll = !!body.all;

    let deletedMemories = 0;
    let deletedLegacy = 0;

    // Helper: execute and accumulate deletions
    const run = async (q) => { const r = await q; if (!r.error && (r.count || r.data)) return (r.count || (Array.isArray(r.data) ? r.data.length : 0)) || 0; return 0; };

    // New table
    try {
      let q = supabase.from('memories').delete({ count: 'exact' }).eq('owner_user_id', ownerId);
      if (!deleteAll) {
        if (kind) q = q.eq('kind', kind);
        if (ids.length) q = q.in('id', ids);
        if (urls.length) q = q.in('media_url', urls);
      }
      deletedMemories += await run(q);
    } catch(_){}

    // Legacy table attempts (columns may differ)
    const tryLegacyDelete = async (column, values) => {
      if (!values || !values.length) return 0;
      try {
        let q = supabase.from('memory_items').delete({ count: 'exact' }).eq('owner_user_id', ownerId).in(column, values);
        if (kind) q = q.eq('kind', kind);
        return await run(q);
      } catch(_) { return 0; }
    };

    if (deleteAll) {
      try { deletedLegacy += await run(supabase.from('memory_items').delete({ count: 'exact' }).eq('owner_user_id', ownerId)); } catch(_){}
    } else {
      if (ids.length) {
        for (const col of ['id','uuid','item_id','memory_id']) {
          deletedLegacy += await tryLegacyDelete(col, ids);
        }
      }
      if (urls.length) {
        for (const col of ['media_url','url','asset_url','storage_path','file_url','public_url','path']) {
          deletedLegacy += await tryLegacyDelete(col, urls);
        }
      }
      if (!ids.length && !urls.length && kind) {
        try { deletedLegacy += await run(supabase.from('memory_items').delete({ count: 'exact' }).eq('owner_user_id', ownerId).eq('kind', kind)); } catch(_){}
      }
    }

    return res.json({ success: true, deleted: { memories: deletedMemories, memory_items: deletedLegacy } });
  } catch (e) {
    console.error('memory delete error:', e);
    return res.status(500).json({ error: 'Failed to delete memories' });
  }
});

app.use('*', (_req, res) => res.status(404).json({ error: 'Endpoint not found' }));

// Start server (local dev)
if (require.main === module && process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    console.log('Capsules landing page server running on port ' + PORT);
  });
}

module.exports = app;















