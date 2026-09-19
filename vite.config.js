import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    // Public source maps: Sentry fetches them to turn minified browser stack
    // frames into source lines (no upload step, no auth token). The repo is
    // public, so they expose nothing new; browsers only load them in devtools.
    sourcemap: true,
  },
});
