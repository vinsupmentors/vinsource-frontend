import { useState, useRef, useEffect } from 'react';
import { Upload, Download, X, CheckCircle, AlertCircle, Loader2, Users } from 'lucide-react';
import api from '@/lib/api';

interface BulkRow {
  firstName: string;
  lastName?: string;
  email: string;
  phone?: string;
  joiningDate: string;
  departmentName: string;
  designationName: string;
}

interface ResultRow {
  email: string;
  status: 'created' | 'skipped';
  reason?: string;
}

interface Dept  { id: string; name: string; }
interface Desig { id: string; name: string; }

const CSV_HEADERS = ['firstName','lastName','email','phone','joiningDate','departmentName','designationName'];

function parseCSV(text: string): Record<string, string>[] {
  const [headerLine, ...rows] = text.trim().split('\n');
  const headers = headerLine.split(',').map((h) => h.trim().replace(/\r/g, ''));
  return rows
    .filter((r) => r.trim())
    .map((row) => {
      const vals = row.split(',').map((v) => v.trim().replace(/\r/g, ''));
      return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? '']));
    });
}

export default function BulkOnboarding({ onDone }: { onDone: () => void }) {
  const [depts,  setDepts]  = useState<Dept[]>([]);
  const [desigs, setDesigs] = useState<Desig[]>([]);
  const [rows,   setRows]   = useState<BulkRow[]>([]);
  const [result, setResult] = useState<{ created: number; skipped: number; results: ResultRow[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.get('/api/departments').then((r) => setDepts(r.data.data || [])).catch(() => {});
    api.get('/api/designations').then((r) => setDesigs(r.data.data || [])).catch(() => {});
  }, []);

  // Download template CSV with name-based columns
  const downloadTemplate = () => {
    const sampleRows = [
      ['Priya','Sharma','priya.sharma@vinsupskillacademy.com','9876543210','2024-07-01','Sales','Skill Advisor'],
      ['Arjun','Kumar','arjun.kumar@vinsupskillacademy.com','9876543211','2024-07-01','Production','Skill Mentor - Data Science'],
    ];
    const deptRef  = depts.map((d)  => `# ${d.name}`).join('\n');
    const desigRef = desigs.map((d) => `# ${d.name}`).join('\n');
    const header   = `# Use department and designation NAMES (not IDs).\n# Existing departments:\n${deptRef}\n\n# Existing designations:\n${desigRef}\n\n`;
    const csv = CSV_HEADERS.join(',') + '\n' + sampleRows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([header + csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'bulk_onboarding_template.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      // Strip comment lines
      const clean = text.split('\n').filter((l) => !l.startsWith('#')).join('\n');
      const parsed = parseCSV(clean) as unknown as BulkRow[];
      setRows(parsed.filter((r) => r.firstName && r.email));
      setResult(null);
      setError('');
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleSubmit = async () => {
    if (rows.length === 0) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/api/employees/bulk', { employees: rows });
      setResult(data.data);
      setRows([]);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Bulk upload failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={downloadTemplate}
          className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-accent transition"
        >
          <Download className="w-4 h-4" /> Download CSV Template
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition"
        >
          <Upload className="w-4 h-4" /> Upload CSV
        </button>
        <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
      </div>

      {/* Preview table */}
      {rows.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium flex items-center gap-2">
              <Users className="w-4 h-4" /> {rows.length} employee(s) ready to onboard
            </p>
            <button onClick={() => setRows([])} className="text-muted-foreground hover:text-foreground text-sm flex items-center gap-1">
              <X className="w-3.5 h-3.5" /> Clear
            </button>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead className="bg-muted">
                <tr>
                  {['Name','Email','Phone','Joining Date','Department','Designation'].map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r, i) => (
                  <tr key={i} className="hover:bg-muted/40">
                    <td className="px-3 py-2">{r.firstName} {r.lastName}</td>
                    <td className="px-3 py-2">{r.email}</td>
                    <td className="px-3 py-2">{r.phone || '—'}</td>
                    <td className="px-3 py-2">{r.joiningDate}</td>
                    <td className="px-3 py-2">{r.departmentName || <span className="text-red-500">—</span>}</td>
                    <td className="px-3 py-2">{r.designationName || <span className="text-red-500">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {error && (
            <p className="text-sm text-red-600 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" /> {error}
            </p>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => { setRows([]); setError(''); }}
              className="px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-accent transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="flex items-center gap-2 px-6 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition disabled:opacity-60"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'Creating Accounts & Sending Emails…' : `Onboard ${rows.length} Employee(s)`}
            </button>
          </div>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-3">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-green-600 font-medium text-sm">
              <CheckCircle className="w-5 h-5" /> {result.created} created & emails sent
            </div>
            {result.skipped > 0 && (
              <div className="flex items-center gap-2 text-yellow-600 font-medium text-sm">
                <AlertCircle className="w-4 h-4" /> {result.skipped} skipped
              </div>
            )}
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead className="bg-muted">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Email</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {result.results.map((r, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2">{r.email}</td>
                    <td className="px-3 py-2">
                      {r.status === 'created'
                        ? <span className="text-green-600 font-medium flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> Created</span>
                        : <span className="text-yellow-600 font-medium flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" /> Skipped</span>
                      }
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{r.reason || 'Welcome email sent'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button onClick={onDone} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition">
            Done
          </button>
        </div>
      )}
    </div>
  );
}
