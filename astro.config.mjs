import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  integrations: [tailwind()],
  site: 'https://etcjanus.github.io', // <--- Update this
  // Remove any 'base' property if you added one
});