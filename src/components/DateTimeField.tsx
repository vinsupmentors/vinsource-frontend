import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar as CalIcon, ChevronLeft, ChevronRight, X } from 'lucide-react';

/**
 * Date + time picker with an explicit OK button (the browser's own datetime-local picker has none).
 * Value is a local "YYYY-MM-DDTHH:mm" string — same as <input type="datetime-local">, so it is a drop-in replacement.
 */
const pad = (n: number) => String(n).padStart(2, '0');
const toValue = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const parse = (v: string): Date | null => { if (!v) return null; const d = new Date(v); return isNaN(d.getTime()) ? null : d; };
const WEEK = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export function formatDateTimeValue(v: string): string {
  const d = parse(v);
  return d ? d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }) : '';
}

export default function DateTimeField({
  value, onChange, placeholder = 'Pick date & time', className = '', min, allowClear = true, disabled,
}: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string; min?: Date; allowClear?: boolean; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const base = parse(value) ?? new Date();
  const [draft, setDraft] = useState<Date>(base);
  const [view, setView] = useState<Date>(new Date(base.getFullYear(), base.getMonth(), 1));
  const wrap = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; maxH: number }>({ top: 0, left: 0, maxH: 400 });
  // Float above everything (portal + fixed) so a modal's edge or the screen bottom never clips the OK button.
  useLayoutEffect(() => {
    if (!open || !wrap.current) return;
    const place = () => {
      const r = wrap.current!.getBoundingClientRect();
      const W = 300, H = Math.min(pop.current?.offsetHeight || 400, window.innerHeight - 16);
      const below = window.innerHeight - r.bottom - 8, above = r.top - 8;
      const top = below >= H ? r.bottom + 4 : above >= H ? r.top - H - 4 : Math.max(8, window.innerHeight - H - 8);
      setPos({ top, left: Math.max(8, Math.min(r.left, window.innerWidth - W - 8)), maxH: window.innerHeight - 16 });
    };
    place();
    window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open, view]);

  useEffect(() => {
    if (!open) return;
    const d = parse(value) ?? (() => { const n = new Date(); n.setMinutes(Math.ceil(n.getMinutes() / 5) * 5, 0, 0); return n; })();
    setDraft(d); setView(new Date(d.getFullYear(), d.getMonth(), 1));
    const h = (e: MouseEvent) => { const t = e.target as Node; if (wrap.current && !wrap.current.contains(t) && !pop.current?.contains(t)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const cells = useMemo(() => {
    const first = new Date(view.getFullYear(), view.getMonth(), 1);
    const start = new Date(first); start.setDate(1 - first.getDay());
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  }, [view]);

  const hour12 = draft.getHours() % 12 === 0 ? 12 : draft.getHours() % 12;
  const isPM = draft.getHours() >= 12;
  const setTime = (h12: number, m: number, pm: boolean) => {
    const d = new Date(draft); d.setHours((h12 % 12) + (pm ? 12 : 0), m, 0, 0); setDraft(d);
  };
  const pickDay = (d: Date) => { const n = new Date(draft); n.setFullYear(d.getFullYear(), d.getMonth(), d.getDate()); setDraft(n); };
  const quick = (daysAhead: number, h: number, m = 0) => { const d = new Date(); d.setDate(d.getDate() + daysAhead); d.setHours(h, m, 0, 0); setDraft(d); setView(new Date(d.getFullYear(), d.getMonth(), 1)); };
  const today = new Date();
  const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const tooEarly = !!min && draft.getTime() < min.getTime();

  return (
    <div ref={wrap} className={`relative inline-block ${className}`}>
      <button type="button" disabled={disabled} onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3 py-2 border rounded-lg text-sm bg-background hover:bg-muted/40 min-w-[210px] text-left disabled:opacity-50">
        <CalIcon className="w-4 h-4 text-muted-foreground" />
        <span className={value ? '' : 'text-muted-foreground'}>{value ? formatDateTimeValue(value) : placeholder}</span>
      </button>
      {open && createPortal(
        <div ref={pop} style={{ position: 'fixed', top: pos.top, left: pos.left, maxHeight: pos.maxH }} className="z-[1000] w-[300px] overflow-y-auto bg-white text-gray-900 border rounded-xl shadow-xl p-3 space-y-3">
          <div className="flex items-center justify-between">
            <button type="button" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))} className="p-1 rounded hover:bg-muted"><ChevronLeft className="w-4 h-4" /></button>
            <span className="text-sm font-semibold">{view.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</span>
            <button type="button" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))} className="p-1 rounded hover:bg-muted"><ChevronRight className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-7 text-center text-[11px] text-muted-foreground">{WEEK.map((w) => <span key={w}>{w}</span>)}</div>
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((d) => {
              const inMonth = d.getMonth() === view.getMonth();
              const sel = sameDay(d, draft);
              const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
              const past = !!min && dayStart.getTime() < min.getTime();
              return (
                <button type="button" key={d.toISOString()} disabled={past} onClick={() => pickDay(d)}
                  className={`h-8 text-xs rounded-lg ${sel ? 'bg-blue-600 text-white font-semibold' : sameDay(d, today) ? 'border border-blue-400 text-blue-700' : inMonth ? 'hover:bg-muted' : 'text-muted-foreground/50 hover:bg-muted'} disabled:opacity-30 disabled:hover:bg-transparent`}>
                  {d.getDate()}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground w-9">Time</span>
            <select value={hour12} onChange={(e) => setTime(Number(e.target.value), draft.getMinutes(), isPM)} className="border rounded-lg px-2 py-1 text-sm">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => <option key={h} value={h}>{pad(h)}</option>)}
            </select>
            <span>:</span>
            <select value={Math.floor(draft.getMinutes() / 5) * 5} onChange={(e) => setTime(hour12, Number(e.target.value), isPM)} className="border rounded-lg px-2 py-1 text-sm">
              {Array.from({ length: 12 }, (_, i) => i * 5).map((m) => <option key={m} value={m}>{pad(m)}</option>)}
            </select>
            <select value={isPM ? 'PM' : 'AM'} onChange={(e) => setTime(hour12, draft.getMinutes(), e.target.value === 'PM')} className="border rounded-lg px-2 py-1 text-sm">
              <option>AM</option><option>PM</option>
            </select>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => quick(0, 17)} className="text-[11px] border rounded-full px-2 py-0.5 hover:bg-muted">Today 5 PM</button>
            <button type="button" onClick={() => quick(1, 11)} className="text-[11px] border rounded-full px-2 py-0.5 hover:bg-muted">Tomorrow 11 AM</button>
            <button type="button" onClick={() => quick(1, 16)} className="text-[11px] border rounded-full px-2 py-0.5 hover:bg-muted">Tomorrow 4 PM</button>
            <button type="button" onClick={() => quick(7, 11)} className="text-[11px] border rounded-full px-2 py-0.5 hover:bg-muted">Next week</button>
          </div>
          {tooEarly && <p className="text-[11px] text-red-600">Pick a time in the future.</p>}
          <div className="flex items-center justify-between pt-1 border-t">
            {allowClear && value ? <button type="button" onClick={() => { onChange(''); setOpen(false); }} className="text-xs text-red-600 hover:underline flex items-center gap-1"><X className="w-3 h-3" /> Clear</button> : <span />}
            <div className="flex gap-2">
              <button type="button" onClick={() => setOpen(false)} className="px-3 py-1.5 text-sm border rounded-lg">Cancel</button>
              <button type="button" disabled={tooEarly} onClick={() => { onChange(toValue(draft)); setOpen(false); }} className="px-4 py-1.5 text-sm rounded-lg bg-blue-600 text-white font-medium disabled:opacity-50">OK</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
