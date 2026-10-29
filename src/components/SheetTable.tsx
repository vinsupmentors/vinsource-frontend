import { useMemo, useState, type ReactNode } from 'react';
import ColumnHeader from './ColumnHeader';
import { TH, TD, errMsg } from './BrdLiveSheets';

export interface Col<T> {
  key: string; label: string; bg: string; fg?: string;
  get: (r: T) => string | number;         // value used for filter + default display
  sortVal?: (r: T) => string | number;     // value used for sorting (e.g. ISO date)
  render?: (r: T, i: number) => ReactNode;
  cls?: string;                            // extra td classes
  cellBg?: (r: T) => string | undefined;
  noFilter?: boolean;
  edit?: (r: T, v: string) => Promise<unknown>; // makes the cell editable (double-click)
  editVal?: (r: T) => string;
  multiline?: boolean;
}

function EditCell({ initial, multiline, onSave, onClose }: { initial: string; multiline?: boolean; onSave: (v: string) => Promise<void>; onClose: () => void }) {
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const commit = async () => {
    if (v === initial) return onClose();
    setBusy(true);
    try { await onSave(v); onClose(); } catch (e) { window.alert(errMsg(e, 'Could not save')); setBusy(false); }
  };
  const common = {
    autoFocus: true, value: v, disabled: busy, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV(e.target.value), onBlur: commit,
    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Escape') onClose(); else if (e.key === 'Enter' && (!multiline || e.ctrlKey)) { e.preventDefault(); commit(); } },
    className: 'w-full min-w-[160px] border border-blue-500 rounded px-1 py-0.5 text-[13px] bg-white',
  };
  return multiline ? <textarea rows={3} {...common} /> : <input {...common} />;
}

/** Google-Sheets-looking table with Excel-style per-column sort + filter and double-click cell editing. */
export default function SheetTable<T>({ rows, cols, rowKey, empty, canEdit, onChanged, maxH = '64vh', onCount }: {
  rows: T[]; cols: Col<T>[]; rowKey: (r: T) => string; empty: string; canEdit?: boolean; onChanged?: () => void; maxH?: string; onCount?: (n: number) => void;
}) {
  const [sel, setSel] = useState<Record<string, string>>({});
  const [txt, setTxt] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);
  const [editing, setEditing] = useState('');

  const options = useMemo(() => {
    const o: Record<string, { value: string; label: string }[]> = {};
    for (const c of cols) {
      if (c.noFilter) continue;
      const set = new Set<string>();
      for (const r of rows) { set.add(String(c.get(r) ?? '')); if (set.size > 60) break; }
      if (set.size <= 60) o[c.key] = [...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map((v) => ({ value: v, label: v === '' ? '(blank)' : v }));
    }
    return o;
  }, [rows, cols]);

  const shown = useMemo(() => {
    let out = rows.filter((r) => cols.every((c) => {
      const val = String(c.get(r) ?? '');
      const s = sel[c.key] ? sel[c.key].split(',') : null;
      if (s && !s.includes(val)) return false;
      const t = txt[c.key];
      return !t || val.toLowerCase().includes(t.toLowerCase());
    }));
    if (sort) {
      const c = cols.find((x) => x.key === sort.key);
      if (c) {
        const f = c.sortVal || c.get;
        out = [...out].sort((a, b) => {
          const x = f(a), y = f(b);
          const d = typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''), undefined, { numeric: true, sensitivity: 'base' });
          return sort.dir === 'asc' ? d : -d;
        });
      }
    }
    return out;
  }, [rows, cols, sel, txt, sort]);

  const active = Object.values(sel).some(Boolean) || Object.values(txt).some(Boolean);
  useMemo(() => { onCount?.(shown.length); }, [shown.length]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-1">
      {(active || sort) && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>Showing {shown.length} of {rows.length}</span>
          <button onClick={() => { setSel({}); setTxt({}); setSort(null); }} className="text-blue-600 hover:underline">Clear filters &amp; sort</button>
        </div>
      )}
      <div className="overflow-auto border rounded-lg bg-white" style={{ maxHeight: maxH }}>
        <table className="border-collapse text-[13px] text-black">
          <thead className="sticky top-0 z-10">
            <tr>
              {cols.map((c) => c.noFilter
                ? <th key={c.key} className={TH} style={{ background: c.bg, color: c.fg }}>{c.label}</th>
                : <ColumnHeader key={c.key} bare label={c.label} className={TH} style={{ background: c.bg, color: c.fg }}
                    sortKey={c.key} sortBy={sort?.key} sortDir={sort?.dir} onSort={(k, d) => setSort(d ? { key: k, dir: d } : null)}
                    options={options[c.key]} value={sel[c.key]} onChange={(v) => setSel((p) => ({ ...p, [c.key]: v }))}
                    text={txt[c.key]} onText={(v) => setTxt((p) => ({ ...p, [c.key]: v }))} />)}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? <tr><td colSpan={cols.length} className="py-8 text-center text-muted-foreground">{rows.length ? 'No rows match the filters' : empty}</td></tr> : shown.map((r, i) => {
              const id = rowKey(r);
              return (
                <tr key={id}>
                  {cols.map((c) => {
                    const cellId = `${id}:${c.key}`;
                    const editable = !!(canEdit && c.edit);
                    return (
                      <td key={c.key} className={`${TD} ${c.cls || ''} ${editable ? 'cursor-text hover:outline hover:outline-1 hover:outline-blue-400' : ''}`} style={{ background: c.cellBg?.(r) }}
                        title={editable ? 'Double-click to edit' : undefined} onDoubleClick={editable ? () => setEditing(cellId) : undefined}>
                        {editing === cellId && c.edit
                          ? <EditCell initial={c.editVal ? c.editVal(r) : String(c.get(r) ?? '')} multiline={c.multiline} onClose={() => setEditing('')} onSave={async (v) => { await c.edit!(r, v); onChanged?.(); }} />
                          : c.render ? c.render(r, i) : String(c.get(r) ?? '')}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
