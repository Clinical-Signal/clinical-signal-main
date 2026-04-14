/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Server Actions default to a 1MB body limit; lab PDFs can reach the
    // 50MB enforced in lib/records.ts.
    serverActions: {
      bodySizeLimit: "55mb",
    },
  },
};

export default nextConfig;
