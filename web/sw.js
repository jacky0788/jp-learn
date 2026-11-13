// 離線快取 Service Worker：網路優先、失敗時用快取（線上更新、離線可看）
const CACHE = "jp-learn-de22645f";
const CORE = [
  "./", "./index.html", "./style.css", "./app.js", "./data.js",
  "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 頁面請求的是 data.js?v=<hash>，預先快取的是 ./data.js → 比對時忽略 ?v=，離線才找得到
const fromCache = req => caches.match(req, { ignoreSearch: true });

// 網路優先：有網路就拿最新並更新快取；斷線、或訊號差到 4 秒還沒回應且有快取時，改用快取
function networkFirst(req) {
  return new Promise(resolve => {
    let settled = false;
    const finish = r => { if (!settled) { settled = true; resolve(r); } };
    const fallback = () => fromCache(req).then(r =>
      r || (req.mode === "navigate" ? caches.match("./index.html") : Response.error()));
    const timer = setTimeout(() => { fromCache(req).then(r => { if (r) finish(r); }); }, 4000);
    fetch(req)
      .then(res => {
        clearTimeout(timer);
        if (res && res.ok) {                       // 404／500 不要寫進快取
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        finish(res);
      })
      .catch(() => { clearTimeout(timer); fallback().then(finish); });
  });
}

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(networkFirst(e.request));
});
