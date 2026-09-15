import type { MetadataRoute } from "next";
import { APP_CONFIG } from "../config/app.config";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: APP_CONFIG.appName,
    short_name: APP_CONFIG.shortName,
    description: "Рецепты, фотографии и удобный режим готовки.",
    lang: "ru",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: APP_CONFIG.theme.paper,
    theme_color: APP_CONFIG.theme.primary,
    categories: ["food", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Добавить рецепт", short_name: "Добавить", url: "/?action=add", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Список покупок", short_name: "Покупки", url: "/?view=shopping", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
