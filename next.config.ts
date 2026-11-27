import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Turbopack skal ikke gjenbruke arbeid fra forrige bygg. Vercel legger
    // tilbake .next/cache før hvert bygg, og 2026-11-27 ga det et stilark med
    // de gamle fargene og skriftene fra globals.css sammen med de nye klassene:
    // siden så halvferdig ut i produksjon. Bygget tar noen sekunder lenger uten
    // bufferen. Slå den ikke på igjen uten å prøve en endring i @theme i
    // globals.css på en forhåndsvisning først.
    turbopackFileSystemCacheForBuild: false,
    serverActions: {
      // Skjemaet for ny hytte kan ha med opptil åtte bilder. Nettleseren
      // forminsker dem først, se src/lib/photo-limits.ts.
      bodySizeLimit: "4mb",
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
