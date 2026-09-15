"use client";

import { type BaseSyntheticEvent, useEffect, useMemo, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { ArrowDown, ArrowLeft, ArrowUp, Camera, GripVertical, ImagePlus, Plus, Save, Trash2, X } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "./ui/alert-dialog";
import { createId, nowIso } from "../lib/ids";
import { prepareAndQueueImage } from "../services/image-service";
import { getDraft, removeDraft, saveDraft } from "../services/local-store";
import type { Category, Ingredient, Recipe, RecipeImage, RecipeStep } from "../types/book";
import { isOptionalRecipeNumber } from "../features/book/recipe-input";

const optionalNumber = z.string().refine((value) => isOptionalRecipeNumber(value), "Введите число не меньше нуля");
const recipeFormSchema = z.object({
  title: z.string().trim().min(1, "Введите название блюда").max(120, "Слишком длинное название"),
  description: z.string().max(10000, "Максимум 10 000 символов в описании"),
  categoryId: z.string(),
  servings: z.string().refine((value) => isOptionalRecipeNumber(value, true), "Порций должно быть больше нуля"),
  prepTimeMinutes: optionalNumber,
  cookTimeMinutes: optionalNumber,
  ingredients: z.array(z.object({
    id: z.string(), name: z.string().trim().min(1, "Напишите название ингредиента"), amount: z.string(), unit: z.string(), note: z.string(),
  })).min(1, "Добавьте хотя бы один ингредиент"),
  steps: z.array(z.object({ id: z.string(), text: z.string().trim().min(1, "Опишите шаг") })).min(1, "Добавьте хотя бы один шаг"),
  note: z.string().max(40000, "Максимум 40 000 символов в заметке"),
  familyStory: z.string().max(40000, "Максимум 40 000 символов в комментарии"),
  tags: z.string().max(300, "Слишком много тегов"),
});

type RecipeFormValues = z.infer<typeof recipeFormSchema>;
interface RecipeDraft { values: RecipeFormValues; coverImage: RecipeImage | null; originalImages: RecipeImage[]; baseUpdatedAt?: string; }

function numberToInput(value: number | null): string { return value === null ? "" : String(value).replace(".", ","); }
function inputToNumber(value: string): number | null {
  if (!value.trim()) return null;
  const number = Number(value.replace(",", "."));
  return Number.isFinite(number) ? number : null;
}

function defaults(recipe?: Recipe | null): RecipeFormValues {
  return {
    title: recipe?.title ?? "", description: recipe?.description ?? "", categoryId: recipe?.categoryId ?? "none",
    servings: numberToInput(recipe?.servings ?? null), prepTimeMinutes: numberToInput(recipe?.prepTimeMinutes ?? null), cookTimeMinutes: numberToInput(recipe?.cookTimeMinutes ?? null),
    ingredients: recipe?.ingredients.length ? recipe.ingredients.map((item) => ({ id: item.id, name: item.name, amount: item.amount === null ? (item.amountText ?? "") : numberToInput(item.amount), unit: item.unit, note: item.note ?? "" })) : [{ id: createId("ing"), name: "", amount: "", unit: "", note: "" }],
    steps: recipe?.steps.length ? recipe.steps.map((step) => ({ id: step.id, text: step.text })) : [{ id: createId("step"), text: "" }],
    note: recipe?.note ?? "", familyStory: recipe?.familyStory ?? "", tags: recipe?.tags.join(", ") ?? "",
  };
}

interface RecipeFormProps {
  recipe?: Recipe | null;
  bookId: string;
  categories: Category[];
  onSave: (recipe: Recipe) => Promise<void> | void;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

export function RecipeForm({ recipe, bookId, categories, onSave, onCancel, onDirtyChange }: RecipeFormProps) {
  const draftKey = `recipe:${recipe?.id ?? "new"}`;
  const initialDefaults = useMemo(() => defaults(recipe), [recipe]);
  const [coverImage, setCoverImage] = useState<RecipeImage | null>(recipe?.coverImage ?? null);
  const [originalImages, setOriginalImages] = useState<RecipeImage[]>(recipe?.originalPageImages ?? []);
  const [imageJobs, setImageJobs] = useState(0);
  const [imageDirty, setImageDirty] = useState(false);
  const [draftChecked, setDraftChecked] = useState(false);
  const processingImage = imageJobs > 0;
  const form = useForm<RecipeFormValues>({ resolver: zodResolver(recipeFormSchema), defaultValues: initialDefaults, mode: "onBlur" });
  const ingredients = useFieldArray({ control: form.control, name: "ingredients", keyName: "fieldKey" });
  const steps = useFieldArray({ control: form.control, name: "steps", keyName: "fieldKey" });
  const values = useWatch({ control: form.control });
  const dirty = form.formState.isDirty || imageDirty || processingImage;
  const savedSuccessfully = useRef(false);
  const draftWrites = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let active = true;
    getDraft<RecipeDraft | RecipeFormValues>(draftKey).then((draft) => {
      if (!active) return;
      if (draft && !form.formState.isDirty) {
        const stored = "values" in draft ? draft : { values: draft, coverImage: recipe?.coverImage ?? null, originalImages: recipe?.originalPageImages ?? [] };
        if ("baseUpdatedAt" in stored && recipe && stored.baseUpdatedAt !== recipe.updatedAt) return;
        form.reset(stored.values, { keepDefaultValues: true });
        setCoverImage(stored.coverImage); setOriginalImages(stored.originalImages); setImageDirty(true);
        toast("Черновик восстановлен", { description: "Можно продолжить с того места, где вы остановились." });
      }
    }).catch(() => undefined).finally(() => { if (active) setDraftChecked(true); });
    return () => { active = false; };
  }, [draftKey, form, recipe]);

  useEffect(() => {
    if (!draftChecked || !dirty || form.formState.isSubmitting) return;
    const persist = () => {
      if (savedSuccessfully.current) return;
      draftWrites.current = draftWrites.current.then(() => saveDraft(draftKey, { values: form.getValues(), coverImage, originalImages, baseUpdatedAt: recipe?.updatedAt } satisfies RecipeDraft)).catch(() => { toast.error("Не удалось сохранить черновик", { description: "Не закрывайте форму до сохранения рецепта. Проверьте свободное место." }); });
    };
    const timer = window.setTimeout(persist, 450);
    return () => { window.clearTimeout(timer); persist(); };
  }, [draftKey, form, values, coverImage, originalImages, dirty, draftChecked, recipe?.updatedAt, form.formState.isSubmitting]);

  useEffect(() => { onDirtyChange?.(dirty); return () => onDirtyChange?.(false); }, [dirty, onDirtyChange]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  const handleImage = async (file: File | undefined, kind: "cover" | "original") => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Выберите фотографию"); return; }
    setImageJobs((count) => count + 1);
    try {
      const image = await prepareAndQueueImage(file, kind, kind === "cover" ? `Фотография блюда ${form.getValues("title") || "без названия"}` : "Оригинал страницы старой книги");
      if (kind === "cover") setCoverImage(image); else setOriginalImages((images) => [...images, image]);
      setImageDirty(true);
    } catch { toast.error("Не удалось обработать фотографию"); }
    finally { setImageJobs((count) => count - 1); }
  };

  const submit = async (event?: BaseSyntheticEvent) => {
    if (processingImage) { event?.preventDefault(); toast("Дождитесь обработки фотографии"); return; }
    await form.handleSubmit(async (values) => {
    const now = nowIso();
    const parsedIngredients: Ingredient[] = values.ingredients.map((item, order) => {
      const parsed = inputToNumber(item.amount);
      return { id: item.id, name: item.name.trim(), amount: parsed, amountText: parsed === null ? item.amount.trim() || null : null, unit: item.unit.trim(), note: item.note.trim() || null, order };
    });
    const parsedSteps: RecipeStep[] = values.steps.map((step, order) => ({ id: step.id, order, text: step.text.trim(), image: recipe?.steps.find((old) => old.id === step.id)?.image ?? null }));
    const next: Recipe = {
      id: recipe?.id ?? createId("recipe"), bookId, title: values.title.trim(), description: values.description.trim(),
      categoryId: values.categoryId === "none" ? null : values.categoryId, authorId: recipe?.authorId ?? null,
      coverImage, originalPageImages: originalImages, servings: inputToNumber(values.servings), prepTimeMinutes: inputToNumber(values.prepTimeMinutes), cookTimeMinutes: inputToNumber(values.cookTimeMinutes),
      ingredients: parsedIngredients, steps: parsedSteps, note: values.note.trim(), familyStory: values.familyStory.trim(), tags: values.tags.split(/[,;#]/).map((tag) => tag.trim()).filter(Boolean),
      favorite: recipe?.favorite ?? false, isDemo: false, createdAt: recipe?.createdAt ?? now, updatedAt: now, deletedAt: null, revision: (recipe?.revision ?? 0) + 1,
    };
    try {
      await onSave(next);
      savedSuccessfully.current = true;
      await draftWrites.current;
      await removeDraft(draftKey).catch(() => undefined);
      form.reset(values); setImageDirty(false); onDirtyChange?.(false);
      toast.success(recipe ? "Рецепт обновлён" : "Рецепт сохранён");
    } catch { toast.error("Не удалось сохранить рецепт", { description: "Форма осталась заполненной. Проверьте свободное место и попробуйте ещё раз." }); }
    })(event);
  };

  const cancelButton = dirty ? (
    <AlertDialog>
      <AlertDialogTrigger asChild><Button type="button" variant="ghost"><ArrowLeft /> Назад</Button></AlertDialogTrigger>
      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Закрыть без сохранения?</AlertDialogTitle><AlertDialogDescription>Изменения останутся в локальном черновике, но рецепт пока не попадёт в книгу.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Продолжить редактирование</AlertDialogCancel><AlertDialogAction onClick={onCancel}>Закрыть форму</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
    </AlertDialog>
  ) : <Button type="button" variant="ghost" onClick={onCancel}><ArrowLeft /> Назад</Button>;

  return (
    <section className="page-view recipe-editor">
      <header className="editor-header">
        {cancelButton}
        <div><p className="eyebrow">{recipe ? "Редактирование" : "Новый рецепт"}</p><h1>{recipe ? recipe.title : "Добавить рецепт"}</h1></div>
        <Button type="button" aria-label="Сохранить рецепт" onClick={() => void submit()} disabled={form.formState.isSubmitting || processingImage}><Save /> Сохранить</Button>
      </header>
      <form onSubmit={submit} className="editor-form" noValidate>
        <section className="form-card form-card--identity">
          <div className="cover-uploader">
            {coverImage ? <div className="cover-uploader__preview"><img src={coverImage.url} alt={coverImage.alt || "Фотография блюда"} /><button type="button" onClick={() => { setCoverImage(null); setImageDirty(true); }} aria-label="Удалить фотографию"><X /></button></div> : <div className="cover-uploader__empty"><ImagePlus /><strong>Фотография блюда</strong><span>Будет сжата перед загрузкой</span></div>}
            <div className="cover-uploader__actions">
              <label className="file-button"><ImagePlus /> Из галереи<input type="file" accept="image/*" onChange={(event) => void handleImage(event.target.files?.[0], "cover")} /></label>
              <label className="file-button"><Camera /> Сфотографировать<input type="file" accept="image/*" capture="environment" onChange={(event) => void handleImage(event.target.files?.[0], "cover")} /></label>
            </div>
          </div>
          <div className="identity-fields">
            <label className="field field--wide"><span>Название блюда *</span><Input {...form.register("title")} placeholder="Например, яблочный пирог" aria-invalid={Boolean(form.formState.errors.title)} autoFocus /><small>{form.formState.errors.title?.message}</small></label>
            <label className="field field--wide"><span>Короткое описание</span><Textarea {...form.register("description")} placeholder="Чем этот рецепт особенно хорош" rows={3} /><small>{form.formState.errors.description?.message}</small></label>
            <div>
              <label className="field"><span>Категория</span><Controller control={form.control} name="categoryId" render={({ field }) => <Select value={field.value} onValueChange={field.onChange}><SelectTrigger><SelectValue placeholder="Выберите" /></SelectTrigger><SelectContent><SelectItem value="none">Без категории</SelectItem>{categories.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select>} /></label>
            </div>
            <div className="field-grid field-grid--three">
              <label className="field"><span>Порций</span><Input {...form.register("servings")} inputMode="decimal" placeholder="4" aria-invalid={Boolean(form.formState.errors.servings)} /><small>{form.formState.errors.servings?.message}</small></label>
              <label className="field"><span>Подготовка, мин</span><Input {...form.register("prepTimeMinutes")} inputMode="numeric" placeholder="20" /><small>{form.formState.errors.prepTimeMinutes?.message}</small></label>
              <label className="field"><span>Готовка, мин</span><Input {...form.register("cookTimeMinutes")} inputMode="numeric" placeholder="40" /><small>{form.formState.errors.cookTimeMinutes?.message}</small></label>
            </div>
          </div>
        </section>

        <section className="form-card">
          <div className="form-card__heading"><div><p className="section-kicker">Что понадобится</p><h2>Ингредиенты</h2></div><span>{ingredients.fields.length}</span></div>
          <div className="dynamic-list ingredients-editor">
            {ingredients.fields.map((item, index) => <div className="dynamic-row ingredient-row" key={item.fieldKey}>
              <GripVertical className="drag-hint" aria-hidden="true" />
              <label className="field"><span>Название</span><Input {...form.register(`ingredients.${index}.name`)} placeholder="Мука" aria-invalid={Boolean(form.formState.errors.ingredients?.[index]?.name)} /><small>{form.formState.errors.ingredients?.[index]?.name?.message}</small></label>
              <label className="field"><span>Количество</span><Input {...form.register(`ingredients.${index}.amount`)} placeholder="300 или по вкусу" inputMode="decimal" /></label>
              <label className="field"><span>Единица</span><Input {...form.register(`ingredients.${index}.unit`)} placeholder="г" /></label>
              <label className="field field--note"><span>Уточнение</span><Textarea {...form.register(`ingredients.${index}.note`)} placeholder="просеять" rows={2} /></label>
              <div className="row-actions"><button type="button" onClick={() => ingredients.move(index, index - 1)} disabled={index === 0} aria-label="Поднять ингредиент"><ArrowUp /></button><button type="button" onClick={() => ingredients.move(index, index + 1)} disabled={index === ingredients.fields.length - 1} aria-label="Опустить ингредиент"><ArrowDown /></button><button type="button" className="delete" onClick={() => ingredients.fields.length > 1 && ingredients.remove(index)} disabled={ingredients.fields.length === 1} aria-label="Удалить ингредиент"><Trash2 /></button></div>
            </div>)}
          </div>
          <Button type="button" variant="outline" size="lg" onClick={() => ingredients.append({ id: createId("ing"), name: "", amount: "", unit: "", note: "" })}><Plus /> Добавить ингредиент</Button>
        </section>

        <section className="form-card">
          <div className="form-card__heading"><div><p className="section-kicker">Один за другим</p><h2>Шаги приготовления</h2></div><span>{steps.fields.length}</span></div>
          <div className="dynamic-list steps-editor">
            {steps.fields.map((item, index) => <div className="dynamic-row step-row" key={item.fieldKey}>
              <span className="step-row__number">{index + 1}</span>
              <label className="field"><span>Шаг {index + 1}</span><Textarea {...form.register(`steps.${index}.text`)} placeholder="Опишите, что нужно сделать" rows={3} aria-invalid={Boolean(form.formState.errors.steps?.[index]?.text)} /><small>{form.formState.errors.steps?.[index]?.text?.message}</small></label>
              <div className="row-actions"><button type="button" onClick={() => steps.move(index, index - 1)} disabled={index === 0} aria-label="Поднять шаг"><ArrowUp /></button><button type="button" onClick={() => steps.move(index, index + 1)} disabled={index === steps.fields.length - 1} aria-label="Опустить шаг"><ArrowDown /></button><button type="button" className="delete" onClick={() => steps.fields.length > 1 && steps.remove(index)} disabled={steps.fields.length === 1} aria-label="Удалить шаг"><Trash2 /></button></div>
            </div>)}
          </div>
          <Button type="button" variant="outline" size="lg" onClick={() => steps.append({ id: createId("step"), text: "" })}><Plus /> Добавить шаг</Button>
        </section>

        <section className="form-card optional-fields">
          <div className="form-card__heading"><h2>Дополнительно</h2></div>
          <label className="field"><span>Заметка</span><Textarea {...form.register("note")} placeholder="Например: сахара класть совсем немного" rows={3} /><small>{form.formState.errors.note?.message}</small></label>
          <label className="field"><span>Источник или комментарий</span><Textarea {...form.register("familyStory")} placeholder="Откуда рецепт, что можно изменить или заменить" rows={3} /><small>{form.formState.errors.familyStory?.message}</small></label>
          <label className="field"><span>Теги через запятую</span><Input {...form.register("tags")} placeholder="быстро, к празднику, яблоки" /><small>{form.formState.errors.tags?.message}</small></label>
        </section>

        <div className="editor-savebar">
          <div><strong>{recipe ? "Сохранить изменения" : "Добавить рецепт"}</strong><span>Рецепт сохранится на этом устройстве. Подключённая синхронизация отправит копию автоматически.</span></div>
          <Button type="submit" size="lg" disabled={form.formState.isSubmitting || processingImage}><Save /> {form.formState.isSubmitting ? "Сохраняем…" : "Сохранить рецепт"}</Button>
        </div>
      </form>
    </section>
  );
}
