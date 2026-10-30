/* sw.js — 홈 화면 '앱 설치' 조건을 확실히 채우려고 두는 서비스 워커(10-30, statistics/shared/kiosk.js 가 등록한다).
 * 캐시는 하지 않는다 — 페이지 이동만 그대로 네트워크로 넘긴다. 설문의 오프라인 대기열(ui/record-sync.js)과 상관없다.
 * 지울 때는 이 파일을 지우지 말고 비워 둔 채 한 번 배포해 기존 설치가 갱신되게 한 뒤에 지운다. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  if (e.request.mode === "navigate") e.respondWith(fetch(e.request));
});
