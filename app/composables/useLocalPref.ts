/**
 * A per-viewer preference kept in this browser: a remembered switch, a collapsed
 * group. Never state anyone else needs to see, and never anything that must
 * survive: storage can be missing, full or blocked (private windows, cleared
 * site data), so every read and write is wrapped and a failure falls back to the
 * default rather than breaking the page.
 */
export function useLocalPref<T>(key: string, fallback: T) {
  const storageKey = `completo:${key}`

  function read(): T {
    try {
      const raw = localStorage.getItem(storageKey)
      return raw === null ? fallback : JSON.parse(raw) as T
    } catch {
      return fallback
    }
  }

  const value = ref(read()) as Ref<T>

  watch(value, (next) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(next))
    } catch {
      // Not remembered this time; the page works the same.
    }
  }, { deep: true })

  return value
}
