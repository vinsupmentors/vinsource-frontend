import { useEffect, useState, useCallback } from 'react';
import api from '@/lib/api';
import { Filter, Plus, X, Trash2, Save, Zap, ChevronDown } from 'lucide-react';

/**
 * LeadSquared-style advanced filter: groups of conditions joined by AND / OR.
 * The same JSON tree is (a) sent to the server for server-paged lists, and
 * (b) evaluated in the browser with `evalFilter` for in-memory tables (Comfort).
 */

export type FieldType = 'text' | 'select' | 'date' | 'number';
export interface FilterField { key: string; label: string; type: FieldType; options?: { value: string; label: string }[]; nullable?: boolean }
export interface FilterCondition { field: string; op: string; value?: unknown }
export interface FilterGroup { logic: 'AND' | 'OR'; children: (FilterCondition | FilterGroup)[] }
export type FilterScope = 'leads' | 'callLog' | 'activity' | 'comfort';

const isGroup = (n: FilterCondition | FilterGroup): n is FilterGroup => 'children' in n;

const OPS: Record<FieldType, { value: string; label: string; input: 'none' | 'one' | 'two' | 'multi' }[]> = {
  text: [
    { value: 'contains', label: 'contains', input: 'one' }, { value: 'not_contains', label: 'does not contain', input: 'one' },
    { value: 'is', label: 'is', input: 'one' }, { value: 'is_not', label: 'is not', input: 'one' },
    { value: 'starts', label: 'starts with', input: 'one' }, { value: 'ends', label: 'ends with', input: 'one' },
    { value: 'empty', label: 'is empty', input: 'none' }, { value: 'not_empty', label: 'is not empty', input: 'none' },
  ],
  select: [
    { value: 'in', label: 'is one of', input: 'multi' }, { value: 'not_in', label: 'is not one of', input: 'multi' },
    { value: 'is', label: 'is', input: 'multi' }, { value: 'is_not', label: 'is not', input: 'multi' },
    { value: 'empty', label: 'is empty', input: 'none' }, { value: 'not_empty', label: 'is not empty', input: 'none' },
  ],
  number: [
    { value: 'eq', label: '=', input: 'one' }, { value: 'neq', label: '≠', input: 'one' },
    { value: 'gt', label: '>', input: 'one' }, { value: 'lt', label: '<', input: 'one' },
    { value: 'between', label: 'between', input: 'two' },
    { value: 'empty', label: 'is empty', input: 'none' }, { value: 'not_empty', label: 'is not empty', input: 'none' },
  ],
  date: [
    { value: 'today', label: 'is today', input: 'none' }, { value: 'yesterday', label: 'was yesterday', input: 'none' },
    { value: 'last_7', label: 'in the last 7 days', input: 'none' }, { value: 'last_30', label: 'in the last 30 days', input: 'none' },
    { value: 'this_month', label: 'is this month', input: 'none' }, { value: 'overdue', label: 'is overdue (before today)', input: 'none' },
    { value: 'on', label: 'is on', input: 'one' }, { value: 'before', label: 'is before', input: 'one' },
    { value: 'after', label: 'is after', input: 'one' }, { value: 'between', label: 'is between', input: 'two' },
    { value: 'empty', label: 'is empty', input: 'none' }, { value: 'not_empty', label: 'is not empty', input: 'none' },
  ],
};

export const emptyTree = (): FilterGroup => ({ logic: 'AND', children: [] });

/** Count real (leaf) conditions — used to show "Filter (3)" and to know when nothing is applied. */
export function countConditions(n: FilterGroup | null | undefined): number {
  if (!n) return 0;
  return n.children.reduce((s, c) => s + (isGroup(c) ? countConditions(c) : 1), 0);
}

