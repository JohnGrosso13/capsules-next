import { Buffer } from "node:buffer";

import { NextResponse } from "next/server";

import { ensureUserFromRequest, resolveUserKey } from "@/lib/auth/payload";

import { serverEnv } from "@/lib/env/server";

import { getOAuthProviderConfig } from "@/lib/oauth/providers";

import { encodeState } from "@/lib/oauth/state";

import { resolveRedirectUrl } from "@/lib/url";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);

  const provider = String((body?.provider as string) ?? "")
    .trim()
    .toLowerCase();

  if (!provider) {
    return NextResponse.json({ error: "provider required" }, { status: 400 });
  }

  const fallbackRedirect = `${serverEnv.SITE_URL}/settings.html?tab=connections`;

  const targetRedirect = typeof body?.redirect === "string" ? body.redirect : null;

  const redirectUrl = resolveRedirectUrl(targetRedirect, serverEnv.SITE_URL) || fallbackRedirect;

  const userPayload = (body?.user as Record<string, unknown>) ?? {};

  const ownerId = await ensureUserFromRequest(req, userPayload);

  if (!ownerId) {
    return NextResponse.json({ error: "auth required" }, { status: 401 });
  }

  const userKey = await resolveUserKey(userPayload);

  if (!userKey || !userKey.startsWith("clerk:")) {
    return NextResponse.json({ error: "auth required" }, { status: 401 });
  }

  try {
    const config = getOAuthProviderConfig(provider);

    const callbackUrl = `${serverEnv.SITE_URL}/api/oauth/callback`;

    const stateObj: Record<string, unknown> = {
      k: userKey,

      t: Date.now(),

      r: redirectUrl,

      v: provider,
    };

    if (config.requiresVerifier) {
      stateObj.vf = Buffer.from(`${stateObj.k}:${stateObj.t}`).toString("base64url");
    }

    const state = encodeState(stateObj);

    const params = new URLSearchParams({ ...config.params, redirect_uri: callbackUrl, state });

    if (config.requiresVerifier && typeof stateObj.vf === "string") {
      params.set("code_challenge", stateObj.vf);

      params.set("code_challenge_method", "plain");
    }

    const url = `${config.authUrl}?${params.toString()}`;

    return NextResponse.json({ url });
  } catch (error) {
    console.error("OAuth start error", error);

    return NextResponse.json(
      { error: (error as Error)?.message ?? "Failed to start OAuth" },
      { status: 500 },
    );
  }
}
