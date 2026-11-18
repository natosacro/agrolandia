// Agrolandia: service worker minimo. Serve solo a rendere l'app installabile come app vera e propria;
// non salva niente sul telefono: le pagine arrivano sempre dal sito, così gli aggiornamenti si vedono subito.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", e => {
  if (e.request.mode === "navigate") e.respondWith(fetch(e.request));
});
