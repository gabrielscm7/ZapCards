/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_API_URL: process.env.BACKEND_URL || "http://localhost:8000",
  },
};

export default nextConfig;
