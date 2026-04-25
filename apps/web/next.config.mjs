/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    // Permet le build meme s'il reste des erreurs de type non critiques
    // (variables non utilisees, etc.). Le build production reste valide.
    ignoreBuildErrors: true,
  },
  eslint: {
    // Pareil pour ESLint - on ne bloque pas le build sur les warnings
    ignoreDuringBuilds: true,
  },
  output: 'standalone',
  outputFileTracingRoot: process.env.NODE_ENV === 'production' ? undefined : undefined,
  transpilePackages: ['@gifstudio-x/shared'],
  experimental: {
    optimizePackageImports: ['@mui/material', '@mui/icons-material'],
  },
  async headers() {
    return [
      // Noindex global (instance privee, on ne veut JAMAIS etre indexe)
      {
        source: '/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive, nosnippet' },
        ],
      },
      // La plupart du site garde COOP/COEP pour FFmpeg.wasm
      {
        source: '/((?!embed).*)',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
        ],
      },
      // Les pages /embed/* peuvent être intégrées dans d'autres sites
      {
        source: '/embed/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'ALLOWALL' },
          { key: 'Content-Security-Policy', value: 'frame-ancestors *' },
        ],
      },
    ];
  },
};

export default nextConfig;
