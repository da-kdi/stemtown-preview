import path from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// base = "/<repo-name>/" is required for GitHub Pages project sites
// (served at https://<user>.github.io/<repo-name>/). Change REPO_NAME
// below to match the exact GitHub repo name you push to.
const REPO_NAME = "stemtown-preview";

export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss()],
  base: command === "build" ? `/${REPO_NAME}/` : "/",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
