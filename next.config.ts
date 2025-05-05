import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  images:{
    remotePatterns:[
      {
        hostname: "usable-badger-620.convex.cloud",
        protocol: 'https'
      },
      {
        hostname: "hip-caiman-617.convex.cloud",
        protocol: 'https'
      }
    ]
  }
};

export default nextConfig;
