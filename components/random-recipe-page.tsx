"use client";

import { ArrowRight, Dices, Shuffle } from "lucide-react";
import { Button } from "./ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { RecipeCard } from "./recipe-card";
import { chooseRandomRecipe } from "../features/book/random-recipe";
import type { Category, Recipe } from "../types/book";

export function RandomRecipePage({ recipes, categories, selection, onSelectionChange, onOpen, onFavorite }: { recipes: Recipe[]; categories: Category[]; selection: { categoryId: string | null; recipeId: string | null }; onSelectionChange: (selection: { categoryId: string | null; recipeId: string | null }) => void; onOpen: (id: string) => void; onFavorite: (recipe: Recipe) => void }) {
  const { categoryId, recipeId } = selection;
  const candidates = recipes.filter((recipe) => !recipe.deletedAt && (!categoryId || recipe.categoryId === categoryId));
  const selected = candidates.find((recipe) => recipe.id === recipeId);
  const draw = () => onSelectionChange({ categoryId, recipeId: chooseRandomRecipe(recipes, categoryId, recipeId)?.id ?? null });
  return <section className="page-view random-page">
    <header className="page-heading"><div><h1>Что приготовить?</h1><p>Выберите категорию — приложение предложит случайный рецепт из ваших.</p></div></header>
    <div className="random-controls"><label className="field"><span>Категория</span><Select value={categoryId ?? "all"} onValueChange={(value) => onSelectionChange({ categoryId: value === "all" ? null : value, recipeId: null })}><SelectTrigger aria-label="Категория случайного блюда"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Все категории</SelectItem>{categories.map((category) => <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}</SelectContent></Select></label><Button size="lg" onClick={draw} disabled={!candidates.length}>{selected ? <Shuffle /> : <Dices />}{selected ? "Выбрать другое" : "Выбрать блюдо"}</Button></div>
    <p className="random-count">{candidates.length === 1 ? "В этой категории один рецепт." : `Рецептов для выбора: ${candidates.length}`}</p>
    {selected ? <div className="random-result" aria-live="polite"><RecipeCard recipe={selected} category={categories.find((category) => category.id === selected.categoryId)} onOpen={() => onOpen(selected.id)} onFavorite={() => onFavorite(selected)} /><Button size="lg" onClick={() => onOpen(selected.id)}>Открыть рецепт <ArrowRight /></Button></div> : <div className="empty-state"><div><Dices /></div><h2>{candidates.length ? "Пусть выбор будет случайным" : "Пока не из чего выбирать"}</h2><p>{candidates.length ? "Нажмите «Выбрать блюдо». Если не захочется — попробуйте ещё раз." : "Выберите другую категорию или добавьте в неё рецепт."}</p></div>}
  </section>;
}
