import "server-only";

import { getTurnstileSecretKey } from "@/config/storage";

export type TurnstileVerification = {
  success: boolean;
  action?: string | null;
  cdata?: string | null;
  errorCodes?: string[] | null;
};

export async function verifyTurnstileToken(
  token: string,
  remoteIp?: string | null,
): Promise<TurnstileVerification> {
  const secret = getTurnstileSecretKey();
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return { success: false, errorCodes: ["missing_secret"] };
    }
    return { success: true, errorCodes: ["missing_secret"] };
  }

  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);
  if (remoteIp) {
    form.append("remoteip", remoteIp);
  }

  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form,
    });

    if (!response.ok) {
      return { success: false, errorCodes: [String(response.status)] };
    }

    const data = (await response.json()) as {
      success?: boolean;
      action?: string;
      cdata?: string;
      "error-codes"?: string[];
    };

    const result: TurnstileVerification = {
      success: Boolean(data?.success),
    };
    if (typeof data?.action === "string") {
      result.action = data.action;
    }
    if (typeof data?.cdata === "string") {
      result.cdata = data.cdata;
    }
    if (Array.isArray(data?.["error-codes"])) {
      result.errorCodes = data["error-codes"] as string[];
    }
    return result;
  } catch (error) {
    console.warn("Turnstile validation failed", error);
    return { success: false, errorCodes: ["network_error"] };
  }
}
