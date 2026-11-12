import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.GITHUB_PAGES === '1' ? '/vector-field-map/' : '/',
  server: {
    port: 5173,
  },
});
