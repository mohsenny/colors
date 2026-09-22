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
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
