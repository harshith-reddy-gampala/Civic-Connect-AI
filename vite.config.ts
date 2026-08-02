import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";

export default defineConfig({
  resolve: {
    alias: [{ find: /^@\//, replacement: "/src/" }],
  },
  plugins: [
    tailwind(),
    tanstackStart({ server: { entry: "server" } }),
    nitro(),
    react(),
  ],
});