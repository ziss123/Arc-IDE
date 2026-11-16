export function readNumberPreference(key: string, fallback: number, min: number, max: number): number {
  try {
    const stored = localStorage.getItem(key);
    if (stored === null) return fallback;
    const value = Number(stored);
    return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
  } catch {
    return fallback;
  }
}

export function readBooleanPreference(key: string, fallback: boolean): boolean {
  try {
    const stored = localStorage.getItem(key);
    return stored === null ? fallback : stored === "true";
  } catch {
    return fallback;
  }
}

export function writePreference(key: string, value: string | number | boolean): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Preferences are optional and can be recreated if storage is unavailable.
  }
}
