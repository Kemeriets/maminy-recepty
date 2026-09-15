import { YandexDiskError } from "./yandex-disk-service";

export interface SyncIssue {
  kind: "auth" | "permission" | "quota" | "rate-limit" | "service" | "network" | "timeout" | "data" | "local" | "unknown";
  message: string;
  help: string;
  diagnostic?: string;
}

// Never display request URLs, OAuth credentials, or arbitrary server messages.
export function describeSyncError(value: unknown): SyncIssue {
  let error = value;
  for (let depth = 0; depth < 5 && error instanceof Error && error.cause; depth++) error = error.cause;
  if (error instanceof YandexDiskError) {
    const code = error.code && /^[A-Za-z][A-Za-z0-9_]{0,79}Error$/.test(error.code) ? error.code : undefined;
    const diagnostic = `HTTP ${error.status}${code ? ` · ${code}` : ""}`;
    if (error.status === 401) return { kind: "auth", message: "Нужно повторно войти через Яндекс.", help: "Срок входа закончился или доступ был отозван. Войдите в тот же аккаунт. Локальные рецепты и очередь отправки сохранены.", diagnostic };
    if (error.status === 403) return { kind: "permission", message: "Яндекс не разрешил доступ к папке книги.", help: "В настройках созданного приложения Яндекса проверьте право cloud_api:disk.app_folder, затем войдите заново. Доступ ко всему Диску не нужен.", diagnostic };
    if (error.status === 507 || error.code === "DiskResourceQuotaExceededError") return { kind: "quota", message: "На Яндекс Диске не хватает места.", help: "Освободите место на Диске и повторите синхронизацию. Рецепты и неотправленные фотографии остаются на устройстве.", diagnostic };
    if (error.status === 429) return { kind: "rate-limit", message: "Яндекс просит немного подождать.", help: "Слишком много запросов. Подождите несколько минут и повторите синхронизацию.", diagnostic };
    if (error.status >= 500) return { kind: "service", message: "Яндекс Диск временно недоступен.", help: "Повторите синхронизацию позже. Изменения остались на устройстве.", diagnostic };
    if (error.status === 404) return { kind: "data", message: "Не найдена папка или запись книги на Диске.", help: "Повторите синхронизацию. Если ошибка остаётся, отправьте разработчику код ошибки ниже, без паролей и токенов.", diagnostic };
    return { kind: "data", message: "Яндекс Диск не принял запрос книги.", help: "Изменения остались на устройстве. Отправьте разработчику код ошибки ниже, без паролей и токенов.", diagnostic };
  }
  if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) return { kind: "timeout", message: "Яндекс Диск не ответил вовремя.", help: "Проверьте соединение и повторите попытку. Рецепты и очередь отправки сохранены." };
  if (error instanceof Error && error.name === "QuotaExceededError") return { kind: "local", message: "На устройстве не хватает места для сохранения.", help: "Скачайте резервную копию и освободите место на телефоне. Не очищайте данные сайта: в них могут быть неотправленные изменения." };
  if (error instanceof TypeError) return { kind: "network", message: "Не удалось связаться с Яндекс Диском.", help: "Проверьте интернет. Если другие сайты открываются, доступ к API Диска может ограничиваться сетью или браузером. Изменения остались на устройстве." };
  if (error instanceof SyntaxError || (error instanceof Error && error.message === "Повреждена запись синхронизации")) return { kind: "data", message: "Не удалось прочитать одну из записей книги.", help: "Локальная книга сохранена. Скачайте резервную копию и сообщите разработчику об ошибке." };
  return { kind: "unknown", message: "Не удалось выполнить синхронизацию.", help: "Изменения остались на устройстве. Повторите попытку; если ошибка остаётся, сообщите разработчику." };
}
