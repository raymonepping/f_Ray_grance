// F-Ray-grance web (spec/DESIGN.md §13). SPA: everything is behind the owner login, so
// server rendering adds nothing; the static build is served by the same-origin Caddy
// gateway (ADR-005) and talks only to /api on that origin.
import tailwindcss from '@tailwindcss/vite';

export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  ssr: false,
  devtools: { enabled: false },
  telemetry: false,
  css: ['~/assets/css/main.css'],
  // UI primitives are used unprefixed (<GlassPanel>, <AppIcon>…); domain/shell folders keep prefixes.
  components: [{ path: '~/components/ui', pathPrefix: false }, '~/components'],
  vite: { plugins: [tailwindcss()] },
  typescript: { strict: true, typeCheck: false },
  runtimeConfig: { public: { appVersion: '0.1.6' } },
  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      title: 'F-Ray-grance',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'description', content: 'Your Fragrance DNA. Your Collection. Your Seasons.' },
        { name: 'theme-color', content: '#0b0e12' },
        { name: 'color-scheme', content: 'dark light' },
        { name: 'referrer', content: 'no-referrer' },
      ],
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
      // Applies saved theme/transparency before first paint (externalised for CSP at build).
      script: [{ src: '/prefs.js' }],
    },
  },
  // Strict CSP (script-src 'self'): no inline import map; inline config is externalised
  // after generate by scripts/externalize-inline.mjs.
  experimental: { entryImportMap: false },
  devServer: { port: 3000 },
  nitro: { devProxy: { '/api': { target: 'http://localhost:8470/api', changeOrigin: false } } },
});
