export const APP_CONFIG = {
  appName: "Рецепты",
  shortName: "Рецепты",
  momName: "Мама",
  giftFrom: "Дима",
  familyName: "Семья",
  dedicationTitle: "Книга рецептов",
  dedicationText:
    "Добавляйте рецепты, находите нужное блюдо и готовьте в удобном режиме.",
  showGiftIntro: false,
  version: "1.3.8",
  theme: {
    primary: "#6c2737",
    primaryDark: "#4b1825",
    paper: "#fffaf1",
    ink: "#2d2522",
    accent: "#d89b4e",
  },
  defaultCategories: [
    { name: "Салаты", icon: "salad" },
    { name: "Супы", icon: "soup" },
    { name: "Горячее", icon: "flame" },
    { name: "Выпечка", icon: "croissant" },
    { name: "Десерты", icon: "cake" },
    { name: "Завтраки", icon: "sunrise" },
    { name: "Напитки", icon: "cup" },
    { name: "Заготовки", icon: "jar" },
    { name: "Другое", icon: "bookmark" },
  ],
  // Legacy author data is still accepted in backups, but no authors are created or shown.
  defaultAuthors: [],
} as const;

export type AppConfig = typeof APP_CONFIG;
