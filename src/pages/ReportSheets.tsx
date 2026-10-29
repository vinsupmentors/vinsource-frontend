import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bold, AlignLeft, AlignCenter, AlignRight, Plus, Trash2, Eraser } from 'lucide-react';
import api from '@/lib/api';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import LiveSheet from '@/components/BrdLiveSheets';
import RevenueSheet from '@/components/RevenueLiveSheets';

interface Cell { v: string; bg?: string; fg?: string; b?: 1; i?: 1; al?: 'l' | 'c' | 'r' }
interface Content { rows: number; cols: number; colWidths: number[]; rowHeights: Record<string, number>; merges: { r: number; c: number; rs: number; cs: number }[]; cells: Record<string, Cell>; frozenRows: number }
interface SheetRow { id: string; name: string; kind?: string; liveKey?: string | null; content: Content }
interface BookRow { id: string; name: string; sheets: SheetRow[] }
interface BookLite { id: string; name: string }

const errMsg = (e: unknown, fb: string) => (e as { response?: { data?: { message?: string } } }).response?.data?.message || fb;
const colName = (i: number) => { let s = ''; let n = i; do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0); return s; };
const FILLS = ['#ffffff', '#ffff00', '#b6d7a8', '#57bb8a', '#a4c2f4', '#00ffff', '#f6b26b', '#e67c73', '#ea4335', '#d9d9d9'];
const TEXTS = ['#000000', '#ffffff', '#ea4335', '#0b5394'];

