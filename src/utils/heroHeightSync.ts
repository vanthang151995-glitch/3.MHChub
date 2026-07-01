// heroHeightSync — CSS handles all layout now. This file is intentionally minimal.
// Chỉ update srcset 1 lần sau khi mount để đảm bảo ảnh hi-res trên màn hình lớn.
if (typeof window !== "undefined") {
  const updateSrcset = () => {
    if (window.innerWidth < 1200) return;
    try {
      const img = document.querySelector(
        '.portal-hero-carousel img'
      ) as HTMLImageElement | null;
      if (!img) return;
      const cur = img.currentSrc || img.src || '';
      if (/1600|2400|3840/.test(cur)) return;
      img.srcset =
        '/images/safety-6s-hero-3840.webp 3840w, /images/safety-6s-hero-2400.webp 2400w, /images/safety-6s-hero-1600.webp 1600w';
      img.sizes = '(min-width: 1200px) 50vw, 100vw';
    } catch (_) { /* ignore */ }
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateSrcset, { once: true });
  } else {
    setTimeout(updateSrcset, 0);
  }
}
