import { useEffect, useMemo, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Loader2, X, AlertTriangle } from 'lucide-react';
import api from '@/lib/api';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

/**
 * Read-only PDF viewer for study material: pages are drawn on canvases inside the portal, so there is no
 * browser PDF toolbar (no download / print buttons), the right-click menu and drag-save are blocked, text can't be
 * selected, Ctrl+S / Ctrl+P are swallowed and printing the page shows nothing. A faint watermark with the
 * student's name makes screenshots traceable.
 *
 * Note: this stops casual saving; it can't stop screenshots or a determined user with developer tools.
 */
export default function SecurePdfViewer({ apiPath, title, watermark, onClose }: { apiPath: string; title: string; watermark: string; onClose: () => void }) {
  const [data, setData] = useState<Uint8Array | null>(null);
  const [error, setError] = useState('');
  const [pages, setPages] = useState(0);
  const [width, setWidth] = useState(800);
  const boxRef = useRef<HTMLDivElement>(null);

  // Fetch with the student's login (the file endpoint is authenticated) — the bytes never get a URL the browser can save.
  useEffect(() => {
    let alive = true;
    api.get(apiPath, { responseType: 'arraybuffer' })
      .then((r) => { if (alive) setData(new Uint8Array(r.data)); })
      .catch(() => { if (alive) setError('This file could not be opened. It may not be released to your batch yet.'); });
    return () => { alive = false; };
  }, [apiPath]);

  // Keep page width = viewer width
  useEffect(() => {
    const fit = () => setWidth(Math.min(1000, (boxRef.current?.clientWidth ?? 800) - 24));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [data]);

  // Block save / print shortcuts and Escape-to-close while open
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (e.key === 'Escape') { onClose(); return; }
      if ((e.ctrlKey || e.metaKey) && ['s', 'p', 'u'].includes(k)) { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener('keydown', key, true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', key, true); document.body.style.overflow = prevOverflow; };
  }, [onClose]);

  const file = useMemo(() => (data ? { data: data.slice() } : null), [data]);
  const stop = (e: { preventDefault: () => void }) => e.preventDefault();

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 flex flex-col secure-pdf" onContextMenu={stop}>
      {/* printing the page prints nothing */}
      <style>{`@media print { .secure-pdf { display: none !important; } }`}</style>
      <div className="flex items-center justify-between px-4 py-2.5 bg-card border-b">
        <p className="text-sm font-semibold truncate pr-3">{title}</p>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted" aria-label="Close"><X className="w-5 h-5" /></button>
      </div>

      <div className="relative flex-1 min-h-0">
      <div
        ref={boxRef}
        className="absolute inset-0 overflow-y-auto bg-neutral-700 select-none"
        style={{ WebkitUserSelect: 'none', userSelect: 'none' }}
        onContextMenu={stop}
        onDragStart={stop}
        onCopy={stop}
        onCut={stop}
      >
        {error && (
          <div className="m-8 mx-auto max-w-md bg-card rounded-xl p-6 text-center text-sm">
            <AlertTriangle className="w-6 h-6 mx-auto mb-2 text-amber-600" /> {error}
          </div>
        )}
        {!error && !file && <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-white" /></div>}

        {file && (
          <Document
            file={file}
            onLoadSuccess={({ numPages }) => setPages(numPages)}
            onLoadError={() => setError('This PDF could not be displayed.')}
            loading={<div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-white" /></div>}
            className="flex flex-col items-center gap-3 py-3"
          >
            {Array.from({ length: pages }, (_, i) => (
              <Page key={i} pageNumber={i + 1} width={width} renderTextLayer={false} renderAnnotationLayer={false} className="shadow-lg" />
            ))}
          </Document>
        )}

      </div>

      {/* watermark stays fixed over the page area while the pages scroll underneath */}
      {file && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          <div className="absolute -inset-1/2 flex flex-wrap content-start gap-x-24 gap-y-28 -rotate-[25deg] opacity-[0.14]">
            {Array.from({ length: 160 }, (_, i) => <span key={i} className="text-lg font-semibold text-black whitespace-nowrap">{watermark}</span>)}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
