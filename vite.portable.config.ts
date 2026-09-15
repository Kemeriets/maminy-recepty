import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
import { APP_CONFIG } from "./config/app.config";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));
const description = "Рецепты, фотографии и удобный режим готовки.";

function portableMetadata() {
  return {
    name: "portable-metadata",
    transformIndexHtml(html: string) {
      return html
        .replaceAll("__APP_NAME__", APP_CONFIG.appName)
        .replaceAll("__APP_DESCRIPTION__", description)
        .replaceAll("__THEME_COLOR__", APP_CONFIG.theme.primary);
    },
    closeBundle() {
      const manifest = {
        id: "./",
        name: APP_CONFIG.appName,
        short_name: APP_CONFIG.shortName,
        description,
        lang: "ru",
        start_url: "./",
        scope: "./",
        display: "standalone",
        orientation: "portrait-primary",
        background_color: APP_CONFIG.theme.paper,
        theme_color: APP_CONFIG.theme.primary,
        categories: ["food", "lifestyle"],
        icons: [
          { src: "./icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "./icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "./icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
        shortcuts: [
          { name: "Добавить рецепт", short_name: "Добавить", url: "./?action=add", icons: [{ src: "./icons/icon-192.png", sizes: "192x192" }] },
          { name: "Список покупок", short_name: "Покупки", url: "./?view=shopping", icons: [{ src: "./icons/icon-192.png", sizes: "192x192" }] },
        ],
      };
      writeFileSync(`${projectRoot}/dist-portable/manifest.static.webmanifest`, `${JSON.stringify(manifest, null, 2)}\n`);
    },
  };
}

export default defineConfig({
  root: fileURLToPath(new URL("./portable", import.meta.url)),
  base: "./",
  publicDir: fileURLToPath(new URL("./public", import.meta.url)),
  plugins: [react(), portableMetadata()],
  server: { host: "0.0.0.0", allowedHosts: ["terminal.local"] },
  preview: { host: "0.0.0.0", allowedHosts: ["terminal.local"] },
  build: {
    outDir: `${projectRoot}/dist-portable`,
    emptyOutDir: true,
    target: "es2020",
    sourcemap: false,
    cssCodeSplit: true,
  },
});
