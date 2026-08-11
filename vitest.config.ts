import { varlockVitePlugin } from '@varlock/vite-integration';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [varlockVitePlugin()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {},
});
