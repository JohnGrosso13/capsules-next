import { withSentryConfig } from "@sentry/nextjs";
import type { SentryBuildOptions } from "@sentry/nextjs";
import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  async rewrites() {
    return [
      { source: "/index.html", destination: "/" },
      { source: "/capsule.html", destination: "/capsule" },
      { source: "/create.html", destination: "/create" },
      { source: "/memory.html", destination: "/memory" },
      { source: "/settings.html", destination: "/settings" },
      { source: "/admin.html", destination: "/admin" },
    ];
  },
};

const sentryBuildOptions: SentryBuildOptions = {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  hideSourceMaps: true,
};

export default withSentryConfig(nextConfig, sentryBuildOptions);
