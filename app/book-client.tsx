"use client";

import { lazy, Suspense, useDeferredValue, useEffect, useState } from "react";
import { ArchiveRestore, BookHeart, BookOpen, ChefHat, ChevronRight, Cloud, CloudOff, Heart, Home, Menu, Plus, Search, Settings, ShoppingBasket, SlidersHorizontal, Sparkles, Trash2, UtensilsCrossed, WifiOff, X } from "lucide-react";
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
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "../components/ui/sheet";
import { Skeleton } from "../components/ui/skeleton";
import { Toaster } from "../components/ui/sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "../components/ui/alert-dialog";
import { isPortableRuntime, runtimeAssetUrl } from "../services/runtime-config";

const RecipeForm = lazy(() => import("../components/recipe-form").then((module) => ({ default: module.RecipeForm })));
const ImportCenter = lazy(() => import("../components/import-center").then((module) => ({ default: module.ImportCenter })));
const SettingsPage = lazy(() => import("../components/settings-page").then((module) => ({ default: module.SettingsPage })));

export type InitialView = "home" | "catalog" | "shopping" | "settings" | "import" | "trash";

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function RecipeBook({ initialView = "home", initialRecipeId }: { initialView?: InitialView; initialRecipeId?: string }) {
  return <BookProvider><BookExperience initialView={initialView} initialRecipeId={initialRecipeId} /><Toaster position="top-center" richColors /></BookProvider>;
}

