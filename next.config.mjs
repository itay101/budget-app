/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      // File Import failure reports (#194) send the unreadable bank export
      // itself to a server action; the 1 MB default rejects many of them.
      // Matches MAX_IMPORT_FAILURE_BYTES in src/lib/importFailureReport.ts.
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
