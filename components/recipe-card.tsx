"use client";

import { Clock3, Heart, ImageIcon } from "lucide-react";
import { totalRecipeMinutes } from "../features/book/logic";
import type { Author, Category, Recipe } from "../types/book";

interface RecipeCardProps {
  recipe: Recipe;
  category?: Category;
  author?: Author;
  onOpen: () => void;
  onFavorite: () => void;
}

export function RecipeCard({ recipe, category, author, onOpen, onFavorite }: RecipeCardProps) {
  const minutes = totalRecipeMinutes(recipe);
  const image = recipe.coverImage?.thumbnailUrl || recipe.coverImage?.url || recipe.originalPageImages[0]?.thumbnailUrl || recipe.originalPageImages[0]?.url;

  return (
    <article className="recipe-card group">
      <button type="button" className="recipe-card__main" onClick={onOpen} aria-label={`Открыть рецепт «${recipe.title}»`}>
        <div className="recipe-card__image-wrap">
          {image ? (
            <img src={image} alt={recipe.coverImage?.alt || recipe.originalPageImages[0]?.alt || ""} className="recipe-card__image" loading="lazy" decoding="async" />
          ) : (
            <div className="recipe-card__placeholder" aria-hidden="true">
              <span>{recipe.title.slice(0, 1)}</span>
              <ImageIcon />
            </div>
          )}
          {recipe.originalPageImages.length > 0 && !recipe.coverImage && <span className="recipe-card__paper-label">Из старой книги</span>}
        </div>
        <div className="recipe-card__body">
          <p className="recipe-card__category">{category?.name || "Без категории"}</p>
          <h3>{recipe.title}</h3>
          <div className="recipe-card__meta">
            {minutes ? <span><Clock3 />{minutes} мин</span> : null}
            {author ? <span>{author.name}</span> : null}
          </div>
        </div>
      </button>
      <button
        type="button"
        className={`favorite-button ${recipe.favorite ? "is-active" : ""}`}
        onClick={(event) => { event.stopPropagation(); onFavorite(); }}
        aria-label={recipe.favorite ? "Убрать из любимых" : "Добавить в любимые"}
        aria-pressed={recipe.favorite}
      >
        <Heart fill={recipe.favorite ? "currentColor" : "none"} />
      </button>
    </article>
  );
}
