import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://ezeoli88.github.io",
  base: "/ai-agent-board",
  vite: {
    plugins: [tailwindcss()],
  },
  server: {
    port: 3004,
  },
});
