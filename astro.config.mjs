import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  // This turns on the styling engine
  integrations: [tailwind()],
  
  // Replace this with your actual GitHub URL later
  site: 'https://yourusername.github.io',
});