import { defineConfig } from "vite";

export default defineConfig({
  server: { port: 5181, strictPort: true },
  // The hall boots with top-level await. Vite's default browser target
  // strips that, so the production build has to stay on ES2022.
  build: { target: "es2022" },
});
