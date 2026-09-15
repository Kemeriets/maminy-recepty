export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${Math.round(bytes)} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toLocaleString("ru", { maximumFractionDigits: 1 })} КБ`;
  return `${(bytes / (1024 * 1024)).toLocaleString("ru", { maximumFractionDigits: 1 })} МБ`;
}

export async function estimateBrowserStorage(): Promise<number | null> {
  if (!navigator.storage?.estimate) return null;
  const value = await navigator.storage.estimate();
  return value.usage ?? null;
}
