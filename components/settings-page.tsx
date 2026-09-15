"use client";

import { useState } from "react";
import { Archive, BookOpen, ChevronRight, Cloud, CloudOff, Download, FolderOpen, Info, Loader2, LogOut, PackageOpen, Plus, RefreshCw, RotateCcw, Smartphone, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "./ui/alert-dialog";
import { APP_CONFIG } from "../config/app.config";
import { downloadJsonBackup, downloadZipBackup } from "../services/backup-service";
import { createId, nowIso } from "../lib/ids";
import { useBook } from "../features/book/book-context";
import type { BookOperationInput, BookSnapshot, Category } from "../types/book";

interface SettingsPageProps {
  snapshot: BookSnapshot;
  onNavigateImport: () => void;
  onNavigateTrash: () => void;
  onPerform: (operation: BookOperationInput) => Promise<void>;
  onInstall?: () => Promise<void>;
}

export function SettingsPage({ snapshot, onNavigateImport, onNavigateTrash, onPerform, onInstall }: SettingsPageProps) {
  const { cloudProvider, cloudReady, cloudConnected, pendingCount, syncState, connectCloud, disconnectCloud, refresh } = useBook();
  const [zipLoading, setZipLoading] = useState(false);
  const [cloudBusy, setCloudBusy] = useState(false);
  const deletedCount = snapshot.recipes.filter((recipe) => recipe.deletedAt).length;
  const demoCount = snapshot.recipes.filter((recipe) => recipe.isDemo).length;
  const fullBackup = async () => {
    setZipLoading(true);
    try { await downloadZipBackup(snapshot); toast.success("Резервная копия скачана"); }
    catch { toast.error("Не удалось собрать полную копию", { description: "Попробуйте ещё раз или скачайте её с компьютера." }); }
    finally { setZipLoading(false); }
  };
  const textBackup = () => {
    try { downloadJsonBackup(snapshot); }
    catch { toast.error("Не удалось скачать копию рецептов"); }
  };
  const syncCloud = async () => {
    setCloudBusy(true);
    try {
      if (await refresh()) toast.success("Рецепты синхронизированы");
      else toast.error("Не удалось выполнить синхронизацию", { description: "Изменения остались на устройстве. Проверьте интернет и повторите попытку." });
    } catch { toast.error("Не удалось выполнить синхронизацию"); }
    finally { setCloudBusy(false); }
  };
  const disconnect = async () => {
    setCloudBusy(true);
    try { await disconnectCloud(); toast("Синхронизация отключена", { description: "Рецепты остались на устройстве и на Яндекс Диске." }); }
    catch { toast.error("Не удалось отключить синхронизацию"); }
    finally { setCloudBusy(false); }
  };
  return (
    <section className="page-view settings-page">
      <header className="page-heading"><h1>Настройки</h1></header>
      <div className="settings-grid">
        <section className="settings-card settings-card--important">
          <div className="settings-card__icon">{cloudConnected ? <Cloud /> : <CloudOff />}</div>
          <div><h2>{cloudProvider === "yandex-disk" ? "Синхронизация через Яндекс Диск" : "Хранение рецептов"}</h2>
            {cloudProvider === "yandex-disk" ? !cloudReady ? <>
              <p><strong>Синхронизация не настроена.</strong> Рецепты и фотографии хранятся только в этом браузере на этом устройстве. На другом телефоне они пока не появятся.</p>
              <small>Вход через Яндекс появится после одноразовой настройки владельцем сайта. Пока переносите рецепты с помощью полной резервной копии.</small>
            </> : cloudConnected ? <>
              <p>Подключён Яндекс Диск. Копии рецептов и фотографий хранятся в отдельной приватной папке приложения. На другом устройстве откройте этот сайт и войдите в тот же аккаунт Яндекса.</p>
              <div className="settings-actions"><Button onClick={() => void syncCloud()} disabled={cloudBusy}>{cloudBusy ? <Loader2 className="animate-spin" /> : <RefreshCw />} Синхронизировать</Button>
                <AlertDialog><AlertDialogTrigger asChild><Button variant="outline" disabled={cloudBusy}>Отключить</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Отключить синхронизацию?</AlertDialogTitle><AlertDialogDescription>Рецепты на устройстве и Яндекс Диске останутся. Новые изменения не будут передаваться между устройствами до повторного подключения.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Отмена</AlertDialogCancel><AlertDialogAction onClick={() => void disconnect()}>Отключить</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
              </div><small role="status">{syncState === "error" ? "Есть ошибка соединения. Повторите синхронизацию." : syncState === "offline" ? "Нет интернета. Отправка продолжится после подключения." : pendingCount ? `Изменений в очереди: ${pendingCount}` : "Нет изменений в очереди отправки"}</small>
            </> : <>
              <p>Рецепты пока только на этом устройстве. Подключите Яндекс Диск для синхронизации телефона и компьютера.</p>
              <Button onClick={connectCloud}><Cloud /> Подключить Яндекс Диск</Button>
              <small>Приложение запрашивает доступ только к своей папке. Пароль вы вводите на странице Яндекса, не на этом сайте.</small>
            </> : <p>{cloudConnected ? "Рецепты синхронизируются с подключённым хранилищем." : "Рецепты и фотографии хранятся только в этом браузере. Для переноса на другое устройство скачайте полную копию."}</p>}
          </div>
        </section>
        <section className="settings-card settings-card--important"><div className="settings-card__icon"><Archive /></div><div><h2>Резервная копия</h2><p>Скачивайте копию после важных изменений. Она позволит восстановить рецепты независимо от сайта и синхронизации.</p><div className="settings-actions"><Button onClick={textBackup} variant="outline"><Download /> Только рецепты · JSON</Button><Button onClick={() => void fullBackup()} disabled={zipLoading}>{zipLoading ? <Loader2 className="animate-spin" /> : <PackageOpen />} Рецепты и фото · ZIP</Button></div><small>Для полного переноса выбирайте ZIP. JSON содержит тексты и ссылки на фотографии, но не сами файлы. Очистка данных сайта или приватный режим могут удалить локальные рецепты.</small></div></section>
        <button className="settings-row" type="button" onClick={onNavigateImport}><span className="settings-row__icon"><RotateCcw /></span><span><strong>Импорт и восстановление</strong><small>Загрузить много рецептов или резервную копию</small></span><ChevronRight /></button>
        <ManageCategories items={snapshot.categories} bookId={snapshot.book.id} onPerform={onPerform} />
        <button className="settings-row" type="button" onClick={onNavigateTrash}><span className="settings-row__icon"><Trash2 /></span><span><strong>Корзина</strong><small>{deletedCount ? `Удалённых рецептов: ${deletedCount}` : "Корзина пуста"}</small></span><ChevronRight /></button>
        <Dialog><DialogTrigger asChild><button className="settings-row" type="button"><span className="settings-row__icon"><BookOpen /></span><span><strong>Как пользоваться</strong><small>Добавление, готовка, перенос и хранение</small></span><ChevronRight /></button></DialogTrigger><DialogContent className="help-dialog"><DialogHeader><DialogTitle>Как пользоваться</DialogTitle><DialogDescription>Главные возможности приложения.</DialogDescription></DialogHeader><div className="help-content">
          <section><h3>Добавить и найти рецепт</h3><p>Нажмите «Добавить рецепт». Заполните название, ингредиенты и шаги, при желании прикрепите фотографии. После сохранения рецепт появится в каталоге. Поиск работает по названию, составу, описанию и тегам.</p></section>
          <section><h3>Готовить</h3><p>Сердечко добавляет рецепт в «Любимые». В «Режиме готовки» можно отмечать шаги. Изменение порций пересчитывает количества только на экране — исходный рецепт не меняется. Нужные ингредиенты отправляйте в «Покупки».</p></section>
          <section><h3>Перенести много рецептов</h3><p>В «Импорте и восстановлении» загрузите JSON от нейросети, проверьте предпросмотр и подтвердите добавление. Для фотографий загрузите ZIP или JSON вместе с указанными в нём файлами. Можно также переписывать страницы вручную.</p></section>
          <section><h3>Хранение и резервная копия</h3><p>Без подключения Яндекс Диска рецепты остаются только на этом устройстве. Закрывать приложение можно, очищать данные сайта без копии — нельзя. Скачайте ZIP и сохраните вне браузера. На другом устройстве откройте тот же сайт и загрузите этот ZIP через импорт.</p></section>
          <section><h3>Поделиться и удалить</h3><p>«Поделиться» отправляет полный текст рецепта, не открывая доступ к остальной книге. Удалённые рецепты сначала попадают в корзину, откуда их можно вернуть.</p></section>
        </div></DialogContent></Dialog>
        <section className="settings-card install-card"><div className="settings-card__icon"><Smartphone /></div><div><h2>Установить на телефон</h2><p>Приложение появится на главном экране и будет открываться без строки браузера.</p>{onInstall ? <Button onClick={() => void onInstall()}>Установить приложение</Button> : <ol><li>Откройте меню Chrome ⋮</li><li>Выберите «Установить приложение» или «Добавить на главный экран»</li></ol>}</div></section>
        {demoCount > 0 && <AlertDialog><AlertDialogTrigger asChild><button className="settings-row settings-row--danger" type="button"><span className="settings-row__icon"><Trash2 /></span><span><strong>Удалить демонстрационные рецепты</strong><small>Примеров: {demoCount}. Ваши рецепты останутся.</small></span><ChevronRight /></button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Удалить все примеры?</AlertDialogTitle><AlertDialogDescription>Шарлотка, борщ и другие демонстрационные рецепты исчезнут. Собственные рецепты останутся.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Оставить</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => void onPerform({ type: "demo.clear" }).catch(() => toast.error("Не удалось удалить примеры"))}>Удалить примеры</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}
      </div>
      <footer className="settings-footer"><Info /><span>{APP_CONFIG.appName} · версия {APP_CONFIG.version}</span>{cloudProvider === "sites" && <a href="/signout-with-chatgpt?return_to=/" target="_top"><LogOut /> Выйти</a>}</footer>
    </section>
  );
}

