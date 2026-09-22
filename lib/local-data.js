const MAX_AGE = 24 * 60 * 60 * 1000;
export const HISTORY_LIMIT = 10;
export function createLocalData(indexedDB = globalThis.indexedDB) {
  let database;
  function open() {
    if (!indexedDB) return Promise.reject(new Error("Lokale opslag is niet beschikbaar."));
    database ??= new Promise((resolve, reject) => {
      const request = indexedDB.open("carbo-local-v3", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("private-data");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("Sluit andere geopende versies van de app."));
    });
    return database;
  }
  async function operation(mode, action) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("private-data", mode);
      const request = action(transaction.objectStore("private-data"));
      transaction.oncomplete = () => resolve(request?.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error("Opslag onderbroken."));
    });
  }
  return {
    get: key => operation("readonly", store => store.get(key)),
    put: (key, value) => operation("readwrite", store => store.put(value, key)),
    delete: key => operation("readwrite", store => store.delete(key)),
    clear: () => operation("readwrite", store => store.clear()),
  };
}
export function validDraft(value, now = Date.now()) {
  return Boolean(value && value.version === 1 && Number.isFinite(value.savedAt) && now - value.savedAt >= 0 && now - value.savedAt < MAX_AGE && typeof value.description === "string" && value.description.length <= 800 && (value.image === null || (typeof value.image === "string" && value.image.length <= 3_700_000 && value.image.startsWith("data:image/jpeg;base64,"))));
}
export function addHistory(history, entry) { return [entry, ...history.filter(item => item.id !== entry.id)].slice(0, HISTORY_LIMIT); }
