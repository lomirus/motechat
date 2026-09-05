import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages project sites are served from /<repo>/; BASE_PATH comes from Actions.
  base: `${(process.env.BASE_PATH ?? '').replace(/\/$/, '')}/`,
  plugins: [svelte()],
})
