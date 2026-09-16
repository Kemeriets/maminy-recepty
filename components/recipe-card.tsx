"use client";

import { useState } from "react";
import { Clock3, Heart, ImageIcon, RefreshCw } from "lucide-react";
import { totalRecipeMinutes } from "../features/book/logic";
import type { Category, Recipe } from "../types/book";

interface RecipeCardProps {
  recipe: Recipe;
  category?: Category;
  onOpen: () => void;
  onFavorite: () => void;
}

export function RecipeCard({ recipe, category, onOpen, onFavorite }: RecipeCardProps) {
  const minutes = totalRecipeMinutes(recipe);
  const image = recipe.coverImage?.thumbnailUrl || recipe.coverImage?.url || recipe.originalPageImages[0]?.thumbnailUrl || recipe.originalPageImages[0]?.url;
  const mainImage = recipe.coverImage?.url || recipe.originalPageImages[0]?.url;
  const [failed, setFailed] = useState(false);
  const [tryMain, setTryMain] = useState(false);
  const [retry, setRetry] = useState(0);
  const imageUrl = tryMain ? mainImage : image;
  const retryUrl = imageUrl && retry && imageUrl.includes("/__images/") ? `${imageUrl}${imageUrl.includes("?") ? "&" : "?"}retry=${retry}` : imageUrl;
  const onImageError = () => {
    if (!tryMain && mainImage && mainImage !== image) setTryMain(true);
    else setFailed(true);
  };

  return (
    <article className="recipe-card group">
      <button type="button" className="recipe-card__main" onClick={onOpen} aria-label={`Открыть рецепт «${recipe.title}»`}>
        <div className="recipe-card__image-wrap">
          {image && !failed ? (
            <img src={retryUrl} alt="" onError={onImageError} className="recipe-card__image" loading="lazy" decoding="async" />
          ) : (
            <div className="recipe-card__placeholder" aria-hidden="true">
              <span>{recipe.title.slice(0, 1)}</span>
              <ImageIcon />
              {failed && <small>Фото не загрузилось</small>}
            </div>
          )}
          {recipe.originalPageImages.length > 0 && !recipe.coverImage && <span className="recipe-card__paper-label">Из старой книги</span>}
        </div>
        <div className="recipe-card__body">
          <p className="recipe-card__category">{category?.name || "Без категории"}</p>
          <h3>{recipe.title}</h3>
          <div className="recipe-card__meta">
            {minutes ? <span><Clock3 />{minutes} мин</span> : null}
          </div>
        </div>
      </button>
      {failed && <button type="button" className="recipe-card__photo-retry" onClick={() => { setTryMain(false); setRetry(Date.now()); setFailed(false); }} aria-label={`Повторить загрузку фото «${recipe.title}»`}><RefreshCw /> Повторить</button>}
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
