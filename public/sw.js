// Network-first: with a connection you always get the newest version; without one, the last cached copy.
// Event data lives in IndexedDB, not here, so updating the app never touches the data.
const CACHE = 'rampflow-shell-v3';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];
const OPTIONAL = ['./vendor/pdf.min.mjs', './vendor/pdf.worker.min.mjs']; // PDF reader: cached too, but a failure here must not block the update

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL).then(() => Promise.all(OPTIONAL.map((u) => c.add(u).catch(() => {})))))
      .then(() => self.skipWaiting())
  );
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});
// "Share" from the phone (a LIR PDF from WhatsApp / Files / mail): the browser POSTs the file here. We keep it for the page
// (Cache API, one slot) and redirect to the app, which reads it and opens the LIR import.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method === 'POST' && url.origin === self.location.origin && url.pathname.endsWith('/share-target')) {
    e.respondWith((async () => {
      try {
        const form = await req.formData();
        const file = form.get('lir');
        if (file && typeof file !== 'string') {
          const c = await caches.open('rampflow-share');
          await c.put('shared-file', new Response(file, { headers: { 'Content-Type': file.type || 'application/pdf', 'X-File-Name': encodeURIComponent(file.name || 'lir.pdf') } }));
        }
      } catch (err) { /* the app shows a message if nothing arrives */ }
      return Response.redirect(new URL('./index.html?shared=1', self.registration.scope).href, 303);
    })());
    return;
  }
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
  );
});
