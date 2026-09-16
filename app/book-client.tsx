"use client";

import { lazy, Suspense, useCallback, useDeferredValue, useEffect, useRef, useState } from "react";
import { ArchiveRestore, BookOpen, ChefHat, ChevronRight, Cloud, CloudOff, Dices, Heart, Menu, Plus, Search, Settings, ShoppingBasket, SlidersHorizontal, Sparkles, Trash2, UtensilsCrossed, WifiOff, X } from "lucide-react";
import { toast } from "sonner";
import { APP_CONFIG } from "../config/app.config";
import { BookProvider, useBook, type SyncState } from "../features/book/book-context";
import { filterRecipes, mergeShoppingIngredients } from "../features/book/logic";
import { nowIso } from "../lib/ids";
import type { BookOperationInput, Recipe, ShoppingItem } from "../types/book";
import { RecipeCard } from "../components/recipe-card";
import { GiftIntro } from "../components/gift-intro";
import { RecipeDetail } from "../components/recipe-detail";
import { ShoppingList } from "../components/shopping-list";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import { Skeleton } from "../components/ui/skeleton";
import { Toaster } from "../components/ui/sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "../components/ui/alert-dialog";
import { isPortableRuntime, runtimeAssetUrl } from "../services/runtime-config";

const RecipeForm = lazy(() => import("../components/recipe-form").then((module) => ({ default: module.RecipeForm })));
const ImportCenter = lazy(() => import("../components/import-center").then((module) => ({ default: module.ImportCenter })));
const SettingsPage = lazy(() => import("../components/settings-page").then((module) => ({ default: module.SettingsPage })));
const RandomRecipePage = lazy(() => import("../components/random-recipe-page").then((module) => ({ default: module.RandomRecipePage })));

export type InitialView = "home" | "catalog" | "random" | "shopping" | "settings" | "import" | "trash";

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function RecipeBook({ initialView = "catalog", initialRecipeId }: { initialView?: InitialView; initialRecipeId?: string }) {
  return <BookProvider><BookExperience initialView={initialView} initialRecipeId={initialRecipeId} /><Toaster position="top-center" richColors /></BookProvider>;
}

