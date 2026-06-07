/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Static export for GitHub Pages deployment.
  // basePath matches the repo name so asset URLs resolve correctly.
  output: 'export',
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || '',
};

export default nextConfig;
