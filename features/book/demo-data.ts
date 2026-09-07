import { APP_CONFIG } from "../../config/app.config";
import { createId, nowIso } from "../../lib/ids";
import { runtimeAssetUrl } from "../../services/runtime-config";
import type { Author, BookSnapshot, Category, Ingredient, Recipe, RecipeStep } from "../../types/book";

function ingredients(rows: Array<[string, number | null, string, string?]>): Ingredient[] {
  return rows.map(([name, amount, unit, amountText], order) => ({
    id: createId("ing"),
    name,
    amount,
    amountText: amountText ?? null,
    unit,
    note: null,
    order,
  }));
}

function steps(rows: string[]): RecipeStep[] {
  return rows.map((text, order) => ({ id: createId("step"), order, text, image: null }));
}

export function createDemoSnapshot(ownerUserId = "local-user"): BookSnapshot {
  const now = nowIso();
  const bookId = "book_family";
  const categories: Category[] = APP_CONFIG.defaultCategories.map(({ name, icon }, order) => ({
    id: `category_${order + 1}`,
    bookId,
    name,
    icon,
    order,
    createdAt: now,
  }));
  const authors: Author[] = APP_CONFIG.defaultAuthors.map((name, order) => ({
    id: `author_${order + 1}`,
    bookId,
    name,
    avatarUrl: null,
    order,
    createdAt: now,
  }));
  const category = (name: string) => categories.find((item) => item.name === name)?.id ?? null;
  const author = (name: string) => authors.find((item) => item.name === name)?.id ?? null;

  const recipes: Recipe[] = [
    {
      id: "recipe_sharlotka",
      bookId,
      title: "Шарлотка с яблоками",
      description: "Воздушный домашний пирог с яблоками и тонкой сахарной корочкой.",
      categoryId: category("Выпечка"),
      authorId: author("Мама"),
      coverImage: {
        id: "image_sharlotka",
        kind: "cover",
        url: runtimeAssetUrl("demo/sharlotka.webp"),
        thumbnailUrl: runtimeAssetUrl("demo/sharlotka-thumb.webp"),
        alt: "Домашняя шарлотка с яблоками",
        width: 1536,
        height: 1024,
        createdAt: now,
      },
      originalPageImages: [],
      servings: 8,
      prepTimeMinutes: 20,
      cookTimeMinutes: 40,
      ingredients: ingredients([
        ["Яблоки", 5, "шт."],
        ["Яйца", 4, "шт."],
        ["Сахар", 180, "г"],
        ["Мука", 160, "г"],
        ["Разрыхлитель", 1, "ч. л."],
        ["Соль", null, "", "щепотка"],
      ]),
      steps: steps([
        "Разогреть духовку до 180 °C. Форму застелить пергаментом, яблоки нарезать тонкими дольками.",
        "Яйца с сахаром и щепоткой соли взбивать 6–8 минут, пока масса не станет светлой и пышной.",
        "Аккуратно вмешать просеянную муку с разрыхлителем, затем добавить яблоки.",
        "Перелить тесто в форму и выпекать 35–40 минут. Первые 25 минут духовку не открывать.",
      ]),
      note: "Вкуснее всего с кисло-сладкими яблоками. Готовность проверить деревянной шпажкой.",
      familyStory: "Тот самый быстрый пирог, который можно поставить в духовку, пока гости разуваются.",
      tags: ["яблоки", "к чаю", "семейное"],
      favorite: true,
      isDemo: true,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      revision: 1,
    },
    {
      id: "recipe_turtle",
      bookId,
      title: "Торт «Черепаха»",
      description: "Домашний торт из маленьких лимонных коржиков со сметанным кремом.",
      categoryId: category("Десерты"),
      authorId: author("Мама"),
      coverImage: null,
      originalPageImages: [
        {
          id: "image_turtle_original",
          kind: "original",
          url: runtimeAssetUrl("demo/original-turtle.jpg"),
          thumbnailUrl: runtimeAssetUrl("demo/original-turtle-thumb.webp"),
          alt: "Рукописный рецепт торта Черепаха из старой семейной книги",
          width: 1280,
          height: 572,
          createdAt: now,
        },
      ],
      servings: 10,
      prepTimeMinutes: 35,
      cookTimeMinutes: 25,
      ingredients: ingredients([
        ["Лимон с кожурой", 0.5, "шт."],
        ["Яйца", 3, "шт."],
        ["Сахар", 1, "стакан"],
        ["Сода", 1, "ч. л."],
        ["Мука", 1.5, "стакана"],
        ["Сметана для крема", 1, "л"],
        ["Сахар для крема", 250, "г"],
      ]),
      steps: steps([
        "Лимон вместе с кожурой пропустить через мясорубку.",
        "Взбить яйца с сахаром, добавить соду и лимон, затем вмешать муку.",
        "Чайной ложкой выкладывать небольшие порции теста на смазанный противень.",
        "Выпекать при 200 °C до золотистого цвета. Быстро снять коржики с противня.",
        "Смешать сметану с сахаром. Каждый коржик обмакивать в крем и выкладывать горкой.",
      ]),
      note: "Рецепт перенесён с фотографии. Перед подарком лучше ещё раз сверить пропорции с оригиналом.",
      familyStory: "Сохранено прямо со страницы старой маминой книги.",
      tags: ["торт", "лимон", "старая книга"],
      favorite: false,
      isDemo: true,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      revision: 1,
    },
    {
      id: "recipe_borscht",
      bookId,
      title: "Домашний борщ",
      description: "Насыщенный борщ, который на следующий день становится ещё вкуснее.",
      categoryId: category("Супы"),
      authorId: author("Семейный рецепт"),
      coverImage: null,
      originalPageImages: [],
      servings: 6,
      prepTimeMinutes: 30,
      cookTimeMinutes: 90,
      ingredients: ingredients([
        ["Говядина", 500, "г"], ["Свёкла", 2, "шт."], ["Капуста", 350, "г"],
        ["Картофель", 4, "шт."], ["Морковь", 1, "шт."], ["Лук", 1, "шт."],
        ["Томатная паста", 2, "ст. л."], ["Соль", null, "", "по вкусу"],
      ]),
      steps: steps([
        "Сварить мясной бульон, снимая пену. Мясо вынуть и нарезать.",
        "Свёклу, морковь и лук обжарить, добавить томатную пасту и немного бульона.",
        "В бульон добавить картофель и капусту, через 10 минут — зажарку и мясо.",
        "Посолить, довести до готовности и дать настояться под крышкой 20 минут.",
      ]),
      note: "Подавать со сметаной и укропом.",
      familyStory: "",
      tags: ["суп", "свёкла"],
      favorite: false,
      isDemo: true,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      revision: 1,
    },
    {
      id: "recipe_bliny",
      bookId,
      title: "Тонкие блины",
      description: "Мягкие тонкие блины с кружевными краями.",
      categoryId: category("Завтраки"),
      authorId: author("Бабушка"),
      coverImage: null,
      originalPageImages: [],
      servings: 4,
      prepTimeMinutes: 10,
      cookTimeMinutes: 25,
      ingredients: ingredients([
        ["Молоко", 500, "мл"], ["Яйца", 2, "шт."], ["Мука", 200, "г"],
        ["Сахар", 1, "ст. л."], ["Растительное масло", 2, "ст. л."], ["Соль", null, "", "щепотка"],
      ]),
      steps: steps([
        "Смешать яйца, сахар и соль, влить половину молока.",
        "Вмешать муку без комочков, затем добавить оставшееся молоко и масло.",
        "Оставить тесто на 10 минут и выпекать на хорошо разогретой сковороде.",
      ]),
      note: "Первый блин покажет, нужно ли добавить немного молока или муки.",
      familyStory: "",
      tags: ["быстро", "к завтраку"],
      favorite: false,
      isDemo: true,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      revision: 1,
    },
  ];

  return {
    schemaVersion: 1,
    book: {
      id: bookId,
      name: APP_CONFIG.appName,
      familyName: APP_CONFIG.familyName,
      ownerUserId,
      role: "owner",
      createdAt: now,
      updatedAt: now,
    },
    categories,
    authors,
    recipes,
    shoppingItems: [],
    syncedAt: null,
  };
}
