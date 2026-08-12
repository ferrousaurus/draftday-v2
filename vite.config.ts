import { defineConfig } from 'vite';
import { nitro } from 'nitro/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [tanstackStart({ spa: { enabled: true } }), nitro({ preset: 'deno-deploy' }), viteReact()],
  resolve: {
    tsconfigPaths: true,
  },
});
