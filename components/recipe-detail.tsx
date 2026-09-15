"use client";

import { useMemo, useState } from "react";
import { ArchiveRestore, BookOpenText, ChefHat, ChevronLeft, Clock3, Heart, Pencil, Share2, ShoppingBasket, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Checkbox } from "./ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "./ui/alert-dialog";
import { CookingMode } from "./cooking-mode";
import { formatAmount, scaleIngredient, totalRecipeMinutes } from "../features/book/logic";
import { createId, nowIso } from "../lib/ids";
import type { Category, Recipe, ShoppingItem } from "../types/book";
import { recipeShareText } from "../services/recipe-share";

interface RecipeDetailProps {
  recipe: Recipe;
  category?: Category;
  onBack: () => void;
  onEdit: () => void;
  onFavorite: () => void;
  onDelete: () => void;
  onRestore?: () => void;
  onAddShopping: (items: ShoppingItem[]) => Promise<void>;
}

export function RecipeDetail({ recipe, category, onBack, onEdit, onFavorite, onDelete, onRestore, onAddShopping }: RecipeDetailProps) {
  const [servings, setServings] = useState(recipe.servings || 1);
  const [cooking, setCooking] = useState(false);
  const [shoppingOpen, setShoppingOpen] = useState(false);
  const [shoppingBusy, setShoppingBusy] = useState(false);
  const [selectedIngredients, setSelectedIngredients] = useState<Set<string>>(() => new Set(recipe.ingredients.map((item) => item.id)));
  const minutes = totalRecipeMinutes(recipe);
  const scaledIngredients = useMemo(() => recipe.ingredients.map((item) => scaleIngredient(item, recipe.servings, servings)), [recipe, servings]);

  const share = async () => {
    const text = recipeShareText(recipe, scaledIngredients, recipe.servings ? servings : null);
    try {
      if (navigator.share) await navigator.share({ title: recipe.title, text });
      else { await navigator.clipboard.writeText(text); toast.success("Полный текст рецепта скопирован"); }
    } catch (error) {
      if ((error as DOMException)?.name !== "AbortError") toast.error("Не получилось поделиться рецептом");
    }
  };

  const addSelectedToShopping = async () => {
    const createdAt = nowIso();
    const chosen = scaledIngredients.filter((item) => selectedIngredients.has(item.id));
    if (!chosen.length) { toast.error("Выберите хотя бы один ингредиент"); return; }
    setShoppingBusy(true);
    try { await onAddShopping(chosen.map((item): ShoppingItem => ({
      id: createId("shop"), bookId: recipe.bookId, name: item.name, amount: item.amount,
      amountText: item.amountText, unit: item.unit, checked: false, recipeId: recipe.id, createdAt, updatedAt: createdAt,
    })));
    setShoppingOpen(false);
    toast.success("Добавлено в покупки", { description: `${chosen.length} ингредиентов` });
    } catch { toast.error("Не удалось добавить продукты", { description: "Выбор остался. Попробуйте ещё раз." }); }
    finally { setShoppingBusy(false); }
  };

  if (recipe.deletedAt) {
    return (
      <section className="page-view compact-view">
        <Button variant="ghost" className="back-button" onClick={onBack}><ChevronLeft /> Корзина</Button>
        <div className="deleted-recipe-panel">
          <Trash2 />
          <h1>{recipe.title}</h1>
          <p>Рецепт находится в корзине. Его можно восстановить без потери фотографий и записей.</p>
          <Button size="lg" onClick={onRestore}><ArchiveRestore /> Восстановить рецепт</Button>
        </div>
      </section>
    );
  }

  return (
    <section className="page-view recipe-detail">
      <div className="detail-topbar">
        <Button variant="ghost" className="back-button" onClick={onBack}><ChevronLeft /> Назад</Button>
        <div className="detail-topbar__actions">
          <Button variant="ghost" size="icon-lg" onClick={onFavorite} aria-label={recipe.favorite ? "Убрать из любимых" : "Добавить в любимые"}><Heart fill={recipe.favorite ? "currentColor" : "none"} className={recipe.favorite ? "text-rose-700" : ""} /></Button>
          <Button variant="ghost" size="icon-lg" onClick={() => void share()} aria-label="Поделиться"><Share2 /></Button>
        </div>
      </div>

      <div className="recipe-hero">
        {recipe.coverImage ? <img src={recipe.coverImage.url} alt={recipe.coverImage.alt || recipe.title} className="recipe-hero__image" /> : (
          <div className="recipe-hero__fallback"><BookOpenText /><span>Без фотографии</span></div>
        )}
        <div className="recipe-hero__copy">
          <p className="eyebrow">{category?.name || "Без категории"}</p>
          <h1>{recipe.title}</h1>
          {recipe.description ? <p className="recipe-lead">{recipe.description}</p> : null}
          <div className="recipe-facts">
            {minutes ? <span><Clock3 /> {minutes} мин</span> : null}
            {recipe.servings ? <span><ChefHat /> {recipe.servings} порций</span> : null}
          </div>
          <div className="recipe-primary-actions">
            <Button size="lg" onClick={() => setCooking(true)}><ChefHat /> Режим готовки</Button>
            <Button size="lg" variant="outline" onClick={onEdit}><Pencil /> Редактировать</Button>
          </div>
        </div>
      </div>

      <div className="recipe-content-grid">
        <section className="recipe-section ingredients-section">
          <div className="section-heading-row">
            <div><p className="section-kicker">Подготовьте</p><h2>Ингредиенты</h2></div>
            {recipe.servings ? (
              <div className="servings-select"><span>Порций</span>
                <Select value={String(servings)} onValueChange={(value) => setServings(Number(value))}>
                  <SelectTrigger aria-label="Количество порций"><SelectValue /></SelectTrigger>
                  <SelectContent>{[...new Set([...Array.from({ length: 16 }, (_, index) => index + 1), recipe.servings, recipe.servings * 2])].sort((a, b) => a - b).map((value) => <SelectItem key={value} value={String(value)}>{String(value).replace(".", ",")}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            ) : null}
          </div>
          <ul className="ingredient-list">
            {scaledIngredients.map((item) => (
              <li key={item.id}><span>{item.name}{item.note ? <small>{item.note}</small> : null}</span><strong>{[formatAmount(item.amount, item.amountText), item.unit].filter(Boolean).join(" ") || "по вкусу"}</strong></li>
            ))}
          </ul>
          <Button variant="outline" size="lg" className="w-full" onClick={() => { setSelectedIngredients(new Set(recipe.ingredients.map((item) => item.id))); setShoppingOpen(true); }}><ShoppingBasket /> Добавить в покупки</Button>
        </section>
        <section className="recipe-section steps-section">
          <p className="section-kicker">По порядку</p><h2>Приготовление</h2>
          <ol className="step-list">
            {recipe.steps.map((step, index) => <li key={step.id}><span>{index + 1}</span><p>{step.text}</p></li>)}
          </ol>
        </section>
      </div>

      {(recipe.note || recipe.familyStory) && <div className="recipe-notes">
        {recipe.note ? <section><h2>Заметка</h2><p>{recipe.note}</p></section> : null}
        {recipe.familyStory ? <section className="family-story"><h2>Источник или комментарий</h2><p>{recipe.familyStory}</p></section> : null}
      </div>}

      {recipe.tags.length > 0 && <div className="tag-list">{recipe.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>}
      <div className="danger-zone"><Button variant="ghost" onClick={onEdit}><Pencil /> Редактировать</Button><AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" className="text-destructive"><Trash2 /> Удалить</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Переместить рецепт в корзину?</AlertDialogTitle><AlertDialogDescription>«{recipe.title}» можно будет восстановить в настройках. Фотографии пока не удалятся.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Оставить</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={onDelete}>Переместить</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div>

      <Dialog open={shoppingOpen} onOpenChange={setShoppingOpen}>
        <DialogContent className="shopping-picker">
          <DialogTitle>Что добавить в покупки?</DialogTitle>
          <DialogDescription>Снимите отметку с того, что уже есть дома. Количество рассчитано на {servings} порц.</DialogDescription>
          <div className="shopping-picker__list">
            {scaledIngredients.map((item) => <label key={item.id}><Checkbox checked={selectedIngredients.has(item.id)} onCheckedChange={(checked) => setSelectedIngredients((current) => { const next = new Set(current); if (checked) next.add(item.id); else next.delete(item.id); return next; })} /><span>{item.name}</span><strong>{[formatAmount(item.amount, item.amountText), item.unit].filter(Boolean).join(" ") || "по вкусу"}</strong></label>)}
          </div>
          <Button size="lg" onClick={() => void addSelectedToShopping()} disabled={shoppingBusy || !selectedIngredients.size}><ShoppingBasket /> {shoppingBusy ? "Сохраняем…" : `Добавить выбранное (${selectedIngredients.size})`}</Button>
        </DialogContent>
      </Dialog>
      <CookingMode recipe={recipe} open={cooking} onOpenChange={setCooking} />
    </section>
  );
}
