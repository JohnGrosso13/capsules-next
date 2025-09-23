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

export default nextConfig;
