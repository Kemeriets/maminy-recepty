export const APP_CONFIG = {
  appName: "Мамины рецепты",
  shortName: "Рецепты",
  momName: "Мама",
  giftFrom: "Дима",
  familyName: "Семья",
  dedicationTitle: "Для тебя, мама",
  dedicationText:
    "Я хотел сохранить все твои рецепты, чтобы они никогда не потерялись. Теперь здесь хватит места и для тех, которые появятся потом.",
  showGiftIntro: true,
  version: "1.0.0",
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
  defaultAuthors: ["Мама", "Бабушка", "Дима", "Папа", "Семейный рецепт"],
} as const;

export type AppConfig = typeof APP_CONFIG;
