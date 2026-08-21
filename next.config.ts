import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: { optimizePackageImports: ["framer-motion"] },

  async rewrites() {
    return [
      /**
       * Android checks https://<domain>/.well-known/assetlinks.json to decide
       * whether the installed app really belongs to this site. Next refuses to
       * serve anything from a dot-directory inside public/, so the file lives at
       * the root and is exposed here under the path Android insists on.
       *
       * Without this the app still runs — with a browser address bar across the
       * top, which is precisely what installing it was meant to remove.
       */
      { source: "/.well-known/assetlinks.json", destination: "/assetlinks.json" },
    ];
  },
};

export default nextConfig;
