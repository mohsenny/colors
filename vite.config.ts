import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import type { Plugin } from 'vite'
import { SLOT, textCv, titleRow } from './cv/src/text.ts'

/**
 * Writes the text CV into the root page, so it is in the HTML itself: link
 * previews, crawlers and a browser without script read it as it is, with the
 * title row's links ahead of it. The app then moves that element onto its
 * paper.
 */
function cvText(): Plugin {
  return {
    name: 'cv-text',
    transformIndexHtml: (html) => html.replace(SLOT, titleRow() + textCv()),
  }
}

// https://vite.dev/config/
export default defineConfig({
  // Relative asset URLs, so the build runs from any path without being told
  // which one. GitHub Pages serves a project site from /<repo>/, and the
  // default absolute /assets/... would 404 there; './' also keeps `npm run
  // preview` and opening dist/index.html off the filesystem working.
  base: './',
  plugins: [react(), cvText()],
  // Four pages, one site: the CV at the root, Solar under solar/, Gravity
  // under gravity/ and Lightbox under lightbox/. lattice/ is Gravity's old
  // address and only sends on.
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        lightbox: fileURLToPath(new URL('./lightbox/index.html', import.meta.url)),
        gravity: fileURLToPath(new URL('./gravity/index.html', import.meta.url)),
        lattice: fileURLToPath(new URL('./lattice/index.html', import.meta.url)),
        solar: fileURLToPath(new URL('./solar/index.html', import.meta.url)),
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'cv/src/**/*.test.ts', 'gravity/src/**/*.test.ts', 'solar/src/**/*.test.ts'],
  },
})