function ManageCategories({ items, bookId, onPerform }: { items: Category[]; bookId: string; onPerform: (operation: BookOperationInput) => Promise<void> }) {
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const add = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    if (items.some((item) => item.name.toLocaleLowerCase("ru") === trimmed.toLocaleLowerCase("ru"))) { toast.error("Такая категория уже есть"); return; }
    setBusy(true);
    try {
      await onPerform({ type: "category.upsert", category: { id: createId("category"), bookId, name: trimmed, icon: "bookmark", order: items.length, createdAt: nowIso() } });
      setName(""); toast.success("Категория добавлена");
    } catch { toast.error("Не удалось добавить категорию"); }
    finally { setBusy(false); }
  };
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><button className="settings-row" type="button"><span className="settings-row__icon"><FolderOpen /></span><span><strong>Категории</strong><small>Разделов: {items.length}</small></span><ChevronRight /></button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Категории</DialogTitle><DialogDescription>Добавляйте свои разделы. Удаление категории не удаляет рецепты.</DialogDescription></DialogHeader><div className="managed-list">{items.map((item) => <div key={item.id}><span><FolderOpen />{item.name}</span><AlertDialog><AlertDialogTrigger asChild><button type="button" aria-label={`Удалить ${item.name}`}><Trash2 /></button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Удалить «{item.name}»?</AlertDialogTitle><AlertDialogDescription>Рецепты останутся в разделе «Без категории».</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Отмена</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => void onPerform({ type: "category.delete", categoryId: item.id }).catch(() => toast.error("Не удалось удалить категорию"))}>Удалить</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div>)}</div><div className="managed-list__add"><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Новая категория" aria-label="Название новой категории" maxLength={80} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void add(); } }} /><Button onClick={() => void add()} disabled={!name.trim() || busy}><Plus /> Добавить</Button></div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Готово</Button></DialogFooter></DialogContent></Dialog>;
}
