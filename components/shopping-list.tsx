"use client";

import { useState } from "react";
import { CheckCheck, Plus, ShoppingBasket, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Input } from "./ui/input";
import { formatAmount } from "../features/book/logic";
import { createId, nowIso } from "../lib/ids";
import type { ShoppingItem } from "../types/book";

interface ShoppingListProps {
  bookId: string;
  items: ShoppingItem[];
  onUpsert: (item: ShoppingItem) => void;
  onDelete: (id: string) => void;
  onClearChecked: () => void;
}

export function ShoppingList({ bookId, items, onUpsert, onDelete, onClearChecked }: ShoppingListProps) {
  const [name, setName] = useState("");
  const sorted = [...items].sort((a, b) => Number(a.checked) - Number(b.checked) || a.createdAt.localeCompare(b.createdAt));
  const add = () => {
    if (!name.trim()) return;
    const now = nowIso();
    onUpsert({ id: createId("shop"), bookId, name: name.trim(), amount: null, unit: "", checked: false, createdAt: now, updatedAt: now });
    setName("");
  };
  return (
    <section className="page-view shopping-page">
      <header className="page-heading"><div><p className="eyebrow">В магазин</p><h1>Список покупок</h1><p>Сюда можно добавить продукты из рецепта или написать что-то вручную.</p></div>{items.some((item) => item.checked) && <Button variant="outline" onClick={onClearChecked}><CheckCheck /> Убрать купленное</Button>}</header>
      <div className="shopping-add"><Input value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") add(); }} placeholder="Что нужно купить?" aria-label="Новый пункт списка" /><Button size="lg" onClick={add} disabled={!name.trim()}><Plus /> Добавить</Button></div>
      {sorted.length ? <div className="shopping-items">{sorted.map((item) => <div key={item.id} className={`shopping-item ${item.checked ? "is-checked" : ""}`}><Checkbox checked={item.checked} onCheckedChange={(checked) => onUpsert({ ...item, checked: Boolean(checked), updatedAt: nowIso() })} aria-label={`Отметить «${item.name}» купленным`} /><div><strong>{item.name}</strong>{item.recipeId ? <span>Из рецепта</span> : null}</div><span>{[formatAmount(item.amount, item.amountText), item.unit].filter(Boolean).join(" ")}</span><button type="button" onClick={() => onDelete(item.id)} aria-label={`Удалить «${item.name}»`}><Trash2 /></button></div>)}</div> : <div className="empty-state"><div><ShoppingBasket /></div><h2>Список пока пуст</h2><p>Откройте рецепт и нажмите «Добавить в покупки» — или впишите продукт выше.</p></div>}
    </section>
  );
}
