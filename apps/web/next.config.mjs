/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Standalone output produces a self-contained build that runs with
  // `node .next/standalone/server.js`. Required for Railway / non-Vercel hosts.
  output: "standalone",
  experimental: {
    // Server Actions default to a 1MB body limit; lab PDFs can reach the
    // 50MB enforced in lib/records.ts.
    serverActions: {
      bodySizeLimit: "55mb",
    },
  },
};

export default nextConfig;
