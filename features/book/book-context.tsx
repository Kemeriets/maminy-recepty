"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { applyOperation } from "./logic";
import { createDemoSnapshot } from "./demo-data";
import { HybridRecipeRepository } from "../../repositories/recipe-repository";
import { createId, nowIso } from "../../lib/ids";
import { listQueuedOperations } from "../../services/local-store";
import type { RuntimeProvider } from "../../services/runtime-config";
import type { BookOperation, BookOperationInput, BookSnapshot } from "../../types/book";

export type SyncState = "loading" | "local" | "synced" | "offline" | "syncing" | "error";

interface BookContextValue {
  snapshot: BookSnapshot;
  loading: boolean;
  syncState: SyncState;
  pendingCount: number;
  cloudProvider: RuntimeProvider;
  cloudReady: boolean;
  cloudConnected: boolean;
  perform: (operation: BookOperationInput) => Promise<void>;
  performMany: (operations: BookOperationInput[]) => Promise<void>;
  refresh: () => Promise<boolean>;
  connectCloud: () => void;
  disconnectCloud: () => Promise<void>;
}

const BookContext = createContext<BookContextValue | null>(null);

export function BookProvider({ children }: { children: React.ReactNode }) {
  const repository = useMemo(() => new HybridRecipeRepository(), []);
  const [snapshot, setSnapshot] = useState<BookSnapshot>(() => createDemoSnapshot());
  const snapshotRef = useRef(snapshot);
  const [loading, setLoading] = useState(true);
  const [syncState, setSyncState] = useState<SyncState>("loading");
  const [pendingCount, setPendingCount] = useState(0);
  const cloudProvider = repository.provider();
  const cloudReady = repository.cloudReady();
  const [cloudConnected, setCloudConnected] = useState(cloudProvider === "sites");

  const updateSnapshot = useCallback((next: BookSnapshot) => {
    snapshotRef.current = next;
    setSnapshot(next);
  }, []);

  const refresh = useCallback(async () => {
    const connected = await repository.cloudConnected();
    setCloudConnected(connected);
    if (repository.provider() === "local" || (repository.provider() === "yandex-disk" && !connected)) {
      setPendingCount((await listQueuedOperations().catch(() => [])).length);
      setSyncState("local");
      return false;
    }
    if (!navigator.onLine) {
      setSyncState("offline");
      return false;
    }
    setSyncState("syncing");
    try {
      const next = await repository.flush(snapshotRef.current);
      updateSnapshot(next);
      const queued = await listQueuedOperations().catch(() => []);
      setPendingCount(queued.length);
      setSyncState(queued.length ? "error" : "synced");
      return queued.length === 0;
    } catch {
      setPendingCount((await listQueuedOperations().catch(() => [])).length);
      setSyncState("error");
      return false;
    }
  }, [repository, updateSnapshot]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const loggedIn = await repository.consumeLogin();
        const connected = await repository.cloudConnected();
        const { snapshot: loaded, remote } = await repository.load();
        if (!active) return;
        updateSnapshot(loaded);
        setCloudConnected(connected);
        setPendingCount((await listQueuedOperations().catch(() => [])).length);
        setLoading(false);
        if (!navigator.onLine) setSyncState("offline");
        else if (repository.provider() === "local" || (repository.provider() === "yandex-disk" && !connected)) setSyncState("local");
        else setSyncState(remote ? "synced" : "syncing");
        if (loggedIn) toast.success("Яндекс Диск подключён", { description: "Синхронизируем рецепты." });
        if (navigator.onLine && (repository.provider() === "sites" || connected)) await refresh();
      } catch (value) {
        if (!active) return;
        setLoading(false);
        setSyncState("error");
        toast.error("Не удалось выполнить синхронизацию", { description: value instanceof Error ? value.message : "Рецепты доступны на этом устройстве. Проверьте интернет и подключение Яндекс Диска." });
      }
    })();
    const online = () => void refresh();
    const offline = () => setSyncState("offline");
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      active = false;
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, [refresh, repository, updateSnapshot]);

  const connectCloud = useCallback(() => {
    try { repository.connectCloud(); }
    catch (value) { toast.error(value instanceof Error ? value.message : "Не удалось начать подключение"); }
  }, [repository]);

  const disconnectCloud = useCallback(async () => {
    await repository.disconnectCloud();
    setCloudConnected(false);
    setPendingCount((await listQueuedOperations().catch(() => [])).length);
    setSyncState("local");
  }, [repository]);

  const perform = useCallback(async (raw: BookOperationInput) => {
    const operation = { ...raw, opId: createId("op"), createdAt: nowIso() } as BookOperation;
    const previous = snapshotRef.current;
    const next = applyOperation(previous, operation);
    updateSnapshot(next);
    let saved: boolean;
    try { saved = await repository.persist(next, operation); }
    catch (error) { if (snapshotRef.current === next) updateSnapshot(previous); throw error; }
    if (!saved) {
      const connected = await repository.cloudConnected();
      setCloudConnected(connected);
      setPendingCount((await listQueuedOperations().catch(() => [])).length);
      setSyncState(!connected ? "local" : navigator.onLine ? "error" : "offline");
      if (connected) toast("Изменение сохранено на устройстве", { description: "Отправим на Яндекс Диск, когда восстановится соединение." });
    } else {
      const hasPendingImages = next.recipes.some((recipe) => recipe.coverImage?.url.startsWith("data:") || recipe.originalPageImages.some((image) => image.url.startsWith("data:")) || recipe.steps.some((step) => step.image?.url.startsWith("data:")));
      if (hasPendingImages) {
        setSyncState("syncing");
        void refresh();
      } else setSyncState("synced");
    }
  }, [refresh, repository, updateSnapshot]);

  const performMany = useCallback(async (rawOperations: BookOperationInput[]) => {
    const operations = rawOperations.map((raw) => ({ ...raw, opId: createId("op"), createdAt: nowIso() }) as BookOperation);
    const previous = snapshotRef.current;
    let next = previous;
    for (const operation of operations) next = applyOperation(next, operation);
    updateSnapshot(next);
    let saved: boolean;
    try { saved = await repository.persistMany(next, operations); }
    catch (error) { if (snapshotRef.current === next) updateSnapshot(previous); throw error; }
    if (!saved) {
      const connected = await repository.cloudConnected();
      setCloudConnected(connected);
      setPendingCount((await listQueuedOperations().catch(() => [])).length);
      setSyncState(!connected ? "local" : navigator.onLine ? "error" : "offline");
    } else {
      const hasPendingImages = next.recipes.some((recipe) => recipe.coverImage?.url.startsWith("data:") || recipe.originalPageImages.some((image) => image.url.startsWith("data:")));
      if (hasPendingImages) {
        setSyncState("syncing");
        void refresh();
      } else setSyncState("synced");
    }
  }, [refresh, repository, updateSnapshot]);

  const value = useMemo(() => ({ snapshot, loading, syncState, pendingCount, cloudProvider, cloudReady, cloudConnected, perform, performMany, refresh, connectCloud, disconnectCloud }), [snapshot, loading, syncState, pendingCount, cloudProvider, cloudReady, cloudConnected, perform, performMany, refresh, connectCloud, disconnectCloud]);
  return <BookContext.Provider value={value}>{children}</BookContext.Provider>;
}

export function useBook(): BookContextValue {
  const value = useContext(BookContext);
  if (!value) throw new Error("useBook должен использоваться внутри BookProvider");
  return value;
}
