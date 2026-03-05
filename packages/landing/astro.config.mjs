import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://ai-agent-board.pro",
  vite: {
    plugins: [tailwindcss()],
  },
  server: {
    port: 3004,
  },
});
