import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  // 部署为自包含 server.js(pm2 直接跑裸 JS,避免 pnpm shell 启动器问题)
  output: 'standalone',
};

export default withMDX(config);
