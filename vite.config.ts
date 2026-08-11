import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tanstackStart({ spa: { enabled: true } }), nitro({ preset: "deno-deploy" }), viteReact()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {},
});
