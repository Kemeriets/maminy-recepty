"use client";

import { useEffect, useState } from "react";
import { Archive, BookOpen, ChevronRight, Cloud, CloudOff, Download, FolderOpen, HardDrive, Info, Loader2, LogOut, PackageOpen, Plus, RefreshCw, RotateCcw, Smartphone, Trash2 } from "lucide-react";
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
import { runtimeAssetUrl, saveYandexClientId } from "../services/runtime-config";
import { clearCachedImages } from "../services/local-store";
import { estimateBrowserStorage, formatBytes } from "../services/storage-service";

interface SettingsPageProps {
  snapshot: BookSnapshot;
  onNavigateImport: () => void;
  onNavigateTrash: () => void;
  onPerform: (operation: BookOperationInput) => Promise<void>;
  onInstall?: () => Promise<void>;
}

export function SettingsPage({ snapshot, onNavigateImport, onNavigateTrash, onPerform, onInstall }: SettingsPageProps) {
  const { cloudProvider, cloudReady, cloudConnected, pendingCount, syncState, syncIssue, connectCloud, disconnectCloud, refresh } = useBook();
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
      else toast.error("Синхронизация не завершена", { description: "Причина показана в настройках ниже. Изменения остались на устройстве." });
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
              <small>Для первого подключения владелец сайта один раз создаёт приложение в Яндексе. Это не требует собственного сервера.</small>
              <YandexSetup onConnect={connectCloud} />
            </> : cloudConnected ? <>
              <p>{syncState === "synced" ? "Рецепты синхронизированы с приватной папкой приложения на Яндекс Диске." : "Вход через Яндекс выполнен. Неотправленные изменения остаются на устройстве до успешной синхронизации."} На другом устройстве откройте этот сайт и войдите в тот же аккаунт Яндекса.</p>
              <div className="settings-actions"><Button onClick={() => void syncCloud()} disabled={cloudBusy}>{cloudBusy ? <Loader2 className="animate-spin" /> : <RefreshCw />} Синхронизировать</Button>
                <AlertDialog><AlertDialogTrigger asChild><Button variant="outline" disabled={cloudBusy}>Отключить</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Отключить синхронизацию?</AlertDialogTitle><AlertDialogDescription>Рецепты на устройстве и Яндекс Диске останутся. Новые изменения не будут передаваться между устройствами до повторного подключения.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Отмена</AlertDialogCancel><AlertDialogAction onClick={() => void disconnect()}>Отключить</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
              </div><small role="status">{syncState === "error" ? `Синхронизация не завершена. Изменений в очереди: ${pendingCount}` : syncState === "offline" ? "Нет интернета. Отправка продолжится после подключения." : pendingCount ? `Изменений в очереди: ${pendingCount}` : "Нет изменений в очереди отправки"}</small>
            </> : <>
              <p>Рецепты пока только на этом устройстве. Подключите Яндекс Диск для синхронизации телефона и компьютера. На всех устройствах используйте один и тот же аккаунт: локальные изменения будут добавлены к его данным.</p>
              <Button onClick={connectCloud}><Cloud /> Подключить Яндекс Диск</Button>
              <small>Приложение запрашивает доступ только к своей папке. Пароль вы вводите на странице Яндекса, не на этом сайте.</small>
            </> : <p>{cloudConnected ? "Рецепты синхронизируются с подключённым хранилищем." : "Рецепты и фотографии хранятся только в этом браузере. Для переноса на другое устройство скачайте полную копию."}</p>}
            {syncState === "error" && syncIssue && <div className="settings-sync-error" role="alert"><strong>{syncIssue.message}</strong><p>{syncIssue.help}</p>{syncIssue.diagnostic && <small>Код ошибки: <code>{syncIssue.diagnostic}</code></small>}{cloudProvider === "yandex-disk" && (syncIssue.kind === "auth" || syncIssue.kind === "permission") && <Button variant="outline" onClick={connectCloud} disabled={cloudBusy}><RefreshCw /> Войти через Яндекс заново</Button>}</div>}
          </div>
        </section>
        <StorageInfo cloudConnected={cloudConnected} />
        <section className="settings-card settings-card--important"><div className="settings-card__icon"><Archive /></div><div><h2>Резервная копия</h2><p>Скачивайте копию после важных изменений. Она позволит восстановить рецепты независимо от сайта и синхронизации.</p><div className="settings-actions"><Button onClick={textBackup} variant="outline"><Download /> Только рецепты · JSON</Button><Button onClick={() => void fullBackup()} disabled={zipLoading}>{zipLoading ? <Loader2 className="animate-spin" /> : <PackageOpen />} Рецепты и фото · ZIP</Button></div><small>Для полного переноса выбирайте ZIP. JSON содержит тексты и ссылки на фотографии, но не сами файлы. Очистка данных сайта или приватный режим могут удалить локальные рецепты.</small></div></section>
        <button className="settings-row" type="button" onClick={onNavigateImport}><span className="settings-row__icon"><RotateCcw /></span><span><strong>Импорт и восстановление</strong><small>Загрузить много рецептов или резервную копию</small></span><ChevronRight /></button>
        <ManageCategories items={snapshot.categories} bookId={snapshot.book.id} onPerform={onPerform} />
        <button className="settings-row" type="button" onClick={onNavigateTrash}><span className="settings-row__icon"><Trash2 /></span><span><strong>Корзина</strong><small>{deletedCount ? `Удалённых рецептов: ${deletedCount}` : "Корзина пуста"}</small></span><ChevronRight /></button>
        <Dialog><DialogTrigger asChild><button className="settings-row" type="button"><span className="settings-row__icon"><BookOpen /></span><span><strong>Как пользоваться</strong><small>Добавление, готовка, перенос и хранение</small></span><ChevronRight /></button></DialogTrigger><DialogContent className="help-dialog"><DialogHeader><DialogTitle>Как пользоваться</DialogTitle><DialogDescription>Главные возможности приложения.</DialogDescription></DialogHeader><div className="help-content">
          <section><h3>Добавить и найти рецепт</h3><p>Нажмите «Добавить рецепт». Заполните название, ингредиенты и шаги, при желании прикрепите фотографии. После сохранения рецепт появится в каталоге. Поиск работает по названию, составу, описанию и тегам.</p></section>
          <section><h3>Готовить и выбрать блюдо</h3><p>Сердечко добавляет рецепт в «Любимые». В «Режиме готовки» можно отмечать шаги и менять порции, не изменяя исходный рецепт. Если не знаете, что приготовить, откройте «Случайное», выберите категорию и нажмите «Выбрать блюдо». В «Покупках» можно убрать купленное или очистить весь список.</p></section>
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

