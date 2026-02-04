import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "coin-images.coingecko.com",
      },
      {
        protocol: "https",
        hostname: "raw.githubusercontent.com",
      },
    ],
  },
  webpack: (config, { isServer }) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");
    
    // Fix for MetaMask SDK @react-native-async-storage warning
    config.resolve.fallback = {
      ...config.resolve.fallback,
      "@react-native-async-storage/async-storage": false,
    };

    // Ignore specific modules that cause SSR issues
    if (isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        "@avail-project/nexus-core": false,
      };
    }

    return config;
  },
};

export default nextConfig;
