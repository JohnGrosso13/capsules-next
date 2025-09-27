import { NextResponse } from "next/server";

import { ensureSupabaseUser } from "@/lib/auth/payload";
import { serverEnv } from "@/lib/env/server";
import { getOAuthProviderConfig } from "@/lib/oauth/providers";
import { decodeState } from "@/lib/oauth/state";
import { upsertSocialLink } from "@/lib/supabase/social";
import { appendQueryParams, resolveRedirectUrl } from "@/lib/url";

function toAbsolute(url: string | null | undefined) {
  return resolveRedirectUrl(url ?? null, serverEnv.SITE_URL);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const stateRaw = url.searchParams.get("state");
  const state = decodeState<{ k?: string; t?: number; r?: string; v?: string; vf?: string }>(
    stateRaw,
  );
  const provider = (url.searchParams.get("provider") || state?.v || "").trim().toLowerCase();
  const fallbackRedirect = `${serverEnv.SITE_URL}/settings.html?tab=account#linked`;
  const redirectBase = toAbsolute(state?.r ?? fallbackRedirect);

  const fail = (reason: string) =>
    NextResponse.redirect(
      appendQueryParams(redirectBase, {
        connected: "0",
        provider: provider || "unknown",
        reason,
      }),
    );

  if (!state?.k) {
    return fail("state");
  }

  const errorHint = url.searchParams.get("error_description") || url.searchParams.get("error");
  if (errorHint) {
    return fail(errorHint);
  }

  const code = url.searchParams.get("code")?.trim();
  if (!provider || !code) {
    return fail("code");
  }

  try {
    const config = getOAuthProviderConfig(provider);
    const redirectUri = `${serverEnv.SITE_URL}/api/oauth/callback`;
    const tokenParams = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: redirectUri,
      code,
      grant_type: "authorization_code",
    });
    if (config.clientSecret) tokenParams.set("client_secret", config.clientSecret);
    if (config.requiresVerifier && typeof state.vf === "string") {
      tokenParams.set("code_verifier", state.vf);
    }

    const tokenResponse = await fetch(config.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenParams.toString(),
    });
    const tokenJson = (await tokenResponse.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!tokenResponse.ok || !tokenJson) {
      console.error("Token exchange failed", provider, tokenJson);
      return fail("token");
    }

    if (typeof tokenJson.expires_in === "number") {
      tokenJson.expires_at = new Date(Date.now() + tokenJson.expires_in * 1000).toISOString();
    }

    const profile = {
      key: state.k,
      provider: "clerk",
      clerk_id: state.k.replace(/^clerk:/, ""),
      email: null,
      full_name: null,
      avatar_url: null,
    };
    const ownerId = await ensureSupabaseUser(profile);

    await upsertSocialLink({
      ownerId,
      provider,
      remoteUserId: (tokenJson.user_id as string) ?? null,
      remoteUsername: (tokenJson.username as string) ?? (tokenJson.email as string) ?? null,
      tokens: tokenJson,
    });

    return NextResponse.redirect(
      appendQueryParams(redirectBase, {
        connected: "1",
        provider,
      }),
    );
  } catch (error) {
    console.error("OAuth callback error", error);
    return fail("callback");
  }
}
