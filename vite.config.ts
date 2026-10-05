import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  // Relative asset URLs, so the build runs from any path without being told
  // which one. GitHub Pages serves a project site from /<repo>/, and the
  // default absolute /assets/... would 404 there; './' also keeps `npm run
  // preview` and opening dist/index.html off the filesystem working.
  base: './',
  plugins: [react()],
  // Two pages, one site: Lightbox at the root and Lattice under lattice/.
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        lattice: fileURLToPath(new URL('./lattice/index.html', import.meta.url)),
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'lattice/src/**/*.test.ts'],
  },
})
