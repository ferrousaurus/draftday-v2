import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro-nightly/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tanstackStart(), nitro(), viteReact()],
  resolve: {
    tsconfigPaths: true,
  },
});
