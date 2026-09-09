/* 日语学习站 · Service Worker：离线缓存 */
const CACHE = "jp-study-v1";
const ACACHE = "jp-audio-v1";
const ASSETS = ["./", "./index.html", "./manifest.webmanifest", "./icon.svg"];
const AUDIO_HOST = "languagepod101.com";

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }).catch(function () {}));
  self.skipWaiting();
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.map(function (k) { return (k === CACHE || k === ACACHE) ? null : caches.delete(k); }));
  }));
  self.clients.claim();
});
self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  const url = e.request.url;

  // 真人发音音频：缓存优先（跨域无 CORS 头，只能靠 SW 缓存；命中后秒播、可离线）
  if (url.indexOf(AUDIO_HOST) > 0) {
    e.respondWith(
      caches.open(ACACHE).then(function (c) {
        return c.match(e.request).then(function (hit) {
          if (hit) return hit;
          return fetch(e.request).then(function (r) {
            // opaque（no-cors）响应 status 为 0，同样可缓存
            if (r && (r.ok || r.type === "opaque")) {
              c.put(e.request, r.clone()).catch(function () {});
            }
            return r;
          }).catch(function () { return hit || Response.error(); });
        });
      })
    );
    return;
  }

  // 页面资源：网络优先，失败回落缓存
  e.respondWith(
    fetch(e.request).then(function (r) {
      const copy = r.clone();
      caches.open(CACHE).then(function (c) { c.put(e.request, copy); }).catch(function () {});
      return r;
    }).catch(function () { return caches.match(e.request).then(function (m) { return m || caches.match("./index.html"); }); })
  );
});

// 页面可请求批量预热音频（跨域 no-cors 由页面端 add 完成，这里仅保留清理接口）
self.addEventListener("message", function (e) {
  if (e.data === "clear-audio") {
    e.waitUntil(caches.open(ACACHE).then(function (c) {
      return c.keys().then(function (ks) { return Promise.all(ks.map(function (k) { return c.delete(k); })); });
    }));
  }
});