/** Drop incomplete rows (no value where one is needed) and empty groups, so a half-built filter never reaches the server. */
export function cleanTree(n: FilterGroup, fields: FilterField[]): FilterGroup {
  const keep: (FilterCondition | FilterGroup)[] = [];
  for (const c of n.children) {
    if (isGroup(c)) { const g = cleanTree(c, fields); if (g.children.length) keep.push(g); continue; }
    const f = fields.find((x) => x.key === c.field);
    if (!f) continue;
    const op = OPS[f.type].find((o) => o.value === c.op);
    if (!op) continue;
    if (op.input === 'none') { keep.push({ field: c.field, op: c.op }); continue; }
    const v = c.value;
    if (op.input === 'two') { if (Array.isArray(v) && v[0] && v[1]) keep.push(c); continue; }
    if (op.input === 'multi') { if (Array.isArray(v) ? v.length : v) keep.push(c); continue; }
    if (v !== undefined && v !== null && String(v) !== '') keep.push(c);
  }
  return { logic: n.logic, children: keep };
}

// ── Client-side evaluation (for tables that are already in memory) ───────────
const sod = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const eod = (d: Date) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };

function testCondition(raw: unknown, f: FilterField, c: FilterCondition): boolean {
  const empty = raw === null || raw === undefined || raw === '';
  if (c.op === 'empty') return empty;
  if (c.op === 'not_empty') return !empty;
  if (f.type === 'text') {
    const s = String(raw ?? '').toLowerCase(), v = String(c.value ?? '').toLowerCase();
    switch (c.op) {
      case 'is': return s === v; case 'is_not': return s !== v;
      case 'contains': return s.includes(v); case 'not_contains': return !s.includes(v);
      case 'starts': return s.startsWith(v); case 'ends': return s.endsWith(v);
    }
  } else if (f.type === 'select') {
    const vals = (Array.isArray(c.value) ? c.value : [c.value]).map(String);
    const has = vals.includes(String(raw ?? ''));
    return c.op === 'in' || c.op === 'is' ? has : !has;
  } else if (f.type === 'number') {
    const n = Number(raw); const v = Array.isArray(c.value) ? c.value : [c.value];
    if (empty || Number.isNaN(n)) return c.op === 'neq';
    switch (c.op) {
      case 'eq': return n === Number(v[0]); case 'neq': return n !== Number(v[0]);
      case 'gt': return n > Number(v[0]); case 'lt': return n < Number(v[0]);
      case 'between': return n >= Math.min(Number(v[0]), Number(v[1])) && n <= Math.max(Number(v[0]), Number(v[1]));
    }
  } else if (f.type === 'date') {
    if (empty) return false;
    const d = new Date(String(raw)); if (isNaN(d.getTime())) return false;
    const now = new Date();
    switch (c.op) {
      case 'today': return d >= sod(now) && d <= eod(now);
      case 'yesterday': { const y = new Date(now); y.setDate(y.getDate() - 1); return d >= sod(y) && d <= eod(y); }
      case 'last_7': { const s = new Date(now); s.setDate(s.getDate() - 6); return d >= sod(s) && d <= eod(now); }
      case 'last_30': { const s = new Date(now); s.setDate(s.getDate() - 29); return d >= sod(s) && d <= eod(now); }
      case 'this_month': return d >= new Date(now.getFullYear(), now.getMonth(), 1) && d <= eod(now);
      case 'overdue': return d < sod(now);
      case 'on': return d >= sod(new Date(String(c.value))) && d <= eod(new Date(String(c.value)));
      case 'before': return d < sod(new Date(String(c.value)));
      case 'after': return d > eod(new Date(String(c.value)));
      case 'between': { const v = c.value as string[]; return d >= sod(new Date(v[0])) && d <= eod(new Date(v[1])); }
    }
  }
  return true;
}

/** Does `row` satisfy the tree? `get` reads a field's value off the row. */
export function evalFilter<T>(row: T, tree: FilterGroup | null | undefined, fields: FilterField[], get: (row: T, key: string) => unknown): boolean {
  if (!tree || !tree.children.length) return true;
  const results = tree.children.map((c) => {
    if (isGroup(c)) return evalFilter(row, c, fields, get);
    const f = fields.find((x) => x.key === c.field);
    return f ? testCondition(get(row, c.field), f, c) : true;
  });
  return tree.logic === 'OR' ? results.some(Boolean) : results.every(Boolean);
}

