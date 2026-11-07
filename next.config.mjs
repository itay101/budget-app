/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      // File Import failure reports (#194) send the unreadable bank export
      // itself to a server action; the 1 MB default rejects many of them.
      // MAX_IMPORT_FAILURE_BYTES (src/lib/importFailureLimits.ts) stays under it.
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
