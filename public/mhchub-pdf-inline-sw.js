self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

const isUploadPdfRequest = (requestUrl) => {
  const url = new URL(requestUrl);
  return url.origin === self.location.origin && url.pathname.startsWith("/uploads/") && url.pathname.toLowerCase().endsWith(".pdf");
};

const inlineFileName = (pathname) => {
  const fileName = decodeURIComponent(pathname.split("/").pop() || "document.pdf").replace(/["\\]/g, "");
  return fileName || "document.pdf";
};

self.addEventListener("fetch", (event) => {
  if (!isUploadPdfRequest(event.request.url)) return;

  event.respondWith(
    (async () => {
      const response = await fetch(event.request);
      if (!response.ok) return response;

      const url = new URL(event.request.url);
      const headers = new Headers(response.headers);
      headers.set("Content-Type", "application/pdf");
      headers.set("Content-Disposition", `inline; filename="${inlineFileName(url.pathname)}"`);
      headers.set("X-Content-Type-Options", "nosniff");

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    })()
  );
});
