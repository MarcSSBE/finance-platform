import type { NextConfig } from "next";

const pdfIncludes = [
  "./node_modules/pdf-parse/**",
  "./node_modules/pdfjs-dist/legacy/build/**",
];

const nextConfig: NextConfig = {
  // pdf-parse (pdfjs-dist) ships a worker file it resolves at runtime; keep it
  // out of the server bundle so the worker path resolves from node_modules.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
  // Vercel's function file-tracing misses the dynamically-loaded pdf worker, so
  // force-include it (and pdf-parse) in the invoice API functions.
  outputFileTracingIncludes: {
    "/api/invoices/reconcile": pdfIncludes,
    "/api/invoices/download": pdfIncludes,
    "/api/invoices/file-to-drive": pdfIncludes,
  },
};

export default nextConfig;
