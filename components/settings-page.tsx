"use client";

import { useState } from "react";
import { Archive, BookHeart, ChevronRight, Cloud, CloudOff, Download, FolderHeart, Info, Loader2, LogOut, PackageOpen, Plus, RefreshCw, RotateCcw, Smartphone, Trash2, UserRound, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "./ui/alert-dialog";
import { APP_CONFIG } from "../config/app.config";
import { downloadJsonBackup, downloadZipBackup } from "../services/backup-service";
import { createId, nowIso } from "../lib/ids";
import { useBook } from "../features/book/book-context";
import type { Author, BookOperationInput, BookSnapshot, Category } from "../types/book";

interface SettingsPageProps {
  snapshot: BookSnapshot;
  onNavigateImport: () => void;
  onNavigateTrash: () => void;
  onShowIntro: () => void;
  onPerform: (operation: BookOperationInput) => Promise<void>;
  onInstall?: () => Promise<void>;
}

export function SettingsPage({ snapshot, onNavigateImport, onNavigateTrash, onShowIntro, onPerform, onInstall }: SettingsPageProps) {
  const { cloudProvider, cloudReady, cloudConnected, pendingCount, connectCloud, disconnectCloud, refresh } = useBook();
  const [zipLoading, setZipLoading] = useState(false);
  const [cloudBusy, setCloudBusy] = useState(false);
  const deletedCount = snapshot.recipes.filter((recipe) => recipe.deletedAt).length;
  const demoCount = snapshot.recipes.filter((recipe) => recipe.isDemo).length;
  const fullBackup = async () => {
    setZipLoading(true);
    try { await downloadZipBackup(snapshot); toast.success("Полная копия готова"); }
    catch (value) { toast.error("Не удалось собрать ZIP", { description: value instanceof Error ? value.message : "Попробуйте с компьютера." }); }
    finally { setZipLoading(false); }
  };
  const syncCloud = async () => {
    setCloudBusy(true);
    try {
      const synchronized = await refresh();
      if (synchronized) toast.success("Книга синхронизирована");
      else toast.error("Не удалось синхронизировать книгу", { description: "Изменения сохранены на этом устройстве. Проверьте интернет и попробуйте ещё раз." });
    }
    catch { toast.error("Не удалось синхронизировать книгу"); }
    finally { setCloudBusy(false); }
  };
  const disconnect = async () => {
    setCloudBusy(true);
    try { await disconnectCloud(); toast("Семейное облако отключено", { description: "Рецепты остались на этом устройстве." }); }
    finally { setCloudBusy(false); }
  };
  return (
    <section className="page-view settings-page">
      <header className="page-heading"><div><p className="eyebrow">Ваша книга</p><h1>Настройки</h1><p>Здесь только то, что может понадобиться не каждый день.</p></div></header>
      <div className="settings-grid">
        {cloudProvider === "yandex-disk" && <section className="settings-card settings-card--important"><div className="settings-card__icon">{cloudConnected ? <Cloud /> : <CloudOff />}</div><div><p className="section-kicker">Защита семейной книги</p><h2>Семейное облако</h2>{!cloudReady ? <><p>Подключение ещё настраивается. Все рецепты пока надёжно сохраняются на этом устройстве.</p><small>После первоначальной настройки здесь появится одна кнопка входа.</small></> : cloudConnected ? <><p>Подключено через Яндекс Диск. Рецепты и фотографии можно открыть на другом разрешённом устройстве после входа в тот же аккаунт.</p><div className="settings-actions"><Button onClick={() => void syncCloud()} disabled={cloudBusy}>{cloudBusy ? <Loader2 className="animate-spin" /> : <RefreshCw />} Синхронизировать</Button><AlertDialog><AlertDialogTrigger asChild><Button variant="outline" disabled={cloudBusy}>Отключить</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Отключить семейное облако?</AlertDialogTitle><AlertDialogDescription>Рецепты на этом устройстве останутся. Новые изменения не появятся на других устройствах, пока вы снова не подключитесь.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Оставить подключённым</AlertDialogCancel><AlertDialogAction onClick={() => void disconnect()}>Отключить</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div><small>{pendingCount ? `Ожидают отправки: ${pendingCount}` : "Все изменения отправлены"}</small></> : <><p>Сейчас рецепты хранятся только на этом устройстве. Подключите бесплатную приватную копию, чтобы они не потерялись и открывались на телефоне и компьютере.</p><Button onClick={connectCloud}><Cloud /> Подключить Яндекс Диск</Button><small>Приложение получит доступ только к своей папке, а не ко всему Диску. Пароль приложению не передаётся.</small></>}</div></section>}
        <section className="settings-card settings-card--important"><div className="settings-card__icon"><Archive /></div><div><p className="section-kicker">Самое важное</p><h2>Резервная копия</h2><p>JSON сохранит все тексты. ZIP дополнительно положит внутрь фотографии и оригинальные страницы.</p><div className="settings-actions"><Button onClick={() => downloadJsonBackup(snapshot)} variant="outline"><Download /> Скачать JSON</Button><Button onClick={() => void fullBackup()} disabled={zipLoading}>{zipLoading ? <Loader2 className="animate-spin" /> : <PackageOpen />} Полная копия ZIP</Button></div><small>Для большой книги ZIP удобнее скачивать с компьютера.</small></div></section>
        <button className="settings-row" type="button" onClick={onNavigateImport}><span className="settings-row__icon"><RotateCcw /></span><span><strong>Импорт и восстановление</strong><small>Добавить много рецептов из JSON/ZIP или восстановить копию</small></span><ChevronRight /></button>
        <ManageList title="Категории" description={`${snapshot.categories.length} разделов`} icon={<FolderHeart />} items={snapshot.categories} kind="category" bookId={snapshot.book.id} onPerform={onPerform} />
        <ManageList title="Авторы" description={`${snapshot.authors.length} семейных авторов`} icon={<UsersRound />} items={snapshot.authors} kind="author" bookId={snapshot.book.id} onPerform={onPerform} />
        <button className="settings-row" type="button" onClick={onNavigateTrash}><span className="settings-row__icon"><Trash2 /></span><span><strong>Корзина</strong><small>{deletedCount ? `${deletedCount} удалённых рецептов` : "Корзина пуста"}</small></span><ChevronRight /></button>
        <button className="settings-row" type="button" onClick={onShowIntro}><span className="settings-row__icon"><BookHeart /></span><span><strong>О книге</strong><small>Снова открыть посвящение</small></span><ChevronRight /></button>
        <section className="settings-card install-card"><div className="settings-card__icon"><Smartphone /></div><div><h2>Установить на телефон</h2><p>После установки книга появится на главном экране и будет открываться без строки браузера.</p>{onInstall ? <Button onClick={() => void onInstall()}>Установить приложение</Button> : <ol><li>Откройте меню Chrome ⋮</li><li>Выберите «Установить приложение» или «Добавить на главный экран»</li></ol>}</div></section>
        {demoCount > 0 && <AlertDialog><AlertDialogTrigger asChild><button className="settings-row settings-row--danger" type="button"><span className="settings-row__icon"><Trash2 /></span><span><strong>Удалить демонстрационные рецепты</strong><small>{demoCount} примера — ваши рецепты не затронутся</small></span><ChevronRight /></button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Удалить все примеры?</AlertDialogTitle><AlertDialogDescription>Шарлотка, борщ и другие демонстрационные рецепты исчезнут. Собственные рецепты останутся.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Оставить</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => void onPerform({ type: "demo.clear" })}>Удалить примеры</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}
      </div>
      <footer className="settings-footer"><Info /><span>{APP_CONFIG.appName} · версия {APP_CONFIG.version}</span>{cloudProvider === "sites" && <a href="/signout-with-chatgpt?return_to=/" target="_top"><LogOut /> Выйти</a>}</footer>
    </section>
  );
}