function BookExperience({ initialView, initialRecipeId }: { initialView: InitialView; initialRecipeId?: string }) {
  const { snapshot, loading, syncState, cloudConnected, perform, performMany, refresh } = useBook();
  const portable = isPortableRuntime();
  const [view, setView] = useState<InitialView>(initialView);
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(initialRecipeId ?? null);
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null | undefined>(undefined);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [withPhoto, setWithPhoto] = useState<boolean | null>(null);
  const [randomSelection, setRandomSelection] = useState<{ categoryId: string | null; recipeId: string | null }>({ categoryId: null, recipeId: null });
  const [showIntro, setShowIntro] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [updateReady, setUpdateReady] = useState<ServiceWorkerRegistration | null>(null);
  const serviceWorkerRegistration = useRef<ServiceWorkerRegistration | null>(null);
  const reloadingForUpdate = useRef(false);
  const editorDirty = useRef(false);
  const previousRoute = useRef("");
  const onEditorDirtyChange = useCallback((dirty: boolean) => { editorDirty.current = dirty; }, []);
  const performSafely = async (operation: BookOperationInput) => {
    try { await perform(operation); }
    catch { toast.error("Не удалось сохранить изменение", { description: "Проверьте свободное место на устройстве и попробуйте ещё раз." }); }
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const initialFrame = window.requestAnimationFrame(() => {
      if (params.get("action") === "add") setEditingRecipe(null);
      if (params.get("view") === "shopping") setView("shopping");
    });
    const beforeInstall = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPromptEvent); };
    window.addEventListener("beforeinstallprompt", beforeInstall);
    const controllerChange = () => {
      if (editorDirty.current) { toast("Приложение обновлено", { description: "Сначала сохраните рецепт. Новая версия откроется при следующем запуске." }); return; }
      if (reloadingForUpdate.current) return;
      reloadingForUpdate.current = true;
      location.reload();
    };
    const checkForUpdate = () => {
      const registration = serviceWorkerRegistration.current;
      if (registration) void registration.update().catch(() => undefined);
    };
    const checkWhenVisible = () => { if (document.visibilityState === "visible") checkForUpdate(); };
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register(runtimeAssetUrl("sw.js"), { updateViaCache: "none" }).then((registration) => {
        serviceWorkerRegistration.current = registration;
        if (registration.waiting) setUpdateReady(registration);
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          worker?.addEventListener("statechange", () => { if (worker.state === "installed" && navigator.serviceWorker.controller) setUpdateReady(registration); });
        });
        void registration.update().catch(() => undefined);
      }).catch(() => undefined);
      navigator.serviceWorker.addEventListener("controllerchange", controllerChange);
      document.addEventListener("visibilitychange", checkWhenVisible);
      window.addEventListener("online", checkForUpdate);
    }
    return () => { window.cancelAnimationFrame(initialFrame); window.removeEventListener("beforeinstallprompt", beforeInstall); navigator.serviceWorker?.removeEventListener("controllerchange", controllerChange); document.removeEventListener("visibilitychange", checkWhenVisible); window.removeEventListener("online", checkForUpdate); };
  }, []);

  const checkAppUpdate = async () => {
    if (!("serviceWorker" in navigator)) { toast.error("Обновления не поддерживаются этим браузером"); return; }
    try {
      const registration = serviceWorkerRegistration.current ?? await navigator.serviceWorker.getRegistration();
      if (!registration) { toast.error("Приложение ещё не готово к обновлению"); return; }
      serviceWorkerRegistration.current = registration;
      await registration.update();
      if (registration.waiting) {
        setUpdateReady(registration);
        registration.waiting.postMessage({ type: "SKIP_WAITING" });
      } else {
        toast.success("Установлена актуальная версия", { description: `Версия ${APP_CONFIG.version}` });
      }
    } catch {
      toast.error("Не удалось проверить обновление", { description: "Проверьте интернет и попробуйте ещё раз." });
    }
  };

  useEffect(() => {
    const readRoute = () => {
      if (portable && (location.hash.includes("access_token=") || location.hash.includes("error="))) return;
      if (editorDirty.current) {
        if (location.href === previousRoute.current) return;
        if (!window.confirm("Закрыть форму без сохранения? Введённые данные останутся в черновике.")) { history.pushState({}, "", previousRoute.current); return; }
      }
      editorDirty.current = false;
      previousRoute.current = location.href;
      const path = portable ? location.hash.replace(/^#\/?/, "") : location.pathname.replace(/^\//, "");
      const recipeMatch = path.match(/^recipe\/([^/]+)/);
      if (recipeMatch) { setSelectedRecipeId(decodeURIComponent(recipeMatch[1])); setEditingRecipe(undefined); return; }
      setSelectedRecipeId(null); setEditingRecipe(undefined);
      if (["home", "catalog", "random", "shopping", "settings", "import", "trash"].includes(path)) setView(path as InitialView);
      else setView("catalog");
    };
    readRoute();
    window.addEventListener("popstate", readRoute);
    window.addEventListener("hashchange", readRoute);
    return () => { window.removeEventListener("popstate", readRoute); window.removeEventListener("hashchange", readRoute); };
  }, [portable]);

  const routeUrl = (next: InitialView | "recipe", recipeId?: string) => {
    if (portable) {
      const route = next === "recipe" ? `recipe/${encodeURIComponent(recipeId ?? "")}` : next;
      return `${location.pathname}#${route}`;
    }
    if (next === "recipe") return `/recipe/${encodeURIComponent(recipeId ?? "")}`;
    return next === "import" ? "/import" : next === "settings" ? "/settings" : "/";
  };

  const navigate = (next: InitialView) => {
    if (editorDirty.current && !window.confirm("Закрыть форму без сохранения? Введённые данные останутся в черновике.")) return;
    editorDirty.current = false;
    if (next === "home" || next === "catalog") { setQuery(""); setCategoryId(null); setFavoriteOnly(false); setWithPhoto(null); }
    setView(next); setSelectedRecipeId(null); setEditingRecipe(undefined);
    history.pushState({}, "", routeUrl(next));
    previousRoute.current = location.href;
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const openRecipe = (id: string) => {
    setSelectedRecipeId(id); setEditingRecipe(undefined);
    history.pushState({}, "", routeUrl("recipe", id));
    previousRoute.current = location.href;
    window.scrollTo({ top: 0 });
  };
  const closeRecipe = () => {
    setSelectedRecipeId(null); setEditingRecipe(undefined);
    history.pushState({}, "", routeUrl(view));
    previousRoute.current = location.href;
    window.scrollTo({ top: 0 });
  };

  const selectedRecipe = selectedRecipeId ? snapshot.recipes.find((recipe) => recipe.id === selectedRecipeId) ?? null : null;
  const selectedCategory = selectedRecipe ? snapshot.categories.find((item) => item.id === selectedRecipe.categoryId) : undefined;

  const saveRecipe = async (recipe: Recipe) => {
    await perform({ type: "recipe.upsert", recipe });
    editorDirty.current = false;
    setSelectedRecipeId(recipe.id); setEditingRecipe(undefined);
    history.replaceState({}, "", routeUrl("recipe", recipe.id));
    previousRoute.current = location.href;
  };

  const addShopping = async (incoming: ShoppingItem[]) => {
    const merged = mergeShoppingIngredients(snapshot.shoppingItems.map((item) => ({ ...item })), incoming);
    const changed = merged.filter((item) => {
      const old = snapshot.shoppingItems.find((candidate) => candidate.id === item.id);
      return !old || old.amount !== item.amount || old.checked !== item.checked;
    });
    await performMany(changed.map((item) => ({ type: "shopping.upsert" as const, item: { ...item, updatedAt: nowIso() } })));
  };

  const install = installPrompt ? async () => {
    await installPrompt.prompt();
    const result = await installPrompt.userChoice;
    if (result.outcome === "accepted") setInstallPrompt(null);
  } : undefined;

  let content: React.ReactNode;
  if (editingRecipe !== undefined) {
    content = <RecipeForm key={editingRecipe?.id ?? "new"} recipe={editingRecipe} bookId={snapshot.book.id} categories={snapshot.categories} onSave={saveRecipe} onDirtyChange={onEditorDirtyChange} onCancel={() => { editorDirty.current = false; setEditingRecipe(undefined); }} />;
  } else if (selectedRecipe) {
    content = <RecipeDetail key={selectedRecipe.id} recipe={selectedRecipe} category={selectedCategory} onBack={closeRecipe} onEdit={() => setEditingRecipe(selectedRecipe)} onFavorite={() => void performSafely({ type: "recipe.favorite", recipeId: selectedRecipe.id, favorite: !selectedRecipe.favorite })} onDelete={() => { void perform({ type: "recipe.delete", recipeId: selectedRecipe.id, deletedAt: nowIso() }).then(() => { closeRecipe(); toast.success("Рецепт перемещён в корзину"); }).catch(() => toast.error("Не удалось удалить рецепт")); }} onRestore={() => void performSafely({ type: "recipe.restore", recipeId: selectedRecipe.id })} onAddShopping={addShopping} />;
  } else if (view === "shopping") {
    content = <ShoppingList bookId={snapshot.book.id} items={snapshot.shoppingItems} onUpsert={(item) => perform({ type: "shopping.upsert", item })} onDelete={(itemId) => perform({ type: "shopping.delete", itemId })} onClearChecked={() => performMany(snapshot.shoppingItems.filter((item) => item.checked).map((item) => ({ type: "shopping.delete", itemId: item.id })))} onClearAll={() => performMany(snapshot.shoppingItems.map((item) => ({ type: "shopping.delete", itemId: item.id })))} />;
  } else if (view === "random") {
    content = <RandomRecipePage recipes={snapshot.recipes} categories={snapshot.categories} selection={randomSelection} onSelectionChange={setRandomSelection} onOpen={openRecipe} onFavorite={(recipe) => void performSafely({ type: "recipe.favorite", recipeId: recipe.id, favorite: !recipe.favorite })} />;
  } else if (view === "import") {
    content = <ImportCenter snapshot={snapshot} onBack={() => navigate("settings")} onImport={performMany} />;
  } else if (view === "settings") {
    content = <SettingsPage snapshot={snapshot} onNavigateImport={() => navigate("import")} onNavigateTrash={() => navigate("trash")} onPerform={perform} onInstall={install} onCheckUpdate={checkAppUpdate} />;
  } else if (view === "trash") {
    content = <TrashView snapshot={snapshot} onBack={() => navigate("settings")} onOpen={openRecipe} onPerform={performSafely} />;
  } else {
    content = <LibraryView snapshot={snapshot} loading={loading} mode={view} query={query} deferredQuery={deferredQuery} categoryId={categoryId} favoriteOnly={favoriteOnly} withPhoto={withPhoto} onQuery={setQuery} onCategory={setCategoryId} onFavoriteOnly={setFavoriteOnly} onWithPhoto={setWithPhoto} onMode={setView} onSettings={() => navigate("settings")} onOpen={openRecipe} onFavorite={(recipe) => void performSafely({ type: "recipe.favorite", recipeId: recipe.id, favorite: !recipe.favorite })} />;
  }

  return (
    <div className="book-app">
      <a className="skip-link" href="#main-content">Перейти к содержанию</a>
      <DesktopSidebar view={view} onNavigate={navigate} shoppingCount={snapshot.shoppingItems.filter((item) => !item.checked).length} />
      <div className="book-app__main">
        {(syncState === "offline" || syncState === "error") && <div className="offline-banner"><WifiOff /> <span>{syncState === "error" ? "Не удалось выполнить синхронизацию. Рецепты доступны на устройстве." : cloudConnected ? "Нет интернета. Изменения сохраняются на устройстве и отправятся после подключения." : "Нет интернета. Рецепты сохраняются только на этом устройстве."}</span>{cloudConnected && <Button variant="ghost" size="sm" onClick={() => void refresh()}>Повторить</Button>}</div>}
        {updateReady && <div className="update-banner"><Sparkles /><span>{editingRecipe !== undefined ? "Обновление готово. Сначала сохраните или закройте рецепт." : "Доступно обновление"}</span><Button size="sm" disabled={editingRecipe !== undefined} onClick={() => updateReady.waiting?.postMessage({ type: "SKIP_WAITING" })}>Обновить</Button><button type="button" onClick={() => setUpdateReady(null)} aria-label="Скрыть"><X /></button></div>}
        <TopMobileBar onMenu={() => navigate("settings")} />
        <main id="main-content"><Suspense fallback={<PageLoading />}>{content}</Suspense></main>
      </div>
      {editingRecipe === undefined && !selectedRecipe && (view === "home" || view === "catalog") && <button type="button" className="floating-add" onClick={() => setEditingRecipe(null)}><Plus /> <span>Добавить рецепт</span></button>}
      {editingRecipe === undefined && !selectedRecipe && <MobileNavigation view={view} onNavigate={navigate} shoppingCount={snapshot.shoppingItems.filter((item) => !item.checked).length} />}
      <GiftIntro forced={showIntro} onClose={() => setShowIntro(false)} />
    </div>
  );
}

function LibraryView({ snapshot, loading, mode, query, deferredQuery, categoryId, favoriteOnly, withPhoto, onQuery, onCategory, onFavoriteOnly, onWithPhoto, onMode, onSettings, onOpen, onFavorite }: {
  snapshot: ReturnType<typeof useBook>["snapshot"]; loading: boolean; mode: "home" | "catalog"; query: string; deferredQuery: string; categoryId: string | null; favoriteOnly: boolean; withPhoto: boolean | null;
  onQuery: (value: string) => void; onCategory: (value: string | null) => void; onFavoriteOnly: (value: boolean) => void; onWithPhoto: (value: boolean | null) => void; onMode: (value: InitialView) => void; onSettings: () => void; onOpen: (id: string) => void; onFavorite: (recipe: Recipe) => void;
}) {
  const [pagination, setPagination] = useState({ key: "", count: 24 });
  const activeRecipes = snapshot.recipes.filter((recipe) => !recipe.deletedAt);
  const filtered = filterRecipes(activeRecipes, { query: deferredQuery, categoryId, favoriteOnly, withPhoto });
  const favorites = activeRecipes.filter((recipe) => recipe.favorite).slice(0, 6);
  const recent = [...activeRecipes].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6);
  const todayRecipe = activeRecipes.length ? activeRecipes[(new Date().getDate() + new Date().getMonth()) % activeRecipes.length] : null;
  const hasFilters = Boolean(categoryId || favoriteOnly || withPhoto !== null);
  const filterKey = `${deferredQuery}|${categoryId ?? ""}|${favoriteOnly}|${withPhoto ?? ""}`;
  const visibleCount = pagination.key === filterKey ? pagination.count : 24;
  const card = (recipe: Recipe) => <RecipeCard key={recipe.id} recipe={recipe} category={snapshot.categories.find((item) => item.id === recipe.categoryId)} onOpen={() => onOpen(recipe.id)} onFavorite={() => onFavorite(recipe)} />;
  const resetFilters = () => { onCategory(null); onFavoriteOnly(false); onWithPhoto(null); };
  const selectSection = (category: string | null, favorites = false) => { onCategory(category); onFavoriteOnly(favorites); onWithPhoto(null); onMode("catalog"); };

  return <section className="page-view library-page">
    <header className="library-header">
      <div className="library-header__title"><h1>{APP_CONFIG.appName}</h1></div>
      <SyncBadge onClick={onSettings} />
    </header>
    <div className="search-panel"><Search /><Input value={query} onChange={(event) => { onQuery(event.target.value); if (event.target.value) onMode("catalog"); }} placeholder="Найти рецепт или ингредиент" aria-label="Найти рецепт или ингредиент" />{query && <button type="button" className="search-clear" aria-label="Очистить поиск" onClick={() => onQuery("")}><X /></button>}</div>
    <div className="category-strip" aria-label="Категории"><button type="button" aria-pressed={!categoryId && !favoriteOnly} className={!categoryId && !favoriteOnly ? "is-active" : ""} onClick={() => selectSection(null)}><span aria-hidden="true">✦</span>Все рецепты</button><button type="button" aria-pressed={favoriteOnly && !categoryId} className={favoriteOnly && !categoryId ? "is-active" : ""} onClick={() => selectSection(null, true)}><span aria-hidden="true">♡</span>Любимые</button>{snapshot.categories.map((category) => <button type="button" key={category.id} aria-pressed={categoryId === category.id && !favoriteOnly} className={categoryId === category.id && !favoriteOnly ? "is-active" : ""} onClick={() => selectSection(category.id)}><span aria-hidden="true">{categoryEmoji(category.icon)}</span>{category.name}</button>)}</div>

    {mode === "home" && !query ? <>
      {todayRecipe && <section className="today-card"><div className="today-card__copy"><p><ChefHat /> Что приготовить сегодня?</p><h2>{todayRecipe.title}</h2>{todayRecipe.description && <span>{todayRecipe.description}</span>}<Button onClick={() => onOpen(todayRecipe.id)}>Открыть рецепт <ChevronRight /></Button></div>{todayRecipe.coverImage ? <img src={todayRecipe.coverImage.thumbnailUrl || todayRecipe.coverImage.url} alt={todayRecipe.coverImage.alt || todayRecipe.title} /> : <div className="today-card__pattern"><UtensilsCrossed /></div>}</section>}
      {favorites.length > 0 && <RecipeSection title="Любимые" recipes={favorites} render={card} onAll={() => selectSection(null, true)} />}
      {loading ? <CardSkeletons /> : recent.length ? <RecipeSection title="Недавно добавленные" recipes={recent} render={card} onAll={() => selectSection(null)} /> : <div className="empty-state"><div><BookOpen /></div><h2>Добавьте первый рецепт</h2><p>Нажмите «Добавить рецепт» или загрузите готовый файл через настройки.</p></div>}
    </> : <>
      <div className="catalog-heading">
        <div><h2>{favoriteOnly ? "Любимые рецепты" : categoryId ? snapshot.categories.find((item) => item.id === categoryId)?.name : "Все рецепты"}</h2><p>{filtered.length} {pluralRecipes(filtered.length)}</p></div>
        <RecipeFiltersPopover hasFilters={hasFilters} count={filtered.length}>
          <label className="field"><span>Категория</span><Select value={categoryId ?? "all"} onValueChange={(value) => onCategory(value === "all" ? null : value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Все категории</SelectItem>{snapshot.categories.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></label>
          <label className="field"><span>Фотография</span><Select value={withPhoto === null ? "all" : withPhoto ? "yes" : "no"} onValueChange={(value) => onWithPhoto(value === "all" ? null : value === "yes")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Не важно</SelectItem><SelectItem value="yes">Только с фотографией</SelectItem><SelectItem value="no">Только без фотографии</SelectItem></SelectContent></Select></label>
          <button className={`toggle-filter ${favoriteOnly ? "is-active" : ""}`} type="button" aria-pressed={favoriteOnly} onClick={() => onFavoriteOnly(!favoriteOnly)}><Heart fill={favoriteOnly ? "currentColor" : "none"} /> Только любимые</button><Button variant="outline" onClick={resetFilters}>Сбросить фильтры</Button>
        </RecipeFiltersPopover>
      </div>
      {loading ? <CardSkeletons /> : filtered.length ? <><div className="recipe-grid">{filtered.slice(0, visibleCount).map(card)}</div>{filtered.length > visibleCount && <div className="load-more"><Button variant="outline" size="lg" onClick={() => setPagination({ key: filterKey, count: visibleCount + 24 })}>Показать ещё {Math.min(24, filtered.length - visibleCount)}</Button></div>}</> : <div className="empty-state"><div>{favoriteOnly ? <Heart /> : <Search />}</div><h2>{query ? "Ничего не нашли" : favoriteOnly ? "Пока нет любимых рецептов" : categoryId ? "В этой категории пока пусто" : "Здесь пока нет рецептов"}</h2><p>{query ? "Попробуйте другое название или ингредиент. Фильтры тоже влияют на поиск." : favoriteOnly ? "Нажмите сердечко на рецепте — он появится здесь." : categoryId ? "Выберите другую категорию или добавьте новый рецепт." : "Нажмите «Добавить рецепт», чтобы сохранить первый."}</p>{hasFilters && <Button variant="outline" onClick={resetFilters}>Сбросить фильтры</Button>}</div>}
    </>}
  </section>;
}

function RecipeSection({ title, recipes, render, onAll }: { title: string; recipes: Recipe[]; render: (recipe: Recipe) => React.ReactNode; onAll: () => void }) {
  return <section className="home-section"><header><div><h2>{title}</h2></div><Button variant="ghost" onClick={onAll}>Смотреть все <ChevronRight /></Button></header><div className="recipe-grid">{recipes.map(render)}</div></section>;
}

function TrashView({ snapshot, onBack, onOpen, onPerform }: { snapshot: ReturnType<typeof useBook>["snapshot"]; onBack: () => void; onOpen: (id: string) => void; onPerform: (operation: BookOperationInput) => Promise<void> }) {
  const deleted = snapshot.recipes.filter((recipe) => recipe.deletedAt);
  return <section className="page-view compact-view"><Button variant="ghost" onClick={onBack}><ChevronRight className="rotate-180" /> Настройки</Button><header className="page-heading"><div><p className="eyebrow">Защита от ошибок</p><h1>Корзина</h1><p>Удалённые рецепты хранятся здесь, пока вы не удалите их окончательно.</p></div></header>{deleted.length ? <div className="trash-list">{deleted.map((recipe) => <div key={recipe.id}><button type="button" onClick={() => onOpen(recipe.id)}><span>{recipe.title}</span><small>Удалён {new Date(recipe.deletedAt!).toLocaleDateString("ru-RU")}</small></button><Button variant="outline" onClick={() => void onPerform({ type: "recipe.restore", recipeId: recipe.id })}><ArchiveRestore /> Восстановить</Button><AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" className="text-destructive"><Trash2 /> Навсегда</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Удалить рецепт навсегда?</AlertDialogTitle><AlertDialogDescription>Вернуть «{recipe.title}» после этого будет можно только из резервной копии.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Отмена</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => void onPerform({ type: "recipe.deleteForever", recipeId: recipe.id })}>Удалить навсегда</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div>)}</div> : <div className="empty-state"><div><Trash2 /></div><h2>Корзина пуста</h2><p>Здесь появятся удалённые рецепты, и их можно будет восстановить.</p></div>}</section>;
}

function DesktopSidebar({ view, onNavigate, shoppingCount }: { view: InitialView; onNavigate: (view: InitialView) => void; shoppingCount: number }) {
  return <aside className="desktop-sidebar"><div className="brand-mark"><BookOpen /><span><strong>{APP_CONFIG.appName}</strong></span></div><nav aria-label="Основная навигация"><NavButton active={view === "catalog" || view === "home"} icon={<BookOpen />} label="Все рецепты" onClick={() => onNavigate("catalog")} /><NavButton active={view === "random"} icon={<Dices />} label="Что приготовить?" onClick={() => onNavigate("random")} /><NavButton active={view === "shopping"} icon={<ShoppingBasket />} label="Покупки" badge={shoppingCount} onClick={() => onNavigate("shopping")} /><NavButton active={view === "settings" || view === "import" || view === "trash"} icon={<Settings />} label="Настройки" onClick={() => onNavigate("settings")} /></nav></aside>;
}

function MobileNavigation({ view, onNavigate, shoppingCount }: { view: InitialView; onNavigate: (view: InitialView) => void; shoppingCount: number }) {
  return <nav className="mobile-nav" aria-label="Основная навигация"><NavButton active={view === "catalog" || view === "home"} icon={<BookOpen />} label="Рецепты" onClick={() => onNavigate("catalog")} /><NavButton active={view === "random"} icon={<Dices />} label="Случайное" onClick={() => onNavigate("random")} /><NavButton active={view === "shopping"} icon={<ShoppingBasket />} label="Покупки" badge={shoppingCount} onClick={() => onNavigate("shopping")} /><NavButton active={view === "settings" || view === "import" || view === "trash"} icon={<Settings />} label="Ещё" onClick={() => onNavigate("settings")} /></nav>;
}

function RecipeFiltersPopover({ hasFilters, count, children }: { hasFilters: boolean; count: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button variant={hasFilters ? "default" : "outline"}><SlidersHorizontal /> Фильтры{hasFilters ? " · есть" : ""}</Button></PopoverTrigger><PopoverContent align="end" className="filter-popover" aria-label="Фильтры рецептов"><header><h3>Фильтры</h3><button type="button" onClick={() => setOpen(false)} aria-label="Закрыть фильтры"><X /></button></header><div className="filter-fields">{children}</div><Button className="w-full" onClick={() => setOpen(false)}>Показать рецепты ({count})</Button></PopoverContent></Popover>;
}

function NavButton({ active, icon, label, badge, onClick }: { active: boolean; icon: React.ReactNode; label: string; badge?: number; onClick: () => void }) {
  return <button type="button" className={active ? "is-active" : ""} onClick={onClick}>{icon}<span>{label}</span>{badge ? <b>{badge > 99 ? "99+" : badge}</b> : null}</button>;
}

function TopMobileBar({ onMenu }: { onMenu: () => void }) {
  const { syncState, pendingCount, cloudConnected } = useBook();
  return <header className="mobile-topbar"><div className="brand-mark"><BookOpen /><span><strong>{APP_CONFIG.appName}</strong><small>{storageStatus(syncState, pendingCount, cloudConnected)}</small></span></div><button type="button" onClick={onMenu} aria-label="Открыть настройки"><Menu /></button></header>;
}

function storageStatus(state: SyncState, pending: number, connected: boolean) { return state === "loading" ? "Открываем…" : !connected ? "Только на устройстве" : state === "syncing" ? "Синхронизируем…" : state === "error" ? "Ошибка синхронизации" : state === "offline" ? "Нет интернета" : pending ? `Ждут отправки: ${pending}` : "Синхронизировано"; }
function SyncBadge({ onClick }: { onClick: () => void }) { const { syncState, pendingCount, cloudConnected } = useBook(); return <button type="button" onClick={onClick} title="Хранение и резервная копия" className={`sync-badge sync-badge--${!cloudConnected ? "local" : syncState}`}>{!cloudConnected || syncState === "offline" || syncState === "error" ? <CloudOff /> : <Cloud />}{storageStatus(syncState, pendingCount, cloudConnected)}</button>; }
function CardSkeletons() { return <div className="recipe-grid">{Array.from({ length: 4 }, (_, index) => <div className="card-skeleton" key={index}><Skeleton className="aspect-[4/3] rounded-[22px]" /><Skeleton className="mt-4 h-4 w-20" /><Skeleton className="mt-3 h-7 w-4/5" /><Skeleton className="mt-3 h-4 w-1/2" /></div>)}</div>; }
function PageLoading() { return <section className="page-view"><CardSkeletons /></section>; }
function categoryEmoji(icon: string) { return ({ salad: "🥗", soup: "🥣", flame: "🍲", croissant: "🥐", cake: "🍰", sunrise: "🍳", cup: "☕", jar: "🫙", bookmark: "📖" } as Record<string, string>)[icon] ?? "📖"; }
function pluralRecipes(count: number) { const mod10 = count % 10, mod100 = count % 100; if (mod10 === 1 && mod100 !== 11) return "рецепт"; if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "рецепта"; return "рецептов"; }
