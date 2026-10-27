import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUp, ArrowDown, ChevronDown, Filter } from 'lucide-react';

/**
 * Excel-style column header: click for sort A→Z / Z→A and (optionally) a value checklist or a "contains" box.
 * `value` is a comma-separated list of ticked option values — same convention as the other multi-selects.
 */
export default function ColumnHeader({
  label, sortKey, sortBy, sortDir, onSort, options, value, onChange, text, onText, className = '',
}: {
  label: string;
  sortKey?: string; sortBy?: string; sortDir?: 'asc' | 'desc'; onSort?: (key: string, dir: 'asc' | 'desc' | '') => void;
  options?: { value: string; label: string }[]; value?: string; onChange?: (v: string) => void;
  text?: string; onText?: (v: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const selected = value ? value.split(',').filter(Boolean) : [];
  const sorted = !!sortKey && sortBy === sortKey;
  const filtered = selected.length > 0 || !!text;

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    setPos({ top: Math.min(r.bottom + 4, window.innerHeight - 330), left: Math.max(8, Math.min(r.left, window.innerWidth - 248)) });
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { const t = e.target as Node; if (!btn.current?.contains(t) && !pop.current?.contains(t)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const toggle = (v: string) => onChange?.((selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]).join(','));
  const shown = (options || []).filter((o) => !q || o.label.toLowerCase().includes(q.toLowerCase()));

  return (
    <th className={`px-3 py-3 ${className}`}>
      <button ref={btn} type="button" onClick={() => { setOpen((o) => !o); setQ(''); }}
        className={`inline-flex items-center gap-1 uppercase ${filtered || sorted ? 'text-blue-700' : ''} hover:text-foreground`}>
        {label}
        {sorted && (sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
        {filtered ? <Filter className="w-3 h-3" /> : <ChevronDown className="w-3 h-3 opacity-50" />}
      </button>
      {open && createPortal(
        <div ref={pop} style={{ position: 'fixed', top: pos.top, left: pos.left }} className="z-[1000] w-60 bg-white text-gray-900 normal-case font-normal border rounded-xl shadow-xl p-2 text-sm">
          {sortKey && onSort && (
            <div className="pb-2 mb-2 border-b space-y-0.5">
              <button onClick={() => { onSort(sortKey, 'asc'); setOpen(false); }} className={`w-full text-left px-2 py-1 rounded hover:bg-gray-100 ${sorted && sortDir === 'asc' ? 'text-blue-700 font-medium' : ''}`}>Sort A → Z / oldest first</button>
              <button onClick={() => { onSort(sortKey, 'desc'); setOpen(false); }} className={`w-full text-left px-2 py-1 rounded hover:bg-gray-100 ${sorted && sortDir === 'desc' ? 'text-blue-700 font-medium' : ''}`}>Sort Z → A / newest first</button>
              {sorted && <button onClick={() => { onSort(sortKey, ''); setOpen(false); }} className="w-full text-left px-2 py-1 rounded hover:bg-gray-100 text-muted-foreground">Clear sort</button>}
            </div>
          )}
          {onText && (
            <div className="space-y-1">
              <input autoFocus value={text || ''} onChange={(e) => onText(e.target.value)} placeholder={`${label} contains…`} className="w-full border rounded-lg px-2 py-1.5 text-sm" />
              {text && <button onClick={() => onText('')} className="text-xs text-red-600 hover:underline">Clear filter</button>}
            </div>
          )}
          {options && onChange && (
            <div className="space-y-1">
              {options.length > 8 && <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="w-full border rounded-lg px-2 py-1 text-sm" />}
              <div className="max-h-52 overflow-y-auto">
                {shown.map((o) => (
                  <label key={o.value} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-100 cursor-pointer">
                    <input type="checkbox" checked={selected.includes(o.value)} onChange={() => toggle(o.value)} /> <span className="truncate">{o.label}</span>
                  </label>
                ))}
                {shown.length === 0 && <p className="text-xs text-muted-foreground px-2 py-1">No match</p>}
              </div>
              <div className="flex justify-between pt-1 border-t">
                <button onClick={() => onChange((options || []).map((o) => o.value).join(','))} className="text-xs text-blue-600 hover:underline">Select all</button>
                <button onClick={() => onChange('')} className="text-xs text-red-600 hover:underline">Clear</button>
              </div>
            </div>
          )}
        </div>,
        document.body
      )}
    </th>
  );
}