function BookExperience({ initialView, initialRecipeId }: { initialView: InitialView; initialRecipeId?: string }) {
  const { snapshot, loading, syncState, pendingCount, perform, performMany, refresh } = useBook();
  const portable = isPortableRuntime();
  const [view, setView] = useState<InitialView>(initialView);
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(initialRecipeId ?? null);
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null | undefined>(undefined);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [authorId, setAuthorId] = useState<string | null>(null);
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [withPhoto, setWithPhoto] = useState<boolean | null>(null);
  const [showIntro, setShowIntro] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [updateReady, setUpdateReady] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const initialFrame = window.requestAnimationFrame(() => {
      if (params.get("action") === "add") setEditingRecipe(null);
      if (params.get("view") === "shopping") setView("shopping");
    });
    const beforeInstall = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPromptEvent); };
    window.addEventListener("beforeinstallprompt", beforeInstall);
    const controllerChange = () => location.reload();
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register(runtimeAssetUrl("sw.js")).then((registration) => {
        if (registration.waiting) setUpdateReady(registration);
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          worker?.addEventListener("statechange", () => { if (worker.state === "installed" && navigator.serviceWorker.controller) setUpdateReady(registration); });
        });
      }).catch(() => undefined);
      navigator.serviceWorker.addEventListener("controllerchange", controllerChange);
    }
    return () => { window.cancelAnimationFrame(initialFrame); window.removeEventListener("beforeinstallprompt", beforeInstall); navigator.serviceWorker?.removeEventListener("controllerchange", controllerChange); };
  }, []);

  useEffect(() => {
    const readRoute = () => {
      if (portable && (location.hash.includes("access_token=") || location.hash.includes("error="))) return;
      const path = portable ? location.hash.replace(/^#\/?/, "") : location.pathname.replace(/^\//, "");
      const recipeMatch = path.match(/^recipe\/([^/]+)/);
      if (recipeMatch) { setSelectedRecipeId(decodeURIComponent(recipeMatch[1])); setEditingRecipe(undefined); return; }
      setSelectedRecipeId(null); setEditingRecipe(undefined);
      if (["catalog", "shopping", "settings", "import", "trash"].includes(path)) setView(path as InitialView);
      else setView("home");
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
    setView(next); setSelectedRecipeId(null); setEditingRecipe(undefined);
    history.pushState({}, "", routeUrl(next));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const openRecipe = (id: string) => {
    setSelectedRecipeId(id); setEditingRecipe(undefined);
    history.pushState({}, "", routeUrl("recipe", id));
    window.scrollTo({ top: 0 });
  };
  const closeRecipe = () => {
    setSelectedRecipeId(null); setEditingRecipe(undefined);
    history.pushState({}, "", routeUrl(view));
    window.scrollTo({ top: 0 });
  };

  const selectedRecipe = selectedRecipeId ? snapshot.recipes.find((recipe) => recipe.id === selectedRecipeId) ?? null : null;
  const selectedCategory = selectedRecipe ? snapshot.categories.find((item) => item.id === selectedRecipe.categoryId) : undefined;
  const selectedAuthor = selectedRecipe ? snapshot.authors.find((item) => item.id === selectedRecipe.authorId) : undefined;

  const saveRecipe = async (recipe: Recipe) => {
    await perform({ type: "recipe.upsert", recipe });
    setSelectedRecipeId(recipe.id); setEditingRecipe(undefined);
    history.replaceState({}, "", routeUrl("recipe", recipe.id));
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
    content = <RecipeForm recipe={editingRecipe} bookId={snapshot.book.id} categories={snapshot.categories} authors={snapshot.authors} onSave={saveRecipe} onCancel={() => setEditingRecipe(undefined)} />;
  } else if (selectedRecipe) {
    content = <RecipeDetail recipe={selectedRecipe} category={selectedCategory} author={selectedAuthor} onBack={closeRecipe} onEdit={() => setEditingRecipe(selectedRecipe)} onFavorite={() => void perform({ type: "recipe.favorite", recipeId: selectedRecipe.id, favorite: !selectedRecipe.favorite })} onDelete={() => { void perform({ type: "recipe.delete", recipeId: selectedRecipe.id, deletedAt: nowIso() }); closeRecipe(); toast.success("Рецепт перемещён в корзину"); }} onRestore={() => void perform({ type: "recipe.restore", recipeId: selectedRecipe.id })} onAddShopping={(items) => void addShopping(items)} />;
  } else if (view === "shopping") {
    content = <ShoppingList bookId={snapshot.book.id} items={snapshot.shoppingItems} onUpsert={(item) => void perform({ type: "shopping.upsert", item })} onDelete={(itemId) => void perform({ type: "shopping.delete", itemId })} onClearChecked={() => void perform({ type: "shopping.clearChecked" })} />;
  } else if (view === "import") {
    content = <ImportCenter snapshot={snapshot} onBack={() => navigate("settings")} onImport={performMany} />;
  } else if (view === "settings") {
    content = <SettingsPage snapshot={snapshot} onNavigateImport={() => navigate("import")} onNavigateTrash={() => navigate("trash")} onShowIntro={() => setShowIntro(true)} onPerform={perform} onInstall={install} />;
  } else if (view === "trash") {
    content = <TrashView snapshot={snapshot} onBack={() => navigate("settings")} onOpen={openRecipe} onPerform={perform} />;
  } else {
    content = <LibraryView snapshot={snapshot} loading={loading} mode={view} query={query} deferredQuery={deferredQuery} categoryId={categoryId} authorId={authorId} favoriteOnly={favoriteOnly} withPhoto={withPhoto} onQuery={setQuery} onCategory={setCategoryId} onAuthor={setAuthorId} onFavoriteOnly={setFavoriteOnly} onWithPhoto={setWithPhoto} onMode={setView} onOpen={openRecipe} onFavorite={(recipe) => void perform({ type: "recipe.favorite", recipeId: recipe.id, favorite: !recipe.favorite })} />;
  }

  return (
    <div className="book-app">
      <a className="skip-link" href="#main-content">Перейти к содержанию</a>
      <DesktopSidebar view={view} onNavigate={navigate} shoppingCount={snapshot.shoppingItems.filter((item) => !item.checked).length} />
      <div className="book-app__main">
        {syncState === "local" && <div className="offline-banner local-banner"><CloudOff /> <span>Книга сохранена на этом устройстве. Подключите семейное облако для копии и других устройств.</span><Button variant="ghost" size="sm" onClick={() => navigate("settings")}>Подключить</Button></div>}
        {(syncState === "offline" || syncState === "error") && <div className="offline-banner"><WifiOff /> <span>Нет связи. Книга работает с сохранённой копией, изменения не потеряются.</span><Button variant="ghost" size="sm" onClick={() => void refresh()}>Повторить</Button></div>}
        {updateReady && <div className="update-banner"><Sparkles /><span>Доступно обновление книги</span><Button size="sm" onClick={() => updateReady.waiting?.postMessage({ type: "SKIP_WAITING" })}>Обновить</Button><button type="button" onClick={() => setUpdateReady(null)} aria-label="Скрыть"><X /></button></div>}
        <TopMobileBar syncState={syncState} pendingCount={pendingCount} onMenu={() => navigate("settings")} />
        <main id="main-content"><Suspense fallback={<PageLoading />}>{content}</Suspense></main>
      </div>
      {editingRecipe === undefined && !selectedRecipe && view !== "import" && <button type="button" className="floating-add" onClick={() => setEditingRecipe(null)}><Plus /> <span>Добавить рецепт</span></button>}
      {editingRecipe === undefined && !selectedRecipe && <MobileNavigation view={view} onNavigate={navigate} shoppingCount={snapshot.shoppingItems.filter((item) => !item.checked).length} />}
      <GiftIntro forced={showIntro} onClose={() => setShowIntro(false)} />
    </div>
  );
}

function LibraryView({ snapshot, loading, mode, query, deferredQuery, categoryId, authorId, favoriteOnly, withPhoto, onQuery, onCategory, onAuthor, onFavoriteOnly, onWithPhoto, onMode, onOpen, onFavorite }: {
  snapshot: ReturnType<typeof useBook>["snapshot"]; loading: boolean; mode: "home" | "catalog"; query: string; deferredQuery: string; categoryId: string | null; authorId: string | null; favoriteOnly: boolean; withPhoto: boolean | null;
  onQuery: (value: string) => void; onCategory: (value: string | null) => void; onAuthor: (value: string | null) => void; onFavoriteOnly: (value: boolean) => void; onWithPhoto: (value: boolean | null) => void; onMode: (value: InitialView) => void; onOpen: (id: string) => void; onFavorite: (recipe: Recipe) => void;
}) {
  const [pagination, setPagination] = useState({ key: "", count: 24 });
  const activeRecipes = snapshot.recipes.filter((recipe) => !recipe.deletedAt);
  const filtered = filterRecipes(activeRecipes, { query: deferredQuery, categoryId, authorId, favoriteOnly, withPhoto });
  const favorites = activeRecipes.filter((recipe) => recipe.favorite).slice(0, 6);
  const recent = [...activeRecipes].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6);
  const todayRecipe = activeRecipes.length ? activeRecipes[(new Date().getDate() + new Date().getMonth()) % activeRecipes.length] : null;
  const hasFilters = Boolean(categoryId || authorId || favoriteOnly || withPhoto !== null);
  const filterKey = `${deferredQuery}|${categoryId ?? ""}|${authorId ?? ""}|${favoriteOnly}|${withPhoto ?? ""}`;
  const visibleCount = pagination.key === filterKey ? pagination.count : 24;
  const card = (recipe: Recipe) => <RecipeCard key={recipe.id} recipe={recipe} category={snapshot.categories.find((item) => item.id === recipe.categoryId)} author={snapshot.authors.find((item) => item.id === recipe.authorId)} onOpen={() => onOpen(recipe.id)} onFavorite={() => onFavorite(recipe)} />;

  return <section className="page-view library-page">
    <header className="library-header">
      <div className="library-header__title"><p className="eyebrow">Семейная книга</p><h1>{APP_CONFIG.appName}</h1><p>Рецепты, к которым хочется возвращаться.</p></div>
      <SyncBadge />
    </header>
    <div className="search-panel"><Search /><Input value={query} onChange={(event) => { onQuery(event.target.value); if (event.target.value) onMode("catalog"); }} placeholder="Найти рецепт или ингредиент" aria-label="Найти рецепт или ингредиент" /><kbd>Поиск</kbd></div>
    <div className="category-strip" aria-label="Категории"><button type="button" className={!categoryId ? "is-active" : ""} onClick={() => { onCategory(null); onMode("catalog"); }}><span>✦</span>Все рецепты</button><button type="button" className={favoriteOnly ? "is-active" : ""} onClick={() => { onFavoriteOnly(!favoriteOnly); onMode("catalog"); }}><span>♡</span>Любимые</button>{snapshot.categories.map((category) => <button type="button" key={category.id} className={categoryId === category.id ? "is-active" : ""} onClick={() => { onCategory(category.id); onMode("catalog"); }}><span>{categoryEmoji(category.icon)}</span>{category.name}</button>)}</div>

    {mode === "home" && !query ? <>
      {todayRecipe && <section className="today-card"><div className="today-card__copy"><p><ChefHat /> Что приготовить сегодня?</p><h2>{todayRecipe.title}</h2><span>{todayRecipe.description || "Один из сохранённых семейных рецептов"}</span><Button onClick={() => onOpen(todayRecipe.id)}>Открыть рецепт <ChevronRight /></Button></div>{todayRecipe.coverImage ? <img src={todayRecipe.coverImage.url} alt={todayRecipe.coverImage.alt || todayRecipe.title} /> : <div className="today-card__pattern"><UtensilsCrossed /></div>}</section>}
      {favorites.length > 0 && <RecipeSection title="Любимые" subtitle="Самые родные рецепты" recipes={favorites} render={card} onAll={() => { onFavoriteOnly(true); onMode("catalog"); }} />}
      <RecipeSection title="Недавно добавленные" subtitle="Последние записи в книге" recipes={recent} render={card} onAll={() => onMode("catalog")} />
    </> : <>
      <div className="catalog-heading"><div><p className="eyebrow">Каталог</p><h2>{favoriteOnly ? "Любимые рецепты" : categoryId ? snapshot.categories.find((item) => item.id === categoryId)?.name : "Все рецепты"}</h2><p>{filtered.length} {pluralRecipes(filtered.length)}</p></div><Sheet><SheetTrigger asChild><Button variant={hasFilters ? "default" : "outline"}><SlidersHorizontal /> Фильтры{hasFilters ? " · есть" : ""}</Button></SheetTrigger><SheetContent side="right" className="filter-sheet w-[92vw] sm:max-w-md"><SheetHeader><SheetTitle>Фильтры</SheetTitle><SheetDescription>Оставьте только подходящие рецепты.</SheetDescription></SheetHeader><div className="filter-fields"><label className="field"><span>Категория</span><Select value={categoryId ?? "all"} onValueChange={(value) => onCategory(value === "all" ? null : value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Все категории</SelectItem>{snapshot.categories.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></label><label className="field"><span>Автор</span><Select value={authorId ?? "all"} onValueChange={(value) => onAuthor(value === "all" ? null : value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Все авторы</SelectItem>{snapshot.authors.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></label><label className="field"><span>Фотография</span><Select value={withPhoto === null ? "all" : withPhoto ? "yes" : "no"} onValueChange={(value) => onWithPhoto(value === "all" ? null : value === "yes")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Не важно</SelectItem><SelectItem value="yes">Только с фотографией</SelectItem><SelectItem value="no">Только без фотографии</SelectItem></SelectContent></Select></label><button className={`toggle-filter ${favoriteOnly ? "is-active" : ""}`} type="button" onClick={() => onFavoriteOnly(!favoriteOnly)}><Heart fill={favoriteOnly ? "currentColor" : "none"} /> Только любимые</button><Button variant="outline" onClick={() => { onCategory(null); onAuthor(null); onFavoriteOnly(false); onWithPhoto(null); }}>Сбросить фильтры</Button></div></SheetContent></Sheet></div>
      {loading ? <CardSkeletons /> : filtered.length ? <><div className="recipe-grid">{filtered.slice(0, visibleCount).map(card)}</div>{filtered.length > visibleCount && <div className="load-more"><Button variant="outline" size="lg" onClick={() => setPagination({ key: filterKey, count: visibleCount + 24 })}>Показать ещё {Math.min(24, filtered.length - visibleCount)}</Button></div>}</> : <div className="empty-state"><div><Search /></div><h2>{query ? "Ничего не нашли" : "Здесь пока нет рецептов"}</h2><p>{query ? "Попробуйте другое название или ингредиент." : "Нажмите «Добавить рецепт», чтобы сохранить первый."}</p>{hasFilters && <Button variant="outline" onClick={() => { onCategory(null); onAuthor(null); onFavoriteOnly(false); onWithPhoto(null); }}>Сбросить фильтры</Button>}</div>}
    </>}
  </section>;
}

function RecipeSection({ title, subtitle, recipes, render, onAll }: { title: string; subtitle: string; recipes: Recipe[]; render: (recipe: Recipe) => React.ReactNode; onAll: () => void }) {
  return <section className="home-section"><header><div><p className="section-kicker">{subtitle}</p><h2>{title}</h2></div><Button variant="ghost" onClick={onAll}>Смотреть все <ChevronRight /></Button></header><div className="recipe-grid">{recipes.map(render)}</div></section>;
}

function TrashView({ snapshot, onBack, onOpen, onPerform }: { snapshot: ReturnType<typeof useBook>["snapshot"]; onBack: () => void; onOpen: (id: string) => void; onPerform: (operation: BookOperationInput) => Promise<void> }) {
  const deleted = snapshot.recipes.filter((recipe) => recipe.deletedAt);
  return <section className="page-view compact-view"><Button variant="ghost" onClick={onBack}><ChevronRight className="rotate-180" /> Настройки</Button><header className="page-heading"><div><p className="eyebrow">Защита от ошибок</p><h1>Корзина</h1><p>Удалённые рецепты хранятся здесь, пока вы не удалите их окончательно.</p></div></header>{deleted.length ? <div className="trash-list">{deleted.map((recipe) => <div key={recipe.id}><button type="button" onClick={() => onOpen(recipe.id)}><span>{recipe.title}</span><small>Удалён {new Date(recipe.deletedAt!).toLocaleDateString("ru-RU")}</small></button><Button variant="outline" onClick={() => void onPerform({ type: "recipe.restore", recipeId: recipe.id })}><ArchiveRestore /> Восстановить</Button><AlertDialog><AlertDialogTrigger asChild><Button variant="ghost" className="text-destructive"><Trash2 /> Навсегда</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Удалить рецепт навсегда?</AlertDialogTitle><AlertDialogDescription>Вернуть «{recipe.title}» после этого будет можно только из резервной копии.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Отмена</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => void onPerform({ type: "recipe.deleteForever", recipeId: recipe.id })}>Удалить навсегда</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div>)}</div> : <div className="empty-state"><div><Trash2 /></div><h2>Корзина пуста</h2><p>Здесь появятся удалённые рецепты, и их можно будет восстановить.</p></div>}</section>;
}

function DesktopSidebar({ view, onNavigate, shoppingCount }: { view: InitialView; onNavigate: (view: InitialView) => void; shoppingCount: number }) {
  return <aside className="desktop-sidebar"><div className="brand-mark"><BookHeart /><span><strong>{APP_CONFIG.appName}</strong><small>Семейная книга</small></span></div><nav><NavButton active={view === "home"} icon={<Home />} label="Главная" onClick={() => onNavigate("home")} /><NavButton active={view === "catalog"} icon={<BookOpen />} label="Все рецепты" onClick={() => onNavigate("catalog")} /><NavButton active={view === "shopping"} icon={<ShoppingBasket />} label="Покупки" badge={shoppingCount} onClick={() => onNavigate("shopping")} /><NavButton active={view === "settings" || view === "import" || view === "trash"} icon={<Settings />} label="Настройки" onClick={() => onNavigate("settings")} /></nav><div className="sidebar-quote"><Sparkles /><p>«Сохранить семейные рецепты, чтобы они никогда не потерялись»</p></div></aside>;
}

function MobileNavigation({ view, onNavigate, shoppingCount }: { view: InitialView; onNavigate: (view: InitialView) => void; shoppingCount: number }) {
  return <nav className="mobile-nav" aria-label="Основная навигация"><NavButton active={view === "home"} icon={<Home />} label="Главная" onClick={() => onNavigate("home")} /><NavButton active={view === "catalog"} icon={<BookOpen />} label="Рецепты" onClick={() => onNavigate("catalog")} /><NavButton active={view === "shopping"} icon={<ShoppingBasket />} label="Покупки" badge={shoppingCount} onClick={() => onNavigate("shopping")} /><NavButton active={view === "settings" || view === "import" || view === "trash"} icon={<Settings />} label="Ещё" onClick={() => onNavigate("settings")} /></nav>;
}

function NavButton({ active, icon, label, badge, onClick }: { active: boolean; icon: React.ReactNode; label: string; badge?: number; onClick: () => void }) {
  return <button type="button" className={active ? "is-active" : ""} onClick={onClick}>{icon}<span>{label}</span>{badge ? <b>{badge > 99 ? "99+" : badge}</b> : null}</button>;
}

function TopMobileBar({ syncState, pendingCount, onMenu }: { syncState: SyncState; pendingCount: number; onMenu: () => void }) {
  return <header className="mobile-topbar"><div className="brand-mark"><BookHeart /><span><strong>{APP_CONFIG.appName}</strong><small>{syncState === "local" ? "Сохранено на телефоне" : syncState === "offline" || syncState === "error" ? "Работаем без сети" : pendingCount ? `Ждут отправки: ${pendingCount}` : "Всё сохранено"}</small></span></div><button type="button" onClick={onMenu} aria-label="Открыть настройки"><Menu /></button></header>;
}

function SyncBadge() { const { syncState, pendingCount } = useBook(); return <div className={`sync-badge sync-badge--${syncState}`}>{syncState === "offline" || syncState === "error" || syncState === "local" ? <CloudOff /> : <Cloud />}{syncState === "syncing" || syncState === "loading" ? "Сохраняем…" : syncState === "local" ? "Только на устройстве" : syncState === "offline" || syncState === "error" ? "Без интернета" : pendingCount ? `Ожидают: ${pendingCount}` : "Всё сохранено"}</div>; }
function CardSkeletons() { return <div className="recipe-grid">{Array.from({ length: 4 }, (_, index) => <div className="card-skeleton" key={index}><Skeleton className="aspect-[4/3] rounded-[22px]" /><Skeleton className="mt-4 h-4 w-20" /><Skeleton className="mt-3 h-7 w-4/5" /><Skeleton className="mt-3 h-4 w-1/2" /></div>)}</div>; }
function PageLoading() { return <section className="page-view"><CardSkeletons /></section>; }
function categoryEmoji(icon: string) { return ({ salad: "🥗", soup: "🥣", flame: "🍲", croissant: "🥐", cake: "🍰", sunrise: "🍳", cup: "☕", jar: "🫙", bookmark: "📖" } as Record<string, string>)[icon] ?? "📖"; }
function pluralRecipes(count: number) { const mod10 = count % 10, mod100 = count % 100; if (mod10 === 1 && mod100 !== 11) return "рецепт"; if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "рецепта"; return "рецептов"; }
