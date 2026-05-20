import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['@sparticuz/chromium'],
  },
}

export default nextConfig
