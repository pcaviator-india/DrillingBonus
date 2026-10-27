import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Rig interval reports and monthly planillas are multi-MB .xlsx files, and
    // admins often upload several at once. Next's default 1 MB Server Action
    // body cap rejects anything larger; raise it so multi-file uploads work.
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
};

export default nextConfig;
