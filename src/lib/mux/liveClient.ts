"use client";

export type StreamOverviewPayload<TOverview, TPreferences> = {
  overview: TOverview | null;
  preferences: TPreferences;
};

export type StreamPreferenceUpdate<TPreferences> = Partial<TPreferences>;

export class MuxLiveClientError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly payload: unknown | undefined;

  constructor({
    status,
    message,
    code,
    payload,
  }: {
    status: number;
    message: string;
    code?: string;
    payload?: unknown;
  }) {
    super(message);
    this.name = "MuxLiveClientError";
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

type ErrorLikeBody =
  | {
      message?: string;
      code?: string;
      error?: string;
      errors?: Array<{ message?: string; code?: string }>;
    }
  | null
  | undefined;

async function createErrorFromResponse(
  response: Response,
  fallbackMessage: string,
): Promise<MuxLiveClientError> {
  let body: ErrorLikeBody | string = null;
  let parsedPayload: unknown = undefined;

  const contentType = response.headers.get("Content-Type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      parsedPayload = await response.json();
      body = parsedPayload as ErrorLikeBody;
    } catch {
      body = null;
    }
  } else {
    try {
      const text = await response.text();
      parsedPayload = text;
      body = text;
    } catch {
      body = null;
    }
  }

  let message = fallbackMessage;
  let code: string | undefined;

  if (body && typeof body === "object") {
    if ("message" in body && typeof body.message === "string" && body.message.length) {
      message = body.message;
    } else if ("error" in body && typeof body.error === "string" && body.error.length) {
      message = body.error;
    } else if (Array.isArray(body.errors) && body.errors.length) {
      const firstError = body.errors.find((item) => item && typeof item.message === "string");
      if (firstError?.message) {
        message = firstError.message;
      }
      if (firstError?.code) {
        code = firstError.code;
      }
    }
    if ("code" in body && typeof body.code === "string" && body.code.length) {
      code = body.code;
    }
  } else if (typeof body === "string" && body.trim().length) {
    message = body.trim();
  }

  return new MuxLiveClientError({
    status: response.status,
    message,
    ...(code ? { code } : {}),
    payload: parsedPayload,
  });
}

export function normalizeMuxError(error: unknown, fallbackMessage: string): MuxLiveClientError {
  if (error instanceof MuxLiveClientError) {
    return error;
  }

  if (error instanceof Error) {
    return new MuxLiveClientError({
      status: 0,
      message: error.message || fallbackMessage,
      payload: error,
    });
  }

  if (typeof error === "string") {
    return new MuxLiveClientError({ status: 0, message: error || fallbackMessage });
  }

  return new MuxLiveClientError({ status: 0, message: fallbackMessage, payload: error });
}

type RequestOptions = {
  signal?: AbortSignal | null;
};

type EnsureStreamParams = RequestOptions & {
  capsuleId: string;
  latencyMode?: "low" | "reduced" | "standard";
};

type RotateKeyParams = RequestOptions & {
  capsuleId: string;
};

type UpdatePreferencesParams<TPreferences> = RequestOptions & {
  capsuleId: string;
  preferences: StreamPreferenceUpdate<TPreferences>;
};

type FetchOverviewParams = RequestOptions & {
  capsuleId: string;
};

function withSignal(init: RequestInit, signal: AbortSignal | null | undefined): RequestInit {
  if (signal === undefined) {
    return init;
  }
  return { ...init, signal };
}

export async function fetchLiveStreamOverview<TOverview, TPreferences>({
  capsuleId,
  signal,
}: FetchOverviewParams): Promise<StreamOverviewPayload<TOverview, TPreferences>> {
  const response = await fetch(
    `/api/mux/live?capsuleId=${encodeURIComponent(capsuleId)}`,
    withSignal(
      {
        method: "GET",
        cache: "no-store",
      },
      signal,
    ),
  );

  if (!response.ok) {
    throw await createErrorFromResponse(response, "Failed to load stream overview.");
  }

  return (await response.json()) as StreamOverviewPayload<TOverview, TPreferences>;
}

export async function ensureLiveStream<TOverview, TPreferences>({
  capsuleId,
  latencyMode,
  signal,
}: EnsureStreamParams): Promise<StreamOverviewPayload<TOverview, TPreferences>> {
  const response = await fetch(
    "/api/mux/live",
    withSignal(
      {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          capsuleId,
          action: "ensure",
          ...(latencyMode ? { latencyMode } : {}),
        }),
      },
      signal,
    ),
  );

  if (!response.ok) {
    throw await createErrorFromResponse(response, "Failed to prepare streaming.");
  }

  return (await response.json()) as StreamOverviewPayload<TOverview, TPreferences>;
}

export async function rotateLiveStreamKey<TOverview, TPreferences>({
  capsuleId,
  signal,
}: RotateKeyParams): Promise<StreamOverviewPayload<TOverview, TPreferences>> {
  const response = await fetch(
    "/api/mux/live",
    withSignal(
      {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          capsuleId,
          action: "rotate-key",
        }),
      },
      signal,
    ),
  );

  if (!response.ok) {
    throw await createErrorFromResponse(response, "Failed to rotate stream key.");
  }

  return (await response.json()) as StreamOverviewPayload<TOverview, TPreferences>;
}

export async function updateStreamPreferences<TOverview, TPreferences>({
  capsuleId,
  preferences,
  signal,
}: UpdatePreferencesParams<TPreferences>): Promise<StreamOverviewPayload<TOverview, TPreferences>> {
  const response = await fetch(
    "/api/mux/live",
    withSignal(
      {
        method: "PUT",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          capsuleId,
          preferences,
        }),
      },
      signal,
    ),
  );

  if (!response.ok) {
    throw await createErrorFromResponse(response, "Failed to save stream settings.");
  }

  return (await response.json()) as StreamOverviewPayload<TOverview, TPreferences>;
}

function parseAttachmentFilename(headerValue: string | null, capsuleId: string): string {
  if (!headerValue) {
    return `capsule-${capsuleId}-obs-profile.json`;
  }

  const match = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(headerValue);
  if (match?.[1]) {
    try {
      const decoded = decodeURIComponent(match[1]);
      if (decoded.trim().length) {
        return decoded.trim();
      }
    } catch {
      if (match[1].trim().length) {
        return match[1].trim();
      }
    }
  }

  return `capsule-${capsuleId}-obs-profile.json`;
}

type DownloadObsProfileParams = RequestOptions & {
  capsuleId: string;
};

export async function downloadObsProfile({
  capsuleId,
  signal,
}: DownloadObsProfileParams): Promise<{ blob: Blob; filename: string }> {
  const response = await fetch(
    `/api/mux/live/profile?capsuleId=${encodeURIComponent(capsuleId)}`,
    withSignal(
      {
        method: "GET",
        cache: "no-store",
      },
      signal,
    ),
  );

  if (!response.ok) {
    throw await createErrorFromResponse(response, "Failed to download OBS profile.");
  }

  const blob = await response.blob();
  const filename = parseAttachmentFilename(response.headers.get("Content-Disposition"), capsuleId);
  return { blob, filename };
}
