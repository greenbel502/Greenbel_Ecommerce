import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  async redirects() {
    return [
      { source: "/about", destination: "/nosotros", permanent: true },
      { source: "/cart", destination: "/carrito", permanent: true },
      { source: "/contact", destination: "/contacto", permanent: true },
      { source: "/products", destination: "/productos", permanent: true }
    ];
  }
};

export default nextConfig;
