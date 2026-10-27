<template>
  <div class="relative grid min-h-dvh place-items-center overflow-hidden px-4 py-10">
    <a href="#main" class="sr-only-focusable fixed left-3 top-3 z-10 rounded-control bg-action px-4 py-2 font-semibold text-action-ink">Skip to content</a>
    <svg class="pointer-events-none absolute inset-x-0 bottom-0 h-[38vh] w-full text-line" viewBox="0 0 1200 300" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <!-- the spectral ramp (ADR-019), kept faint: decoration behind the sign-in form -->
        <linearGradient id="auth-spectrum" gradientUnits="userSpaceOnUse" x1="240" y1="0" x2="860" y2="0">
          <stop offset="0" stop-color="var(--spectrum-fresh)" />
          <stop offset="1" stop-color="var(--spectrum-warm)" />
        </linearGradient>
      </defs>
      <g fill="none" stroke-width="1" vector-effect="non-scaling-stroke">
        <path d="M0 299 L260 299 L300 210 L320 280 L360 120 L392 290 L430 240 L470 299 L640 299 L668 170 L690 286 L720 60 L752 292 L790 230 L830 299 L1200 299" stroke="url(#auth-spectrum)" stroke-opacity="0.45" />
        <path d="M0 250 H1200 M0 200 H1200 M0 150 H1200 M0 100 H1200" stroke="currentColor" stroke-dasharray="2 6" />
      </g>
    </svg>
    <main id="main" class="relative w-full max-w-[400px]"><slot /></main>
  </div>
</template>