function YandexSetup({ onConnect }: { onConnect: () => void }) {
  const [clientId, setClientId] = useState("");
  const [error, setError] = useState("");
  const connect = () => {
    try { saveYandexClientId(clientId); onConnect(); }
    catch (value) { setError(value instanceof Error ? value.message : "Не удалось сохранить настройку"); }
  };
  return <Dialog><DialogTrigger asChild><Button><Cloud /> Настроить синхронизацию</Button></DialogTrigger><DialogContent className="sync-setup"><DialogHeader><DialogTitle>Первое подключение</DialogTitle><DialogDescription>Одноразовая настройка владельцем сайта. После неё на устройствах достаточно войти в тот же Яндекс-аккаунт.</DialogDescription></DialogHeader><ol>
    <li>Откройте <a href="https://oauth.yandex.ru/client/new/id/" target="_blank" rel="noopener noreferrer">создание приложения Яндекс</a>. Выберите приложение <strong>для авторизации пользователей</strong>, не «для доступа к API или отладки».</li>
    <li>Название: «Рецепты». Укажите контактную почту. Для иконки можно <a href={runtimeAssetUrl("icons/icon-192.png")} target="_blank" rel="noopener noreferrer">сохранить эту картинку</a>.</li>
    <li>Платформа: «Веб-сервисы». В Redirect URI вставьте: <code>{runtimeAssetUrl("")}</code></li>
    <li>Выберите только <strong>доступ к папке приложения на Яндекс Диске</strong>: <code>cloud_api:disk.app_folder</code>. Доступ ко всему Диску, почте или профилю не нужен.</li>
    <li>Создайте приложение, скопируйте <strong>ClientID</strong> и вставьте ниже. Если Яндекс предупредит, что приложение не проверено, сверьте его название и единственное разрешение, прежде чем продолжать.</li>
  </ol><label className="field"><span>ClientID</span><Input value={clientId} onChange={(event) => { setClientId(event.target.value); setError(""); }} placeholder="32 символа со страницы приложения" autoComplete="off" spellCheck={false} aria-invalid={Boolean(error)} /><small role="alert">{error}</small></label><p>ClientID — публичный идентификатор. <strong>Не вставляйте пароль, Client Secret или токен.</strong> Чтобы настройка появилась у мамы без этого экрана, передайте разработчику только ClientID для конфигурации сайта.</p><Button onClick={connect} disabled={!clientId.trim()}><Cloud /> Сохранить и войти через Яндекс</Button></DialogContent></Dialog>;
}

function StorageInfo({ cloudConnected }: { cloudConnected: boolean }) {
  const [usage, setUsage] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => { void estimateBrowserStorage().then(setUsage).catch(() => undefined); }, []);
  const clear = async () => {
    setBusy(true);
    try { await clearCachedImages(); setUsage(await estimateBrowserStorage()); setOpen(false); toast.success("Кэш фото очищен", { description: "Рецепты и неотправленные фотографии не удалены." }); }
    catch { toast.error("Не удалось очистить кэш"); }
    finally { setBusy(false); }
  };
  return <section className="settings-card settings-card--important"><div className="settings-card__icon"><HardDrive /></div><div><h2>Место на устройстве</h2><p>Синхронизация не скачивает весь Диск. Тексты доступны без интернета, фотографии загружаются по мере просмотра.</p><dl className="storage-stats"><div><dt>Занято в браузере{usage === null ? "" : " · оценка"}</dt><dd>{usage === null ? "Браузер не сообщил размер" : formatBytes(usage)}</dd></div><div><dt>Лимит кэша облачных фото</dt><dd>24 МБ</dd></div></dl><small>Оценка браузера может включать другие сайты на том же домене; служебный размер установленного приложения Android считает отдельно. До отправки в облако новые фотографии целиком остаются на устройстве и не входят в лимит кэша. Резервный ZIP в «Загрузках» тоже занимает место отдельно.</small>{cloudConnected && <AlertDialog open={open} onOpenChange={setOpen}><AlertDialogTrigger asChild><Button variant="outline"><Trash2 /> Очистить кэш фото</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Очистить загруженные фото?</AlertDialogTitle><AlertDialogDescription>Рецепты, черновики и фотографии, ожидающие отправки, останутся. Просмотренные облачные фото загрузятся снова при открытии; без интернета они временно будут недоступны.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>Отмена</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={(event) => { event.preventDefault(); void clear(); }}>{busy ? "Очищаем…" : "Очистить кэш"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}</div></section>;
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
