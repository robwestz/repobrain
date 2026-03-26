import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg", "ioredis", "bullmq", "simple-git", "web-tree-sitter"],
};

export default nextConfig;
