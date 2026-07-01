// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import preact from '@astrojs/preact';

// https://astro.build/config
export default defineConfig({
  // Root custom-domain Pages site → no `base` needed.
  site: 'https://canimcp.dev',

  vite: {
    plugins: [tailwindcss()],
  },

  integrations: [preact()],
});
