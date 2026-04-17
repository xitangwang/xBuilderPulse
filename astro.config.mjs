import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import vercel from '@astrojs/vercel';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://xbuilderpulse.vercel.app',
  output: 'static',
  adapter: vercel({
    webAnalytics: { enabled: false },
  }),
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
});
