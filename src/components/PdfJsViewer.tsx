import { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).href;

const ZOOM_LEVELS = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5];

interface Props {
  url: string;
  file?: File;
  style?: React.CSSProperties;
  className?: string;
}

export default function PdfJsViewer({ url, file, style, className }: Props) {
  const containerRef  = useRef<HTMLDivElement>(null);
  const pdfDocRef     = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const renderTasksRef = useRef<{ cancel: () => void }[]>([]);

  const [status,   setStatus]   = useState<'loading' | 'done' | 'error'>('loading');
  const [errMsg,   setErrMsg]   = useState('');
  const [numPages, setNumPages] = useState(0);
  const [curPage,  setCurPage]  = useState(1);
  const [scale,    setScale]    = useState(1.25);
  const [rotation, setRotation] = useState(0);

  /* ── Load PDF document (only when source changes) ── */
  useEffect(() => {
    if (!url && !file) return;
    setStatus('loading');
    setErrMsg('');
    pdfDocRef.current = null;

    async function loadDoc() {
      const source = file
        ? { data: await file.arrayBuffer(), cMapPacked: true }
        : { url, cMapPacked: true };
      const doc = await pdfjsLib.getDocument(source).promise;
      pdfDocRef.current = doc;
      setNumPages(doc.numPages);
      setStatus('done');
    }

    loadDoc().catch(err => {
      console.error('[PdfJsViewer]', err);
      setErrMsg(err?.message || 'Không đọc được file PDF');
      setStatus('error');
    });

    return () => {
      renderTasksRef.current.forEach(t => { try { t.cancel(); } catch {} });
    };
  }, [url, file]);

  /* ── Render pages whenever doc/scale/rotation changes ── */
  const renderPages = useCallback(async () => {
    const doc = pdfDocRef.current;
    if (!doc || !containerRef.current) return;

    renderTasksRef.current.forEach(t => { try { t.cancel(); } catch {} });
    renderTasksRef.current = [];
    containerRef.current.innerHTML = '';

    for (let i = 1; i <= doc.numPages; i++) {
      const page     = await doc.getPage(i);
      const viewport = page.getViewport({ scale, rotation });

      const wrapper = document.createElement('div');
      wrapper.style.cssText = 'margin:0 auto 10px;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.22);position:relative;flex-shrink:0;';
      wrapper.style.width  = viewport.width  + 'px';
      wrapper.style.height = viewport.height + 'px';
      wrapper.dataset.page = String(i);

      const canvas = document.createElement('canvas');
      canvas.width  = viewport.width;
      canvas.height = viewport.height;
      canvas.style.display = 'block';

      const label = document.createElement('div');
      label.textContent = `${i} / ${doc.numPages}`;
      label.style.cssText = 'position:absolute;bottom:6px;right:10px;font-size:11px;color:#94a3b8;background:rgba(255,255,255,.75);padding:1px 7px;border-radius:4px;pointer-events:none;user-select:none;';

      wrapper.appendChild(canvas);
      wrapper.appendChild(label);
      if (containerRef.current) containerRef.current.appendChild(wrapper);

      const ctx = canvas.getContext('2d')!;
      const task = page.render({ canvasContext: ctx, viewport, canvas } as any);
      renderTasksRef.current.push(task);
      await task.promise.catch(() => {});
    }
  }, [scale, rotation]);

  useEffect(() => {
    if (status === 'done') renderPages();
  }, [status, renderPages]);

  /* ── Scroll-spy: update curPage as user scrolls ── */
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    function onScroll() {
      if (!el || !containerRef.current) return;
      const pages = containerRef.current.querySelectorAll<HTMLElement>('[data-page]');
      const scrollMid = el.scrollTop + el.clientHeight / 2;
      let best = 1;
      pages.forEach(p => {
        if (p.offsetTop <= scrollMid) best = Number(p.dataset.page);
      });
      setCurPage(best);
    }
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [status]);

  /* ── Scroll to page ── */
  function scrollToPage(n: number) {
    if (!containerRef.current || !scrollRef.current) return;
    const target = containerRef.current.querySelector<HTMLElement>(`[data-page="${n}"]`);
    if (target) {
      scrollRef.current.scrollTo({ top: target.offsetTop - 12, behavior: 'smooth' });
      setCurPage(n);
    }
  }

  /* ── Zoom helpers ── */
  function zoomIn()  { setScale(s => { const next = ZOOM_LEVELS.find(z => z > s); return next ?? s; }); }
  function zoomOut() { setScale(s => { const prev = [...ZOOM_LEVELS].reverse().find(z => z < s); return prev ?? s; }); }
  function rotate(dir: 1 | -1) { setRotation(r => ((r + dir * 90) + 360) % 360); }

  const pct = Math.round(scale * 100);

  /* ── Toolbar button style ── */
  const btn: React.CSSProperties = {
    padding: '3px 9px', borderRadius: 5, border: 'none', fontSize: 13, fontWeight: 600,
    cursor: 'pointer', background: '#334155', color: '#cbd5e1', lineHeight: '20px',
    display: 'inline-flex', alignItems: 'center', gap: 4,
  };
  const btnDisabled = (disabled: boolean): React.CSSProperties => ({
    ...btn, opacity: disabled ? 0.35 : 1, cursor: disabled ? 'default' : 'pointer',
  });

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#475569', ...style }} className={className}>

      {/* ── Toolbar ── */}
      {status !== 'error' && (
        <div style={{ background: '#1e293b', borderBottom: '1px solid #334155', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>

          {/* Page nav */}
          <button style={btnDisabled(curPage <= 1)} disabled={curPage <= 1} onClick={() => scrollToPage(curPage - 1)}>◀</button>
          <span style={{ color: '#f1f5f9', fontSize: 13, fontWeight: 600, minWidth: 70, textAlign: 'center' }}>
            {status === 'loading' ? '…' : `${curPage} / ${numPages}`}
          </span>
          <button style={btnDisabled(curPage >= numPages)} disabled={curPage >= numPages} onClick={() => scrollToPage(curPage + 1)}>▶</button>

          <div style={{ width: 1, height: 20, background: '#475569', margin: '0 4px' }} />

          {/* Zoom */}
          <button style={btnDisabled(scale <= ZOOM_LEVELS[0])} disabled={scale <= ZOOM_LEVELS[0]} onClick={zoomOut} title="Thu nhỏ">−</button>
          <span style={{ color: '#f1f5f9', fontSize: 13, fontWeight: 600, minWidth: 46, textAlign: 'center' }}>{pct}%</span>
          <button style={btnDisabled(scale >= ZOOM_LEVELS[ZOOM_LEVELS.length - 1])} disabled={scale >= ZOOM_LEVELS[ZOOM_LEVELS.length - 1]} onClick={zoomIn} title="Phóng to">+</button>

          <div style={{ width: 1, height: 20, background: '#475569', margin: '0 4px' }} />

          {/* Rotate */}
          <button style={btn} onClick={() => rotate(-1)} title="Xoay trái 90°">↶</button>
          <button style={btn} onClick={() => rotate(1)}  title="Xoay phải 90°">↷</button>

          {/* Reset zoom */}
          <button style={{ ...btn, marginLeft: 4 }} onClick={() => { setScale(1.25); setRotation(0); }} title="Đặt lại">⊡ Đặt lại</button>
        </div>
      )}

      {/* ── Content ── */}
      <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', padding: '12px 8px', boxSizing: 'border-box' }}>
        {status === 'loading' && (
          <div style={{ color: '#f8fafc', fontSize: 14, fontWeight: 600, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, paddingTop: 60 }}>
            <div style={{ width: 32, height: 32, border: '3px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'pdfSpin 0.8s linear infinite' }} />
            Đang tải PDF…
            <style>{`@keyframes pdfSpin{to{transform:rotate(360deg)}}`}</style>
          </div>
        )}
        {status === 'error' && (
          <div style={{ color: '#fca5a5', fontSize: 14, fontWeight: 600, textAlign: 'center', padding: 32 }}>
            ⚠️ Không hiển thị được PDF<br />
            <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 400 }}>{errMsg}</span>
          </div>
        )}
        <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }} />
      </div>
    </div>
  );
}
