/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    /**
     * Barrel-file tree shaking. `lucide-react` alone re-exports ~1,500 icon
     * modules; without this, a route that imports six icons still pays the
     * module-resolution cost for the whole barrel in dev and ships more graph
     * than it needs in production. recharts and the drei/three helpers have the
     * same shape, so they are listed too.
     */
    optimizePackageImports: [
      "lucide-react",
      "recharts",
      "framer-motion",
      "@react-three/drei",
      "@react-three/fiber",
      "date-fns",
      "cmdk",
    ],
  },
};

export default nextConfig;
