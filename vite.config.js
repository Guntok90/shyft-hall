import { defineConfig } from "vite";
import { voiceMiddleware } from "./server/voice.js";

export default defineConfig({
  server: { port: 5181, strictPort: true },
  // The hall boots with top-level await. Vite's default browser target
  // strips that, so the production build has to stay on ES2022.
  build: { target: "es2022" },
  plugins: [
    {
      name: "shyft-voice",
      configureServer(server) {
        server.middlewares.use(voiceMiddleware());
      },
    },
  ],
});
