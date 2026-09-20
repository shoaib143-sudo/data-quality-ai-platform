/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next.js 16.3.x on Vercel currently fails during the adapter's onBuildComplete
  // phase when standalone output is enabled because next-server.js.nft.json is
  // not emitted. Vercel does not consume the standalone directory, so keep it
  // for non-Vercel runtimes only.
  output: process.env.VERCEL ? undefined : 'standalone',
  images: { unoptimized: true },
  experimental: {
    useTypeScriptCli: true,
  },
}

export default nextConfig