type ListItem = Pick<Category, "id" | "name"> | Pick<Author, "id" | "name">;
function ManageList({ title, description, icon, items, kind, bookId, onPerform }: { title: string; description: string; icon: React.ReactNode; items: ListItem[]; kind: "category" | "author"; bookId: string; onPerform: (operation: BookOperationInput) => Promise<void> }) {
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);
  const add = async () => {
    if (!name.trim()) return;
    if (kind === "category") {
      const category: Category = { id: createId("category"), bookId, name: name.trim(), icon: "bookmark", order: items.length, createdAt: nowIso() };
      await onPerform({ type: "category.upsert", category });
    } else {
      const author: Author = { id: createId("author"), bookId, name: name.trim(), avatarUrl: null, order: items.length, createdAt: nowIso() };
      await onPerform({ type: "author.upsert", author });
    }
    setName(""); setOpen(false); toast.success(kind === "category" ? "Категория добавлена" : "Автор добавлен");
  };
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><button className="settings-row" type="button"><span className="settings-row__icon">{icon}</span><span><strong>{title}</strong><small>{description}</small></span><ChevronRight /></button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{kind === "category" ? "Категории помогают быстро находить нужные блюда." : "Укажите, чей это рецепт, чтобы сохранить семейную историю."}</DialogDescription></DialogHeader><div className="managed-list">{items.map((item) => <div key={item.id}><span>{kind === "author" ? <UserRound /> : <FolderHeart />}{item.name}</span><AlertDialog><AlertDialogTrigger asChild><button type="button" aria-label={`Удалить ${item.name}`}><Trash2 /></button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Удалить «{item.name}»?</AlertDialogTitle><AlertDialogDescription>Рецепты останутся, но это поле у них станет пустым.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Отмена</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => void onPerform(kind === "category" ? { type: "category.delete", categoryId: item.id } : { type: "author.delete", authorId: item.id })}>Удалить</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div>)}</div><div className="managed-list__add"><Input value={name} onChange={(event) => setName(event.target.value)} placeholder={kind === "category" ? "Новая категория" : "Имя автора"} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void add(); } }} /><Button onClick={() => void add()} disabled={!name.trim()}><Plus /> Добавить</Button></div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Готово</Button></DialogFooter></DialogContent></Dialog>;
}
