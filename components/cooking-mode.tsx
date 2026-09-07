"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, Lightbulb, LockKeyhole, Minus, Plus } from "lucide-react";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { formatAmount, scaleIngredient } from "../features/book/logic";
import type { Recipe } from "../types/book";

interface WakeLockSentinelLike { release(): Promise<void>; addEventListener(type: "release", listener: () => void): void; }

export function CookingMode({ recipe, open, onOpenChange }: { recipe: Recipe; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [servings, setServings] = useState(recipe.servings || 1);
  const [wakeActive, setWakeActive] = useState(false);
  const wakeLock = useRef<WakeLockSentinelLike | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const requestWakeLock = async () => {
      try {
        const nav = navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<WakeLockSentinelLike> } };
        if (!nav.wakeLock) return;
        const sentinel = await nav.wakeLock.request("screen");
        wakeLock.current = sentinel;
        if (!cancelled) setWakeActive(true);
        sentinel.addEventListener("release", () => { if (wakeLock.current === sentinel) wakeLock.current = null; setWakeActive(false); });
      } catch { setWakeActive(false); }
    };
    void requestWakeLock();
    const onVisibility = () => { if (document.visibilityState === "visible" && !wakeLock.current) void requestWakeLock(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void wakeLock.current?.release();
      wakeLock.current = null;
      setWakeActive(false);
    };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="cooking-mode max-w-none gap-0 overflow-y-auto rounded-none border-0 p-0">
        <header className="cooking-mode__header">
          <Button variant="ghost" size="lg" onClick={() => onOpenChange(false)}><ChevronLeft /> Назад</Button>
          <div>
            <DialogTitle>{recipe.title}</DialogTitle>
            <DialogDescription className="sr-only">Пошаговый режим приготовления</DialogDescription>
          </div>
          <span className={`wake-state ${wakeActive ? "is-active" : ""}`} title={wakeActive ? "Экран не выключится" : "Не удалось удерживать экран включённым"}>
            <LockKeyhole /> <span>{wakeActive ? "Экран включён" : "Обычный режим"}</span>
          </span>
        </header>
        <main className="cooking-mode__content">
          <section className="cooking-mode__ingredients">
            <div className="section-heading-row">
              <h2>Ингредиенты</h2>
              {recipe.servings ? (
                <div className="portion-stepper" aria-label="Количество порций">
                  <button type="button" onClick={() => setServings((value) => Math.max(1, value - 1))} aria-label="Уменьшить порции"><Minus /></button>
                  <span><strong>{servings}</strong> порц.</span>
                  <button type="button" onClick={() => setServings((value) => value + 1)} aria-label="Увеличить порции"><Plus /></button>
                </div>
              ) : null}
            </div>
            <ul>
              {recipe.ingredients.map((original) => {
                const item = scaleIngredient(original, recipe.servings, servings);
                return <li key={item.id}><span>{item.name}</span><strong>{[formatAmount(item.amount, item.amountText), item.unit].filter(Boolean).join(" ")}</strong>{item.note ? <small>{item.note}</small> : null}</li>;
              })}
            </ul>
          </section>
          <section className="cooking-mode__steps">
            <h2>Приготовление</h2>
            <div className="cooking-steps">
              {recipe.steps.map((step, index) => {
                const done = completed.has(step.id);
                return (
                  <label key={step.id} className={`cooking-step ${done ? "is-done" : ""}`}>
                    <Checkbox checked={done} onCheckedChange={(checked) => setCompleted((current) => {
                      const next = new Set(current); if (checked) next.add(step.id); else next.delete(step.id); return next;
                    })} aria-label={`Отметить шаг ${index + 1}`} />
                    <span className="cooking-step__number">{done ? <Check /> : index + 1}</span>
                    <span>{step.text}</span>
                  </label>
                );
              })}
            </div>
          </section>
          {recipe.note ? <aside className="cooking-note"><Lightbulb /><div><strong>Не забыть</strong><p>{recipe.note}</p></div></aside> : null}
        </main>
      </DialogContent>
    </Dialog>
  );
}
