/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(process.env.CANVAS_INTEGRATION === "1" ? { basePath: "/motu" } : {}),
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  compress: true,
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
