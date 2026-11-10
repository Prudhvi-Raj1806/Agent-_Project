import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets the phone use `npm run dev` over Tailscale (https://<pc>.<tailnet>.ts.net). `**` covers the two labels before ts.net.
  // Only affects the dev server; production ignores it.
  allowedDevOrigins: ["**.ts.net"],
  // Pins the workspace root explicitly — an unrelated package-lock.json in
  // the Windows user profile root would otherwise confuse root inference.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
