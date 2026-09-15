"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, Download, FileArchive, FileJson, ImagePlus, Loader2, Save, Sparkles, Upload, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "./ui/alert-dialog";
import { backupToImport, loadImportPackage, prepareImport, type DuplicateStrategy, type LoadedImportPackage } from "../services/import-service";
import { runtimeAssetUrl } from "../services/runtime-config";
import type { BookOperationInput, BookSnapshot } from "../types/book";

interface ImportCenterProps {
  snapshot: BookSnapshot;
  onBack: () => void;
  onImport: (operations: BookOperationInput[]) => Promise<void>;
}

function russianPlural(count: number, one: string, few: string, many: string) {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

export function ImportCenter({ snapshot, onBack, onImport }: ImportCenterProps) {
  const [loaded, setLoaded] = useState<LoadedImportPackage | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [strategy, setStrategy] = useState<DuplicateStrategy>("skip");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const originalCount = useMemo(() => loaded?.data.recipes.reduce((sum, recipe) => sum + (recipe.originalPageImages?.length ?? 0), 0) ?? 0, [loaded]);
  const missingImageCount = useMemo(() => loaded?.data.recipes.flatMap((recipe) => [recipe.coverImage, ...(recipe.originalPageImages ?? [])]).filter((spec) => spec?.fileName && !spec.dataUrl && !loaded.attachments.has(spec.fileName)).length ?? 0, [loaded]);

  const readFiles = async (files: File[]) => {
    if (!files.length) return;
    setLoading(true); setError(""); setLoaded(null); setSelectedFiles(files);
    try { setLoaded(await loadImportPackage(files)); }
    catch (value) { setError(value instanceof Error ? value.message : "Не удалось прочитать файлы"); }
    finally { setLoading(false); }
  };

  const execute = async (replaceBook = false) => {
    if (!loaded) return;
    setImporting(true);
    try {
      const sourcePackage = replaceBook && loaded.backup ? { ...loaded, data: backupToImport(loaded.backup, true) } : loaded;
      const prepared = await prepareImport(sourcePackage, replaceBook ? { ...snapshot, recipes: [], shoppingItems: [] } : snapshot, replaceBook ? "copy" : strategy);
      const operations: BookOperationInput[] = [];
      if (replaceBook) {
        operations.push(...snapshot.recipes.map((recipe) => ({ type: "recipe.deleteForever" as const, recipeId: recipe.id })));
        operations.push(...snapshot.shoppingItems.map((item) => ({ type: "shopping.delete" as const, itemId: item.id })));
      }
      operations.push(...prepared.operations);
      if (replaceBook && loaded.backup) {
        operations.push(...loaded.backup.shoppingItems.map((item) => ({ type: "shopping.upsert" as const, item: { ...item, bookId: snapshot.book.id } })));
        operations.push(...loaded.backup.recipes.filter((recipe) => recipe.favorite && !recipe.deletedAt).map((recipe) => ({ type: "recipe.favorite" as const, recipeId: recipe.id, favorite: true })));
        operations.push(...loaded.backup.recipes.filter((recipe) => recipe.deletedAt).map((recipe) => ({ type: "recipe.delete" as const, recipeId: recipe.id, deletedAt: recipe.deletedAt! })));
      }
      await onImport(operations);
      const parts = [`Добавлено рецептов: ${prepared.recipes.length}`];
      if (prepared.skippedTitles.length) parts.push(`пропущено совпадений: ${prepared.skippedTitles.length}`);
      toast.success("Импорт завершён", { description: parts.join(", ") });
      setLoaded(null); setSelectedFiles([]);
    } catch (value) {
      toast.error("Не удалось импортировать рецепты", { description: value instanceof Error ? value.message : "Проверьте файл и попробуйте снова." });
    } finally { setImporting(false); }
  };

  return (
    <section className="page-view import-page">
      <Button variant="ghost" onClick={onBack} className="back-button"><ArrowLeft /> Настройки</Button>
      <header className="page-heading"><div><h1>Импорт рецептов</h1><p>Переписывайте страницы по одной или загрузите сразу много рецептов из файла. Фотографии страниц сохранятся рядом с рецептами.</p></div></header>

      <Tabs defaultValue="manual" className="import-tabs">
        <TabsList className="import-tabs__list" aria-label="Способ переноса">
          <TabsTrigger value="manual"><ImagePlus /> По страницам</TabsTrigger>
          <TabsTrigger value="batch"><FileArchive /> Массовый импорт</TabsTrigger>
        </TabsList>

        <TabsContent value="manual">
          <ManualImportDesk snapshot={snapshot} onImport={onImport} />
        </TabsContent>

        <TabsContent value="batch">
          <div className="import-workflow">
        <section className="workflow-card">
          <span className="workflow-card__number">1</span><div><h2>Отдайте фотографии нейросети</h2><p>Приложите к нейросети все снимки страниц и готовую инструкцию. Она должна вернуть один JSON-файл, а не сохранять рецепты сама.</p><div className="workflow-actions"><Button asChild variant="outline"><a href={runtimeAssetUrl("examples/ai-import-prompt.txt")} download><Download /> Скачать промпт</a></Button><Button asChild variant="ghost"><a href={runtimeAssetUrl("examples/recipes-import.example.json")} download><FileJson /> Пример JSON</a></Button></div></div>
        </section>
        <section className="workflow-card">
          <span className="workflow-card__number">2</span><div><h2>Выберите JSON и исходные фотографии</h2><p>Можно выбрать их одновременно. Имена снимков должны совпадать с <code>fileName</code> в JSON. Ещё удобнее — сложить JSON и фотографии в один ZIP.</p></div>
        </section>
        <section className="workflow-card">
          <span className="workflow-card__number">3</span><div><h2>Проверьте список и импортируйте</h2><p>Одинаковые названия по умолчанию пропускаются. При желании существующий рецепт можно заменить новой версией.</p></div>
        </section>
          </div>

          <label className={`import-dropzone ${loading ? "is-loading" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void readFiles(Array.from(event.dataTransfer.files)); }}>
        {loading ? <Loader2 className="animate-spin" /> : <Upload />}
        <strong>{loading ? "Проверяем файлы…" : "Выбрать JSON, ZIP и фотографии"}</strong>
        <span>или перетащите их сюда с компьютера</span>
        <small>До 1000 рецептов за один импорт</small>
        <input type="file" multiple accept=".json,.zip,application/json,application/zip,image/*" onChange={(event) => void readFiles(Array.from(event.target.files ?? []))} />
          </label>

          {selectedFiles.length > 0 && !loaded && !loading && <div className="file-chips">{selectedFiles.map((file) => <span key={`${file.name}-${file.size}`}>{file.type.startsWith("image/") ? <ImagePlus /> : <FileArchive />}{file.name}</span>)}</div>}
          {error && <div className="import-error"><XCircle /><div><strong>Файл не прошёл проверку</strong><p>{error}</p></div></div>}

          {loaded && <section className="import-preview">
        <div className="import-preview__header"><div><CheckCircle2 /><span>Файл прочитан</span></div><small>{loaded.fileName}</small></div>
        <div className="import-stats"><div><strong>{loaded.data.recipes.length}</strong><span>{russianPlural(loaded.data.recipes.length, "рецепт", "рецепта", "рецептов")}</span></div><div><strong>{loaded.data.recipes.reduce((sum, recipe) => sum + recipe.ingredients.length, 0)}</strong><span>{russianPlural(loaded.data.recipes.reduce((sum, recipe) => sum + recipe.ingredients.length, 0), "ингредиент", "ингредиента", "ингредиентов")}</span></div><div><strong>{originalCount}</strong><span>{russianPlural(originalCount, "страница-оригинал", "страницы-оригинала", "страниц-оригиналов")}</span></div></div>
        <div className="import-title-list">{loaded.data.recipes.slice(0, 12).map((recipe, index) => <span key={`${recipe.title}-${index}`}>{recipe.title}</span>)}{loaded.data.recipes.length > 12 && <span>и ещё {loaded.data.recipes.length - 12}</span>}</div>
        <label className="field import-strategy"><span>Если такое название уже есть</span><Select value={strategy} onValueChange={(value) => setStrategy(value as DuplicateStrategy)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="skip">Пропустить существующий рецепт</SelectItem><SelectItem value="replace">Заменить его новой версией</SelectItem><SelectItem value="copy">Добавить ещё одну копию</SelectItem></SelectContent></Select></label>
        {missingImageCount > 0 && <div className="import-warning"><AlertTriangle /><p>Не найдено фотографий: {missingImageCount}. Тексты импортируются, а отсутствующие снимки будут пропущены.</p></div>}
        <div className="import-preview__actions">
          <Button size="lg" onClick={() => void execute(false)} disabled={importing}>{importing ? <Loader2 className="animate-spin" /> : <Sparkles />} Добавить {loaded.data.recipes.length} {russianPlural(loaded.data.recipes.length, "рецепт", "рецепта", "рецептов")}</Button>
          {loaded.backup && <AlertDialog><AlertDialogTrigger asChild><Button variant="outline" size="lg">Восстановить книгу целиком</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Заменить рецепты текущей книги?</AlertDialogTitle><AlertDialogDescription>Сначала скачайте свежую резервную копию. Текущие рецепты и покупки будут удалены, затем восстановятся данные из архива. Отменить это действие одной кнопкой нельзя.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Не заменять</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => void execute(true)}>Да, восстановить</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}
        </div>
          </section>}
        </TabsContent>
      </Tabs>
    </section>
  );
}

interface ManualDraft {
  title: string;
  category: string;
  ingredients: string;
  steps: string;
  note: string;
  familyStory: string;
}

const EMPTY_MANUAL_DRAFT: ManualDraft = {
  title: "",
  category: "",
  ingredients: "",
  steps: "",
  note: "",
  familyStory: "",
};

function parseIngredientRows(value: string) {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const [name = "", amount = "", unit = "", ...note] = line.split("|").map((part) => part.trim());
    return { name, amount: amount || null, unit, note: note.join(" | ") || undefined };
  }).filter((item) => item.name);
}

function ManualImportDesk({ snapshot, onImport }: Pick<ImportCenterProps, "snapshot" | "onImport">) {
  const [pages, setPages] = useState<File[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, ManualDraft>>({});
  const [saved, setSaved] = useState<Set<string>>(() => new Set());
  const [saving, setSaving] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const current = pages[currentIndex];
  const currentKey = current ? `${current.name}:${current.size}:${current.lastModified}` : "";
  const draft = drafts[currentKey] ?? EMPTY_MANUAL_DRAFT;

  useEffect(() => {
    if (!current) return;
    const url = URL.createObjectURL(current);
    const frame = window.requestAnimationFrame(() => setPreviewUrl(url));
    return () => { window.cancelAnimationFrame(frame); URL.revokeObjectURL(url); };
  }, [current]);

  const choosePages = (files: File[]) => {
    const images = files.filter((file) => file.type.startsWith("image/"));
    setPages(images);
    setCurrentIndex(0);
    setDrafts({});
    setSaved(new Set());
  };
  const update = (field: keyof ManualDraft, value: string) => {
    if (!currentKey) return;
    setDrafts((all) => ({ ...all, [currentKey]: { ...(all[currentKey] ?? EMPTY_MANUAL_DRAFT), [field]: value } }));
  };
  const saveCurrent = async () => {
    if (!current) return;
    const ingredients = parseIngredientRows(draft.ingredients);
    const steps = draft.steps.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (!draft.title.trim()) { toast.error("Добавьте название рецепта"); return; }
    if (!ingredients.length) { toast.error("Добавьте хотя бы один ингредиент"); return; }
    if (!steps.length) { toast.error("Добавьте хотя бы один шаг приготовления"); return; }
    setSaving(true);
    try {
      const prepared = await prepareImport({
        data: {
          schemaVersion: 1,
          generatedAt: new Date().toISOString(),
          source: "Ручной перенос старой книги",
          recipes: [{
            title: draft.title.trim(),
            category: draft.category.trim() || undefined,
            ingredients,
            steps,
            note: draft.note.trim() || undefined,
            familyStory: draft.familyStory.trim() || undefined,
            originalPageImages: [{ fileName: current.name, alt: `Оригинальная страница рецепта ${draft.title.trim()}` }],
          }],
        },
        attachments: new Map([[current.name, current]]),
        backup: null,
        fileName: current.name,
      }, snapshot, "copy");
      await onImport(prepared.operations);
      setSaved((items) => new Set(items).add(currentKey));
      toast.success("Рецепт сохранён", { description: pages.length > 1 ? `Страница ${currentIndex + 1} из ${pages.length}` : undefined });
      if (currentIndex < pages.length - 1) setCurrentIndex((index) => index + 1);
    } catch (value) {
      toast.error("Не удалось сохранить рецепт", { description: value instanceof Error ? value.message : "Попробуйте ещё раз." });
    } finally { setSaving(false); }
  };

  if (!pages.length) return <section className="manual-import-empty">
    <div><ImagePlus /><h2>Выберите фотографии страниц</h2><p>Можно выбрать сразу всю папку снимков. Затем переписывайте рецепты один за другим — фотография каждой страницы сохранится как оригинал.</p></div>
    <label className="file-button manual-import-picker"><ImagePlus /> Выбрать фотографии<input type="file" multiple accept="image/*" onChange={(event) => choosePages(Array.from(event.target.files ?? []))} /></label>
  </section>;

  return <section className="manual-import">
    <header className="manual-import__toolbar">
      <div><strong>Страница {currentIndex + 1} из {pages.length}</strong><span>Сохранено: {saved.size}</span></div>
      <label className="file-button"><ImagePlus /> Выбрать другие<input type="file" multiple accept="image/*" onChange={(event) => choosePages(Array.from(event.target.files ?? []))} /></label>
    </header>
    <div className="manual-import__desk">
      <aside className="manual-import__page">
        <div className="manual-import__image">{previewUrl && <img src={previewUrl} alt={`Страница ${currentIndex + 1}: ${current.name}`} />}</div>
        <div className="manual-import__pager">
          <Button variant="outline" size="icon" aria-label="Предыдущая страница" disabled={currentIndex === 0} onClick={() => setCurrentIndex((index) => index - 1)}><ChevronLeft /></Button>
          <span className={saved.has(currentKey) ? "is-saved" : ""}>{saved.has(currentKey) ? <><CheckCircle2 /> Сохранено</> : current.name}</span>
          <Button variant="outline" size="icon" aria-label="Следующая страница" disabled={currentIndex === pages.length - 1} onClick={() => setCurrentIndex((index) => index + 1)}><ChevronRight /></Button>
        </div>
      </aside>
      <div className="manual-import__form">
        <label className="field"><span>Название блюда *</span><Input value={draft.title} onChange={(event) => update("title", event.target.value)} autoFocus placeholder="Например, торт «Черепаха»" /></label>
        <div>
          <label className="field"><span>Категория</span><Input list="manual-category-list" value={draft.category} onChange={(event) => update("category", event.target.value)} placeholder="Десерты" /><datalist id="manual-category-list">{snapshot.categories.map((item) => <option key={item.id} value={item.name} />)}</datalist></label>
        </div>
        <label className="field"><span>Ингредиенты * — по одному в строке</span><Textarea value={draft.ingredients} onChange={(event) => update("ingredients", event.target.value)} rows={7} placeholder={"Мука | 300 | г\nЯйца | 4 | шт.\nСоль | по вкусу |"} /><small>Формат: название | количество | единица | заметка</small></label>
        <label className="field"><span>Приготовление * — один шаг в строке</span><Textarea value={draft.steps} onChange={(event) => update("steps", event.target.value)} rows={8} placeholder={"Смешать ингредиенты.\nВыпекать 35 минут при 180 °C."} /></label>
        <label className="field"><span>Заметка</span><Textarea value={draft.note} onChange={(event) => update("note", event.target.value)} rows={3} placeholder="Тонкости и исправления" /></label>
        <label className="field"><span>Источник или комментарий</span><Textarea value={draft.familyStory} onChange={(event) => update("familyStory", event.target.value)} rows={3} placeholder="Откуда рецепт, что можно изменить" /></label>
        <Button size="lg" onClick={() => void saveCurrent()} disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Save />} {currentIndex < pages.length - 1 ? "Сохранить и перейти дальше" : "Сохранить рецепт"}</Button>
      </div>
    </div>
  </section>;
}