/** Plain-English one-liner, e.g. (Source is one of Instagram, Referral) AND (City contains chen OR Status is DNP). */
export function describeFilter(n: FilterGroup, fields: FilterField[]): string {
  const parts = n.children.map((c) => {
    if (isGroup(c)) { const d = describeFilter(c, fields); return c.children.length > 1 ? `(${d})` : d; }
    const f = fields.find((x) => x.key === c.field);
    const op = f ? OPS[f.type].find((o) => o.value === c.op) : undefined;
    const label = (v: unknown) => { const o = f?.options?.find((x) => x.value === v); return o ? o.label : String(v); };
    const val = Array.isArray(c.value) ? c.value.map(label).join(f?.type === 'select' ? ', ' : ' – ') : c.value !== undefined ? label(c.value) : '';
    return `${f?.label ?? c.field} ${op?.label ?? c.op}${val ? ` ${val}` : ''}`;
  });
  return parts.join(` ${n.logic} `);
}

// ── Builder UI ───────────────────────────────────────────────────────────────
function ConditionRow({ c, fields, onChange, onRemove }: { c: FilterCondition; fields: FilterField[]; onChange: (c: FilterCondition) => void; onRemove: () => void }) {
  const f = fields.find((x) => x.key === c.field) || fields[0];
  const ops = OPS[f.type];
  const op = ops.find((o) => o.value === c.op) || ops[0];
  const set = (patch: Partial<FilterCondition>) => onChange({ ...c, ...patch });
  const arr = Array.isArray(c.value) ? (c.value as string[]) : c.value ? [String(c.value)] : [];
  const inputType = f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text';
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select className="px-2 py-1.5 border rounded-lg text-sm" value={f.key}
        onChange={(e) => { const nf = fields.find((x) => x.key === e.target.value)!; set({ field: nf.key, op: OPS[nf.type][0].value, value: undefined }); }}>
        {fields.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
      </select>
      <select className="px-2 py-1.5 border rounded-lg text-sm" value={op.value} onChange={(e) => set({ op: e.target.value, value: undefined })}>
        {ops.filter((o) => f.nullable || f.type === 'text' || (o.value !== 'empty' && o.value !== 'not_empty')).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {op.input === 'one' && (
        <input type={inputType} className="px-2 py-1.5 border rounded-lg text-sm" value={String(c.value ?? '')} onChange={(e) => set({ value: e.target.value })} />
      )}
      {op.input === 'two' && (
        <>
          <input type={inputType} className="px-2 py-1.5 border rounded-lg text-sm" value={String(arr[0] ?? '')} onChange={(e) => set({ value: [e.target.value, arr[1] ?? ''] })} />
          <span className="text-xs text-muted-foreground">and</span>
          <input type={inputType} className="px-2 py-1.5 border rounded-lg text-sm" value={String(arr[1] ?? '')} onChange={(e) => set({ value: [arr[0] ?? '', e.target.value] })} />
        </>
      )}
      {op.input === 'multi' && (
        f.options && f.options.length ? (
          <select multiple className="px-2 py-1 border rounded-lg text-sm min-w-[180px] h-24" value={arr}
            onChange={(e) => set({ value: Array.from(e.target.selectedOptions).map((o) => o.value) })}>
            {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ) : (
          <input className="px-2 py-1.5 border rounded-lg text-sm" placeholder="value, value…" value={arr.join(', ')} onChange={(e) => set({ value: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
        )
      )}
      <button onClick={onRemove} title="Remove condition" className="text-muted-foreground hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
    </div>
  );
}

function GroupEditor({ g, fields, onChange, onRemove, depth }: { g: FilterGroup; fields: FilterField[]; onChange: (g: FilterGroup) => void; onRemove?: () => void; depth: number }) {
  const newCondition = (): FilterCondition => ({ field: fields[0].key, op: OPS[fields[0].type][0].value });
  const setChild = (i: number, n: FilterCondition | FilterGroup) => onChange({ ...g, children: g.children.map((c, j) => (j === i ? n : c)) });
  const removeChild = (i: number) => onChange({ ...g, children: g.children.filter((_, j) => j !== i) });
  return (
    <div className={`space-y-2 rounded-xl border p-3 ${depth > 0 ? 'bg-muted/30' : 'bg-white'}`}>
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Match</span>
        <select className="px-2 py-1 border rounded-lg text-sm font-medium" value={g.logic} onChange={(e) => onChange({ ...g, logic: e.target.value as 'AND' | 'OR' })}>
          <option value="AND">ALL of these (AND)</option>
          <option value="OR">ANY of these (OR)</option>
        </select>
        {onRemove && <button onClick={onRemove} className="ml-auto text-xs text-red-600 hover:underline">Remove group</button>}
      </div>
      {g.children.map((c, i) => (
        <div key={i} className="pl-1">
          {isGroup(c)
            ? <GroupEditor g={c} fields={fields} depth={depth + 1} onChange={(n) => setChild(i, n)} onRemove={() => removeChild(i)} />
            : <ConditionRow c={c} fields={fields} onChange={(n) => setChild(i, n)} onRemove={() => removeChild(i)} />}
        </div>
      ))}
      <div className="flex gap-3 pt-1">
        <button onClick={() => onChange({ ...g, children: [...g.children, newCondition()] })} className="text-xs font-medium text-blue-600 hover:underline inline-flex items-center gap-1"><Plus className="w-3 h-3" /> Add condition</button>
        {depth < 2 && (
          <button onClick={() => onChange({ ...g, children: [...g.children, { logic: 'OR', children: [newCondition()] }] })} className="text-xs font-medium text-blue-600 hover:underline inline-flex items-center gap-1"><Plus className="w-3 h-3" /> Add group</button>
        )}
      </div>
    </div>
  );
}

interface SavedRow { id: string; name: string; tree: FilterGroup; shared: boolean; mine: boolean }

/**
 * Button + summary chip + builder dialog + saved filters. `value` is the APPLIED
 * filter (already cleaned); the parent re-fetches / re-filters whenever it changes.
 */
export default function AdvancedFilter({ scope, fields, value, onChange }: {
  scope: FilterScope; fields: FilterField[]; value: FilterGroup | null; onChange: (t: FilterGroup | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<FilterGroup>(value || emptyTree());
  const [saved, setSaved] = useState<SavedRow[]>([]);
  const [canShare, setCanShare] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [share, setShare] = useState(false);
  const [error, setError] = useState('');
  const [qOpen, setQOpen] = useState(false);
  const dateFields = fields.filter((f) => f.type === 'date');
  const [rField, setRField] = useState('');
  const [rFrom, setRFrom] = useState('');
  const [rTo, setRTo] = useState('');
  const n = countConditions(value);
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const rangeOf = (k: 'today' | 'yesterday' | '7' | '30' | 'month' | 'lastmonth'): [string, string] => {
    const now = new Date(); const day = (o: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + o);
    if (k === 'today') return [iso(day(0)), iso(day(0))];
    if (k === 'yesterday') return [iso(day(-1)), iso(day(-1))];
    if (k === '7') return [iso(day(-6)), iso(day(0))];
    if (k === '30') return [iso(day(-29)), iso(day(0))];
    if (k === 'month') return [iso(new Date(now.getFullYear(), now.getMonth(), 1)), iso(day(0))];
    return [iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)), iso(new Date(now.getFullYear(), now.getMonth(), 0))];
  };
  // "<date field> is between <from> and <to>", combined (AND) with whatever else is in the filter; replaces an earlier range on the same field.
  const withRange = (tree: FilterGroup, from: string, to: string): FilterGroup => {
    const key = rField || dateFields[0]?.key;
    const cond: FilterCondition = { field: key, op: 'between', value: [from, to] };
    const rest = cleanTree(tree, fields);
    const kept = rest.children.filter((c) => isGroup(c) || !(c.field === key && c.op === 'between'));
    return rest.logic === 'AND' ? { logic: 'AND', children: [...kept, cond] } : { logic: 'AND', children: [rest, cond] };
  };
  const addRange = (from = rFrom, to = rTo) => {
    if (!dateFields.length || !from || !to) { setError('Pick the date field and both dates'); return; }
    if (from > to) { setError('The "from" date is after the "to" date'); return; }
    setError(''); setDraft(withRange(draft, from, to)); setRFrom(''); setRTo('');
  };
  const quick = (k: 'today' | 'yesterday' | '7' | '30' | 'month' | 'lastmonth') => { const [f, t] = rangeOf(k); addRange(f, t); };
  const loadSaved = useCallback(() => {
    api.get('/api/saved-filters', { params: { scope } }).then((r) => { setSaved(r.data.data); setCanShare(!!r.data.canShare); }).catch(() => setSaved([]));
  }, [scope]);
  useEffect(() => { loadSaved(); }, [loadSaved]);
  useEffect(() => { if (open) { setDraft(value && value.children.length ? value : { logic: 'AND', children: [{ field: fields[0].key, op: OPS[fields[0].type][0].value }] }); setError(''); loadSaved(); } /* eslint-disable-next-line */ }, [open]);

  const pending = (): FilterGroup => (dateFields.length && rFrom && rTo && rFrom <= rTo ? withRange(draft, rFrom, rTo) : draft);
  const apply = () => {
    const cleaned = cleanTree(pending(), fields);
    onChange(cleaned.children.length ? cleaned : null);
    setOpen(false);
  };
  const save = async () => {
    const cleaned = cleanTree(pending(), fields);
    if (!cleaned.children.length) { setError('Add at least one complete condition first'); return; }
    if (!saveName.trim()) { setError('Give the filter a name to save it'); return; }
    try {
      await api.post('/api/saved-filters', { scope, name: saveName.trim(), tree: cleaned, shared: share });
      setSaveName(''); setShare(false); setError(''); loadSaved();
    } catch (e: unknown) { setError((e as { response?: { data?: { message?: string } } }).response?.data?.message || 'Could not save'); }
  };
  const del = async (id: string) => { await api.delete(`/api/saved-filters/${id}`).catch(() => {}); loadSaved(); };

  return (
    <>
      <button onClick={() => setOpen(true)} className={`px-3 py-2 border rounded-lg text-sm flex items-center gap-2 ${n ? 'border-blue-400 bg-blue-50 text-blue-700' : ''}`}>
        <Filter className="w-4 h-4" /> Advanced filter{n ? ` (${n})` : ''}
      </button>
      <div className="relative">
        <button onClick={() => { setQOpen((o) => !o); if (!qOpen) loadSaved(); }} className={`px-3 py-2 border rounded-lg text-sm flex items-center gap-2 ${qOpen ? 'bg-muted/50' : ''}`}>
          <Zap className="w-4 h-4" /> Quick filters{saved.length > 0 && <span className="text-xs text-muted-foreground">({saved.length})</span>} <ChevronDown className="w-3 h-3" />
        </button>
        {qOpen && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setQOpen(false)} />
            <div className="absolute z-30 mt-1 w-72 max-h-80 overflow-y-auto bg-white border rounded-lg shadow-lg p-1">
              {saved.length === 0 && <p className="text-xs text-muted-foreground px-3 py-3">No saved filters yet. Build one in Advanced filter, name it and press Save — it will appear here.</p>}
              {saved.map((sf) => (
                <div key={sf.id} className="flex items-center gap-1 rounded hover:bg-muted/50 pr-1">
                  <button onClick={() => { onChange(cleanTree(sf.tree, fields)); setQOpen(false); }} className="flex-1 text-left px-3 py-2 text-sm truncate" title={describeFilter(sf.tree, fields)}>
                    {sf.name}{sf.shared && <span className="ml-2 text-[10px] text-muted-foreground">(shared)</span>}
                  </button>
                  {(sf.mine || canShare) && <button onClick={() => del(sf.id)} title="Delete" className="text-muted-foreground hover:text-red-600 p-1"><X className="w-3 h-3" /></button>}
                </div>
              ))}
              {value && <button onClick={() => { onChange(null); setQOpen(false); }} className="w-full text-left text-xs text-blue-600 px-3 py-2 hover:underline border-t">Clear current filter</button>}
            </div>
          </>
        )}
      </div>
      {n > 0 && value && (
        <span className="text-xs bg-blue-50 text-blue-800 rounded-lg px-2 py-1 max-w-xl truncate" title={describeFilter(value, fields)}>
          {describeFilter(value, fields)} <button className="ml-1 font-semibold" onClick={() => onChange(null)} title="Clear"><X className="w-3 h-3 inline" /></button>
        </span>
      )}
      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-lg">Advanced filter</h2>
              <button onClick={() => setOpen(false)}><X className="w-4 h-4" /></button>
            </div>

            {saved.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted-foreground">Saved:</span>
                {saved.map((s) => (
                  <span key={s.id} className="inline-flex items-center gap-1 bg-muted rounded-full pl-3 pr-2 py-1">
                    <button onClick={() => setDraft(s.tree)} className="font-medium hover:underline">{s.name}</button>
                    {s.shared && <span className="text-[10px] text-muted-foreground">(shared)</span>}
                    {(s.mine || canShare) && <button onClick={() => del(s.id)} title="Delete saved filter" className="text-muted-foreground hover:text-red-600"><X className="w-3 h-3" /></button>}
                  </span>
                ))}
              </div>
            )}

            {dateFields.length > 0 && (
              <div className="rounded-xl border p-3 space-y-2 bg-blue-50/40">
                <p className="text-sm font-medium">Date range</p>
                <div className="flex flex-wrap items-center gap-2">
                  <select className="px-2 py-1.5 border rounded-lg text-sm bg-white" value={rField || dateFields[0].key} onChange={(e) => setRField(e.target.value)}>
                    {dateFields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                  </select>
                  <input type="date" className="px-2 py-1.5 border rounded-lg text-sm bg-white" value={rFrom} onChange={(e) => setRFrom(e.target.value)} />
                  <span className="text-xs text-muted-foreground">to</span>
                  <input type="date" className="px-2 py-1.5 border rounded-lg text-sm bg-white" value={rTo} onChange={(e) => setRTo(e.target.value)} />
                  <button onClick={() => addRange()} className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm">Add range</button>
                </div>
                <div className="flex flex-wrap gap-1.5 text-xs">
                  {([['today', 'Today'], ['yesterday', 'Yesterday'], ['7', 'Last 7 days'], ['30', 'Last 30 days'], ['month', 'This month'], ['lastmonth', 'Last month']] as const).map(([k, l]) => (
                    <button key={k} onClick={() => quick(k)} className="px-2.5 py-1 rounded-full border bg-white hover:bg-muted/50">{l}</button>
                  ))}
                </div>
              </div>
            )}

            <GroupEditor g={draft} fields={fields} depth={0} onChange={setDraft} />

            {cleanTree(draft, fields).children.length > 0 && (
              <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">{describeFilter(cleanTree(draft, fields), fields)}</p>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex flex-wrap items-center gap-2 border-t pt-3">
              <input className="px-3 py-2 border rounded-lg text-sm" placeholder="Save this filter as…" value={saveName} onChange={(e) => setSaveName(e.target.value)} />
              {canShare && <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} /> Share with everyone</label>}
              <button onClick={save} className="px-3 py-2 border rounded-lg text-sm inline-flex items-center gap-1"><Save className="w-4 h-4" /> Save</button>
              <div className="ml-auto flex gap-2">
                <button onClick={() => { onChange(null); setOpen(false); }} className="px-3 py-2 border rounded-lg text-sm">Clear filter</button>
                <button onClick={apply} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm">Apply</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
