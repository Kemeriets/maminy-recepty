"use client";

import { useState } from "react";
import { CheckCheck, Plus, ShoppingBasket, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Input } from "./ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "./ui/alert-dialog";
import { formatAmount } from "../features/book/logic";
import { createId, nowIso } from "../lib/ids";
import type { ShoppingItem } from "../types/book";

interface ShoppingListProps {
  bookId: string;
  items: ShoppingItem[];
  onUpsert: (item: ShoppingItem) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClearChecked: () => Promise<void>;
  onClearAll: () => Promise<void>;
}

export function ShoppingList({ bookId, items, onUpsert, onDelete, onClearChecked, onClearAll }: ShoppingListProps) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const sorted = [...items].sort((a, b) => Number(a.checked) - Number(b.checked) || a.createdAt.localeCompare(b.createdAt));
  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try { await action(); }
    catch { toast.error("Не удалось изменить покупки", { description: "Данные остались на устройстве. Попробуйте ещё раз." }); }
    finally { setBusy(false); }
  };
  const add = () => void run(async () => {
    if (!name.trim()) return;
    const now = nowIso();
    await onUpsert({ id: createId("shop"), bookId, name: name.trim(), amount: null, unit: "", checked: false, createdAt: now, updatedAt: now });
    setName("");
  });
  return (
    <section className="page-view shopping-page">
      <header className="page-heading"><div><h1>Список покупок</h1><p>Добавляйте продукты из рецептов или вручную.</p></div></header>
      {items.length > 0 && <div className="shopping-toolbar">{items.some((item) => item.checked) && <Button variant="outline" disabled={busy} onClick={() => void run(onClearChecked)}><CheckCheck /> Убрать купленное</Button>}<AlertDialog open={clearOpen} onOpenChange={setClearOpen}><AlertDialogTrigger asChild><Button variant="outline" disabled={busy}><Trash2 /> Очистить весь список</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Очистить все покупки?</AlertDialogTitle><AlertDialogDescription>Будут удалены все пункты, в том числе ещё не купленные. Сами рецепты останутся.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>Отмена</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={busy} onClick={(event) => { event.preventDefault(); void run(async () => { await onClearAll(); setClearOpen(false); toast.success("Список покупок очищен"); }); }}>{busy ? "Очищаем…" : "Очистить всё"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div>}
      <div className="shopping-add"><Input value={name} disabled={busy} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); add(); } }} placeholder="Что нужно купить?" aria-label="Новый пункт списка" /><Button size="lg" onClick={add} disabled={busy || !name.trim()}><Plus /> Добавить</Button></div>
      {sorted.length ? <div className="shopping-items">{sorted.map((item) => <div key={item.id} className={`shopping-item ${item.checked ? "is-checked" : ""}`}><Checkbox checked={item.checked} disabled={busy} onCheckedChange={(checked) => void run(() => onUpsert({ ...item, checked: Boolean(checked), updatedAt: nowIso() }))} aria-label={`Отметить «${item.name}» купленным`} /><div><strong>{item.name}</strong>{item.recipeId ? <span>Из рецепта</span> : null}</div><span>{[formatAmount(item.amount, item.amountText), item.unit].filter(Boolean).join(" ")}</span><button type="button" disabled={busy} onClick={() => void run(() => onDelete(item.id))} aria-label={`Удалить «${item.name}»`}><Trash2 /></button></div>)}</div> : <div className="empty-state"><div><ShoppingBasket /></div><h2>Список пока пуст</h2><p>Откройте рецепт и нажмите «Добавить в покупки» — или впишите продукт выше.</p></div>}
    </section>
  );
}
