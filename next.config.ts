import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // unpdf ships a serverless-ready pdfjs, so no external-package/worker config
  // is needed for PDF parsing.
};

export default nextConfig;
