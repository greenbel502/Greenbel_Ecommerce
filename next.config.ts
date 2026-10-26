import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  // OAuth authorization codes arrive in this query string; omit it from DEV request logs.
  logging: {
    incomingRequests: {
      ignore: [/\/api\/integrations\/gmail\/callback(?:\?|$)/],
    },
  },
  async redirects() {
    return [
      { source: "/about", destination: "/nosotros", permanent: true },
      { source: "/cart", destination: "/carrito", permanent: true },
      { source: "/contact", destination: "/contacto", permanent: true },
      { source: "/products", destination: "/productos", permanent: true },
    ];
  },
};

export default nextConfig;
