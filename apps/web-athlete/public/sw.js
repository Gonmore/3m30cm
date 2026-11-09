const CACHE_NAME = "3m30cm-athlete-v2";
const ASSETS = ["/", "/index.html", "/manifest.webmanifest", "/pwa-192.png", "/pwa-512.png"];
const REMINDER_DB = "3m30cm-athlete-reminders";
const REMINDER_STORE = "state";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(REMINDER_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(REMINDER_STORE)) {
        db.createObjectStore(REMINDER_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbGet(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(REMINDER_STORE, "readonly");
    const req = tx.objectStore(REMINDER_STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbSet(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(REMINDER_STORE, "readwrite");
    tx.objectStore(REMINDER_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function localDateString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function checkAndNotify({ force = false, test = false } = {}) {
  if (!self.registration || typeof self.registration.showNotification !== "function") return;
  const config = (await dbGet("config")) || {};
  if (!config.enabled && !test) return;

  const sessions = Array.isArray(config.sessions) ? config.sessions : [];
  const today = localDateString();
  const todays = sessions.filter((s) => (s && (s.scheduledDate || "")).slice(0, 10) === today && s.status !== "COMPLETED" && s.status !== "SKIPPED");
  if (!todays.length && !test) return;

  const lastShown = await dbGet("lastShown");
  if (!force && !test && lastShown === today) return;

  const title = todays.length > 1 ? `Tienes ${todays.length} sesiones hoy` : "Sesión programada para hoy";
  const first = todays[0];
  const body = test
    ? "Las notificaciones de 3m30cm están activas."
    : todays.length > 1
      ? todays.map((s) => s.title).filter(Boolean).join(", ")
      : (first && first.title) || "Abre 3m30cm para ver tu sesión.";

  await self.registration.showNotification(title, {
    body,
    icon: "/pwa-192.png",
    badge: "/pwa-192.png",
    tag: `3m30cm-session-${today}`,
    renotify: true,
    data: { url: first && first.id ? `/programa/sessions/${first.id}` : "/" },
  });
  if (!test) await dbSet("lastShown", today);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(event.request).catch(() => new Response("", { status: 503 })));
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).catch(() => caches.match("/index.html"));
    })
  );
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "SET_SESSION_REMINDERS") {
    event.waitUntil(dbSet("config", data.payload || {}));
  } else if (data.type === "CHECK_SESSION_REMINDERS") {
    event.waitUntil(checkAndNotify({ force: !!data.force, test: !!data.test }));
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const win of wins) {
        if (win.url.includes(self.registration.scope) && "focus" in win) {
          win.navigate(target);
          return win.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(target);
    })
  );
});

self.addEventListener("periodicsync", (event) => {
  if (event.tag === "session-reminders") {
    event.waitUntil(checkAndNotify());
  }
});

self.addEventListener("sync", (event) => {
  if (event.tag === "session-reminders") {
    event.waitUntil(checkAndNotify());
  }
});
