import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Desactivado: en dev hacía que el updater de setState se ejecutara dos veces y el carrito sumara +2 en vez de +1
  reactStrictMode: false,
};

export default nextConfig;
