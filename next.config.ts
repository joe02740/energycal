import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server output (.next/standalone) so the app can be bundled
  // onto a thumb drive / wrapped as a desktop app without a full npm install.
  output: "standalone",
};

export default nextConfig;
