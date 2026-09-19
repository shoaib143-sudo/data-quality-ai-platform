/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  images: { unoptimized: true },
  experimental: {
    useTypeScriptCli: true,
  },
}

export default nextConfig
