import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pins the workspace root explicitly — an unrelated package-lock.json in
  // the Windows user profile root would otherwise confuse root inference.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
