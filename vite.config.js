import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Relative assets work for both local previews and GitHub Pages project sites.
  base: './',
})