export default function ReportSheetsPage() {
  const { hasModule } = useModuleAccess();
  const canEdit = hasModule('REPORT_SHEETS', 'EDIT');
  const isAdmin = hasModule('REPORT_SHEETS', 'ADMIN');

  const [books, setBooks] = useState<BookLite[]>([]);
  const [book, setBook] = useState<BookRow | null>(null);
  const [sheetId, setSheetId] = useState<string>('');
  const [content, setContent] = useState<Content | null>(null);
  const [sel, setSel] = useState<{ r: number; c: number }>({ r: 0, c: 0 });
  const [editing, setEditing] = useState<{ r: number; c: number; value: string } | null>(null);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved');
  const [error, setError] = useState('');
  const pending = useRef<Map<string, { r: number; c: number; cell: Cell | null }>>(new Map());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sheetRef = useRef('');
  const grid = useRef<HTMLDivElement>(null);
  sheetRef.current = sheetId;

  const flush = useCallback(async (forSheet?: string) => {
    const id = forSheet || sheetRef.current;
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (!id || pending.current.size === 0) return;
    const cells = [...pending.current.values()];
    pending.current = new Map();
    setSaveState('saving');
    try { await api.patch(`/api/report-sheets/sheets/${id}/cells`, { cells }); setSaveState('saved'); }
    catch (e) { setSaveState('error'); setError(errMsg(e, 'Could not save your changes')); }
  }, []);

  const loadBook = useCallback(async (id: string) => {
    await flush();
    try {
      const r = await api.get(`/api/report-sheets/books/${id}`);
      const b: BookRow = r.data.data;
      setBook(b);
      const first = b.sheets[0];
      setSheetId(first?.id || '');
      setContent(first && first.kind !== 'LIVE' ? first.content : null);
      setSel({ r: 0, c: 0 }); setEditing(null);
    } catch (e) { setError(errMsg(e, 'Could not open the spreadsheet')); }
  }, [flush]);

  const loadBooks = useCallback(async (openId?: string) => {
    try {
      const r = await api.get('/api/report-sheets/books');
      const list: BookLite[] = r.data.data;
      setBooks(list);
      if (list.length) await loadBook(openId || list[0].id);
    } catch (e) { setError(errMsg(e, 'Could not load the spreadsheets')); }
  }, [loadBook]);

  useEffect(() => { loadBooks(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { flush(); }, [flush]);

  const switchSheet = async (id: string) => {
    if (!book || id === sheetId) return;
    await flush();
    // Re-read so we never show stale content after our own saves.
    try {
      const r = await api.get(`/api/report-sheets/books/${book.id}`);
      const b: BookRow = r.data.data;
      setBook(b);
      setSheetId(id);
      const target = b.sheets.find((s) => s.id === id);
      setContent(target && target.kind !== 'LIVE' ? target.content : null);
      setSel({ r: 0, c: 0 }); setEditing(null);
    } catch (e) { setError(errMsg(e, 'Could not open the sheet')); }
  };

  const queue = (r: number, c: number, cell: Cell | null) => {
    pending.current.set(`${r},${c}`, { r, c, cell });
    setSaveState('saving');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => flush(), 700);
  };

  const setCell = (r: number, c: number, cell: Cell | null) => {
    setContent((prev) => {
      if (!prev) return prev;
      const cells = { ...prev.cells };
      const key = `${r},${c}`;
      if (cell === null || (!cell.v && !cell.bg && !cell.fg && !cell.b && !cell.i)) delete cells[key]; else cells[key] = cell;
      return { ...prev, cells };
    });
    queue(r, c, cell);
  };

  const cellAt = (r: number, c: number): Cell | undefined => content?.cells[`${r},${c}`];

  const commit = (move?: 'down' | 'right' | 'none') => {
    if (!editing || !content) return;
    const { r, c, value } = editing;
    const existing = cellAt(r, c);
    if ((existing?.v ?? '') !== value) setCell(r, c, { ...(existing || { v: '' }), v: value });
    setEditing(null);
    if (move === 'down') setSel({ r: Math.min(content.rows - 1, r + 1), c });
    else if (move === 'right') setSel({ r, c: Math.min(content.cols - 1, c + 1) });
    setTimeout(() => grid.current?.focus(), 0);
  };

  const style = (patch: Partial<Cell>) => {
    if (!canEdit) return;
    const existing = cellAt(sel.r, sel.c) || { v: '' };
    const next: Cell = { ...existing, ...patch };
    (Object.keys(patch) as (keyof Cell)[]).forEach((k) => { if (patch[k] === undefined) delete next[k]; });
    setCell(sel.r, sel.c, next);
  };

  const onGridKey = (e: React.KeyboardEvent) => {
    if (!content || editing) return;
    const { r, c } = sel;
    const go = (nr: number, nc: number) => { e.preventDefault(); setSel({ r: Math.max(0, Math.min(content.rows - 1, nr)), c: Math.max(0, Math.min(content.cols - 1, nc)) }); };
    if (e.key === 'ArrowDown') return go(r + 1, c);
    if (e.key === 'ArrowUp') return go(r - 1, c);
    if (e.key === 'ArrowLeft') return go(r, c - 1);
    if (e.key === 'ArrowRight' || e.key === 'Tab') return go(r, c + (e.key === 'Tab' && e.shiftKey ? -1 : 1));
    if (!canEdit) return;
    if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); setEditing({ r, c, value: cellAt(r, c)?.v ?? '' }); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); const ex = cellAt(r, c); if (ex) setCell(r, c, { ...ex, v: '' }); return; }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); setEditing({ r, c, value: e.key }); }
  };

  const onPaste = (e: React.ClipboardEvent) => {
    if (!canEdit || editing || !content) return;
    const text = e.clipboardData.getData('text');
    if (!text) return;
    e.preventDefault();
    const lines = text.replace(/\r/g, '').replace(/\n$/, '').split('\n');
    lines.forEach((line, i) => line.split('\t').forEach((v, j) => {
      const r = sel.r + i, c = sel.c + j;
      if (r < content.rows && c < content.cols) setCell(r, c, { ...(cellAt(r, c) || { v: '' }), v });
    }));
  };

  const addRows = async () => {
    if (!content) return;
    await flush();
    const rows = content.rows + 20;
    setContent({ ...content, rows });
    api.patch(`/api/report-sheets/sheets/${sheetId}/cells`, { cells: [], rows }).catch(() => {});
  };

  const addSheet = async () => {
    if (!book) return;
    const name = window.prompt('Name of the new sheet');
    if (name === null) return;
    try {
      const r = await api.post(`/api/report-sheets/books/${book.id}/sheets`, { name });
      await loadBook(book.id);
      await switchSheet(r.data.data.id);
    } catch (e) { setError(errMsg(e, 'Could not add the sheet')); }
  };
  const renameSheet = async (s: SheetRow) => {
    if (!canEdit) return;
    const name = window.prompt('Rename sheet', s.name);
    if (!name || !name.trim() || name === s.name) return;
    try { await api.put(`/api/report-sheets/sheets/${s.id}`, { name: name.trim() }); setBook((b) => b && { ...b, sheets: b.sheets.map((x) => (x.id === s.id ? { ...x, name: name.trim() } : x)) }); }
    catch (e) { setError(errMsg(e, 'Could not rename')); }
  };
  const deleteSheet = async () => {
    if (!book || !isAdmin) return;
    const s = book.sheets.find((x) => x.id === sheetId);
    if (!s || !window.confirm(`Delete the sheet "${s.name}"? This can't be undone.`)) return;
    try { await api.delete(`/api/report-sheets/sheets/${s.id}`); pending.current = new Map(); await loadBook(book.id); }
    catch (e) { setError(errMsg(e, 'Could not delete the sheet')); }
  };
  const newBook = async () => {
    const name = window.prompt('Name of the new spreadsheet');
    if (!name || !name.trim()) return;
    try { const r = await api.post('/api/report-sheets/books', { name: name.trim() }); await loadBooks(r.data.data.id); }
    catch (e) { setError(errMsg(e, 'Could not create the spreadsheet')); }
  };

  // Merged ranges: which cells are hidden under a merge, and which anchor spans how much.
  const { covered, anchors } = useMemo(() => {
    const covered = new Set<string>();
    const anchors = new Map<string, { rs: number; cs: number }>();
    (content?.merges || []).forEach((m) => {
      anchors.set(`${m.r},${m.c}`, { rs: m.rs, cs: m.cs });
      for (let i = m.r; i < m.r + m.rs; i++) for (let j = m.c; j < m.c + m.cs; j++) if (i !== m.r || j !== m.c) covered.add(`${i},${j}`);
    });
    return { covered, anchors };
  }, [content?.merges]);

  const cur = content ? cellAt(sel.r, sel.c) : undefined;
  const activeSheet = book?.sheets.find((x) => x.id === sheetId);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Report Sheets</h1>
          <p className="text-sm text-muted-foreground">Live reports from the Sales data, plus free sheets (plain values — formulas are not calculated).</p>
        </div>
        <span className={`text-xs ${saveState === 'error' ? 'text-red-600' : 'text-muted-foreground'}`}>{saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Not saved' : 'All changes saved'}</span>
      </div>
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2 flex justify-between"><span>{error}</span><button onClick={() => setError('')}>×</button></div>}

      <div className="flex flex-wrap items-center gap-2">
        {books.map((b) => (
          <button key={b.id} onClick={() => loadBook(b.id)} className={`px-3 py-1.5 rounded-lg border text-sm font-medium ${book?.id === b.id ? 'bg-green-600 border-green-600 text-white' : 'hover:bg-muted/50'}`}>{b.name}</button>
        ))}
        {isAdmin && <button onClick={newBook} className="px-3 py-1.5 rounded-lg border border-dashed text-sm flex items-center gap-1 hover:bg-muted/50"><Plus className="w-3.5 h-3.5" /> New spreadsheet</button>}
      </div>

      {activeSheet?.kind === 'LIVE' && activeSheet.liveKey && (activeSheet.liveKey.startsWith('REV_')
        ? <RevenueSheet key={activeSheet.id} liveKey={activeSheet.liveKey} canEdit={canEdit} canAdmin={isAdmin} />
        : <LiveSheet key={activeSheet.id} liveKey={activeSheet.liveKey} canAdmin={isAdmin} canEdit={canEdit} />)}

      {content && activeSheet?.kind !== 'LIVE' && (
        <>
          <div className="flex flex-wrap items-center gap-1.5 border rounded-lg px-2 py-1.5 bg-card text-sm">
            <span className="font-mono text-xs px-2 py-1 bg-muted rounded">{colName(sel.c)}{sel.r + 1}</span>
            <button disabled={!canEdit} onClick={() => style({ b: cur?.b ? undefined : 1 })} className={`p-1.5 rounded hover:bg-muted ${cur?.b ? 'bg-muted' : ''} disabled:opacity-40`} title="Bold"><Bold className="w-4 h-4" /></button>
            <button disabled={!canEdit} onClick={() => style({ al: 'l' })} className="p-1.5 rounded hover:bg-muted disabled:opacity-40" title="Align left"><AlignLeft className="w-4 h-4" /></button>
            <button disabled={!canEdit} onClick={() => style({ al: 'c' })} className="p-1.5 rounded hover:bg-muted disabled:opacity-40" title="Centre"><AlignCenter className="w-4 h-4" /></button>
            <button disabled={!canEdit} onClick={() => style({ al: 'r' })} className="p-1.5 rounded hover:bg-muted disabled:opacity-40" title="Align right"><AlignRight className="w-4 h-4" /></button>
            <span className="mx-1 h-5 w-px bg-border" />
            <span className="text-xs text-muted-foreground">Fill</span>
            {FILLS.map((f) => <button key={f} disabled={!canEdit} onClick={() => style({ bg: f === '#ffffff' ? undefined : f })} title={f} className="w-5 h-5 rounded border disabled:opacity-40" style={{ background: f }} />)}
            <span className="mx-1 h-5 w-px bg-border" />
            <span className="text-xs text-muted-foreground">Text</span>
            {TEXTS.map((f) => <button key={f} disabled={!canEdit} onClick={() => style({ fg: f === '#000000' ? undefined : f })} title={f} className="w-5 h-5 rounded border disabled:opacity-40" style={{ background: f }} />)}
            <button disabled={!canEdit} onClick={() => style({ bg: undefined, fg: undefined, b: undefined, i: undefined, al: undefined })} className="p-1.5 rounded hover:bg-muted disabled:opacity-40" title="Clear formatting"><Eraser className="w-4 h-4" /></button>
            <span className="ml-auto flex items-center gap-2">
              {canEdit && <button onClick={addRows} className="text-xs px-2 py-1 border rounded hover:bg-muted">+ 20 rows</button>}
              {isAdmin && <button onClick={deleteSheet} className="text-xs px-2 py-1 border border-red-300 text-red-700 rounded hover:bg-red-50 flex items-center gap-1"><Trash2 className="w-3 h-3" /> Delete sheet</button>}
            </span>
          </div>

          <div ref={grid} tabIndex={0} onKeyDown={onGridKey} onPaste={onPaste} className="border rounded-lg bg-white overflow-auto max-h-[68vh] outline-none">
            <table className="border-collapse text-[13px] text-black" style={{ tableLayout: 'fixed', width: 40 + content.colWidths.slice(0, content.cols).reduce((n, w) => n + w, 0) }}>
              <colgroup><col style={{ width: 40 }} />{Array.from({ length: content.cols }, (_, c) => <col key={c} style={{ width: content.colWidths[c] || 100 }} />)}</colgroup>
              <thead>
                <tr>
                  <th className="sticky top-0 left-0 z-30 bg-[#f8f9fa] border border-[#c0c0c0] h-6" />
                  {Array.from({ length: content.cols }, (_, c) => (
                    <th key={c} className={`sticky top-0 z-20 border border-[#c0c0c0] h-6 text-[11px] font-normal ${sel.c === c ? 'bg-[#d3e3fd]' : 'bg-[#f8f9fa]'} text-[#444]`}>{colName(c)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: content.rows }, (_, r) => (
                  <tr key={r} style={{ height: content.rowHeights[String(r)] || 22 }}>
                    <td className={`sticky left-0 z-10 border border-[#c0c0c0] text-center text-[11px] ${sel.r === r ? 'bg-[#d3e3fd]' : 'bg-[#f8f9fa]'} text-[#444]`}>{r + 1}</td>
                    {Array.from({ length: content.cols }, (_, c) => {
                      const key = `${r},${c}`;
                      if (covered.has(key)) return null;
                      const cell = content.cells[key];
                      const span = anchors.get(key);
                      const isSel = sel.r === r && sel.c === c;
                      const isEditing = editing?.r === r && editing?.c === c;
                      return (
                        <td
                          key={c}
                          rowSpan={span?.rs} colSpan={span?.cs}
                          onMouseDown={() => { if (editing && !(editing.r === r && editing.c === c)) commit('none'); setSel({ r, c }); }}
                          onDoubleClick={() => canEdit && setEditing({ r, c, value: cell?.v ?? '' })}
                          className="border border-[#d0d0d0] px-1 align-middle overflow-hidden"
                          style={{
                            background: cell?.bg, color: cell?.fg, fontWeight: cell?.b ? 700 : undefined, fontStyle: cell?.i ? 'italic' : undefined,
                            textAlign: cell?.al === 'c' ? 'center' : cell?.al === 'r' ? 'right' : 'left', whiteSpace: 'pre-wrap',
                            outline: isSel ? '2px solid #1a73e8' : undefined, outlineOffset: -1, position: 'relative',
                          }}
                        >
                          {isEditing ? (
                            <textarea
                              autoFocus value={editing!.value}
                              onChange={(e) => setEditing({ r, c, value: e.target.value })}
                              onFocus={(e) => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.altKey && !e.shiftKey) { e.preventDefault(); commit('down'); }
                                else if (e.key === 'Enter') { e.preventDefault(); setEditing({ r, c, value: editing!.value + '\n' }); }
                                else if (e.key === 'Tab') { e.preventDefault(); commit('right'); }
                                else if (e.key === 'Escape') { e.preventDefault(); setEditing(null); setTimeout(() => grid.current?.focus(), 0); }
                                e.stopPropagation();
                              }}
                              onBlur={() => commit('none')}
                              className="absolute inset-0 w-full h-full resize-none outline-none bg-white text-black p-1 text-[13px] z-40 shadow-[0_0_0_2px_#1a73e8]"
                              style={{ minHeight: 24 }}
                            />
                          ) : cell?.v}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </>
      )}

      {book && (
        <div className="flex items-center gap-1 border-t pt-2 overflow-x-auto">
            {canEdit && <button onClick={addSheet} className="p-1.5 rounded hover:bg-muted" title="Add sheet"><Plus className="w-4 h-4" /></button>}
            {book?.sheets.map((s) => (
              <button key={s.id} onClick={() => switchSheet(s.id)} onDoubleClick={() => renameSheet(s)}
                className={`px-4 py-1.5 text-sm whitespace-nowrap rounded-t-lg border-b-2 ${s.id === sheetId ? 'bg-green-50 text-green-800 border-green-600 font-semibold' : 'text-muted-foreground border-transparent hover:bg-muted/50'}`}>
                {s.name}
              </button>
            ))}
          </div>
      )}
    </div>
  );
}
