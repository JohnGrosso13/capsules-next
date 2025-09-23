import crypto from "node:crypto";

import bcrypt from "bcryptjs";
import type { NextRequest } from "next/server";
import { cookies } from "next/headers";

import { mergeUserPayloadFromRequest, isAdminRequest } from "@/lib/auth/payload";
import { serverEnv } from "@/lib/env/server";

const SESSION_COOKIE = "capsules_admin_session";
const DEFAULT_ADMIN_USER = "admin";
const SESSION_MAX_AGE = 60 * 60 * 2; // 2 hours

type AdminCheckResult = {
  ok: boolean;
  reason?: string;
  via?: "cookie" | "token" | "clerk";
};

function sessionSecret() {
  return (
    serverEnv.ADMIN_SESSION_SECRET ||
    serverEnv.ADMIN_PASSWORD ||
    serverEnv.ADMIN_ACCESS_TOKEN ||
    "capsules-admin-dev"
  );
}

function expectedSessionSignature() {
  const secret = sessionSecret();
  const adminUser = serverEnv.ADMIN_USERNAME || DEFAULT_ADMIN_USER;
  return crypto.createHmac("sha256", secret).update(adminUser).digest("hex");
}

export function buildAdminSessionCookie() {
  const value = expectedSessionSignature();
  return {
    name: SESSION_COOKIE,
    value,
    options: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
      maxAge: SESSION_MAX_AGE,
    },
  };
}

export function clearAdminSessionCookie() {
  return {
    name: SESSION_COOKIE,
    value: "",
    options: { path: "/", maxAge: 0 },
  };
}

export async function verifyAdminCredentials(username: string, password: string) {
  const expectedUser = serverEnv.ADMIN_USERNAME || DEFAULT_ADMIN_USER;
  if (!username || !password) return false;
  if (username !== expectedUser) return false;

  const hash = serverEnv.ADMIN_PASSWORD_HASH;
  const plain = serverEnv.ADMIN_PASSWORD;

  if (hash) {
    try {
      return await bcrypt.compare(password, hash);
    } catch (error) {
      console.error("Admin bcrypt compare failed", error);
      return false;
    }
  }
  if (plain) {
    return password === plain;
  }
  console.warn("Admin password not configured; set ADMIN_PASSWORD or ADMIN_PASSWORD_HASH");
  return false;
}

export async function checkAdminAccess(req: NextRequest, options?: { allowToken?: boolean }): Promise<AdminCheckResult> {
  const allowToken = options?.allowToken ?? false;
  const expectedToken = serverEnv.ADMIN_ACCESS_TOKEN;

  if (allowToken && expectedToken) {
    const token = req.nextUrl.searchParams.get("token") || req.headers.get("x-admin-token");
    if (token && token === expectedToken) {
      return { ok: true, via: "token" };
    }
  }

  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE)?.value;
  if (sessionCookie && sessionCookie === expectedSessionSignature()) {
    return { ok: true, via: "cookie" };
  }

  try {
    const payload = mergeUserPayloadFromRequest(req, {});
    const hasAdmin = await isAdminRequest(req, payload, null);
    if (hasAdmin) {
      return { ok: true, via: "clerk" };
    }
  } catch (error) {
    console.error("Admin Clerk check failed", error);
  }

  return { ok: false, reason: "unauthorized" };
}
