import { vi } from "vitest";

vi.mock("server-only", () => ({}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

if (!("ResizeObserver" in globalThis)) {
  // Minimal ResizeObserver polyfill for jsdom-based tests
  class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver = ResizeObserver;
}

if (typeof globalThis.matchMedia !== "function") {
  // Basic matchMedia stub for components expecting browser APIs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  globalThis.matchMedia = ((query: string): any => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof globalThis.matchMedia;
}

const defaultEnv: Record<string, string> = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_BUCKET: "capsule-assets",
  R2_ACCOUNT_ID: "test-account",
  R2_ACCESS_KEY_ID: "test-access-key",
  R2_SECRET_ACCESS_KEY: "test-secret",
  R2_BUCKET: "capsule-uploads",
  SITE_URL: "https://example.com",
};

const defaultPublicEnv: Record<string, string> = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_clerk",
};

for (const [key, value] of Object.entries(defaultEnv)) {
  if (!process.env[key]) {
    process.env[key] = value;
  }
}

for (const [key, value] of Object.entries(defaultPublicEnv)) {
  if (!process.env[key]) {
    process.env[key] = value;
  }
}
