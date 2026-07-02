import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '@/lib/api';
import { useRole } from '@/hooks/useAuth';
import { formatDate } from '@/lib/utils';
import {
  FileText, Upload, CheckCircle2, XCircle, AlertCircle, Loader2,
  Search, Eye, Trash2, ShieldCheck, Package
} from 'lucide-react';
import { cn } from '@/lib/utils';

const DOC_TYPES = [
  { type: 'AADHAAR',      label: 'Aadhaar',         required: true },
  { type: 'PAN',          label: 'PAN Card',         required: true },
  { type: 'MARKSHEET_10', label: '10th',             required: true },
  { type: 'MARKSHEET_12', label: '12th',             required: true },
  { type: 'DEGREE',       label: 'UG Degree',        required: false },
  { type: 'DEGREE_PG',    label: 'PG Degree',        required: false },
  { type: 'RESUME',       label: 'Resume',           required: true },
  { type: 'OTHER',        label: 'Other',            required: false },
] as const;

type DocType = typeof DOC_TYPES[number]['type'];

interface Document {
  id: string;
  type: DocType;
  name: string;
  fileUrl: string;
  isVerified: boolean;
  isOriginalSubmitted: boolean;
  submittedAt?: string;
  uploadedAt: string;
  employee?: { id: string; firstName: string; lastName: string; employeeCode: string };
}

interface EmployeeDoc {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode: string;
  docs: Document[];
}

interface OriginalsRow {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode: string;
  department?: { name: string };
  docs: Record<string, { id: string; isOriginalSubmitted: boolean; isVerified: boolean; fileUrl: string }>;
}

const BACKEND = (import.meta as any).env?.VITE_API_URL || 'http://localhost:5000';

export default function DocumentsPage() {
  const { can } = useRole();
  const isHR = can('HR');
  const [myDocs, setMyDocs] = useState<Document[]>([]);
  const [allDocs, setAllDocs] = useState<Document[]>([]);
  const [originals, setOriginals] = useState<OriginalsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [uploading, setUploading] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'my' | 'all' | 'originals'>('my');
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const fetchMyDocs = useCallback(async () => {
    const r = await api.get<{ data: Document[] }>('/api/documents/my');
    setMyDocs(r.data.data ?? []);
  }, []);

  const fetchAllDocs = useCallback(async () => {
    const r = await api.get<{ data: Document[] }>('/api/documents/all');
    setAllDocs(r.data.data ?? []);
  }, []);

  const fetchOriginals = useCallback(async () => {
    const r = await api.get<{ data: OriginalsRow[] }>('/api/documents/originals-summary');
    setOriginals(r.data.data ?? []);
  }, []);

  useEffect(() => {
    setLoading(true);
    const fetches = [fetchMyDocs()];
    if (isHR) fetches.push(fetchAllDocs(), fetchOriginals());
    Promise.all(fetches).finally(() => setLoading(false));
  }, [fetchMyDocs, fetchAllDocs, fetchOriginals, isHR]);

  const handleUpload = async (type: DocType, file: File) => {
    setUploading(type);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('type', type);
      fd.append('name', file.name);
      await api.post('/api/documents/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await fetchMyDocs();
      setSuccess(`${DOC_TYPES.find(d => d.type === type)?.label} uploaded successfully`);
      setTimeout(() => setSuccess(''), 4000);
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'Upload failed');
    } finally {
      setUploading(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this document?')) return;
    try {
      await api.delete(`/api/documents/${id}`);
      await fetchMyDocs();
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'Delete failed');
    }
  };

  const handleMarkOriginal = async (docId: string, value: boolean, refreshAll = false) => {
    try {
      await api.put(`/api/documents/${docId}/mark-original`, { isOriginalSubmitted: value });
      if (refreshAll) {
        await Promise.all([fetchAllDocs(), fetchOriginals()]);
      } else {
        await fetchOriginals();
      }
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'Update failed');
    }
  };

  const handleVerify = async (docId: string) => {
    try {
      await api.put(`/api/documents/${docId}/verify`, {});
      await Promise.all([fetchAllDocs(), fetchOriginals(), fetchMyDocs()]);
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'Verify failed');
    }
  };

  // Group HR view by employee
  const byEmployee: EmployeeDoc[] = [];
  const empMap: Record<string, EmployeeDoc> = {};
  allDocs.forEach(doc => {
    const emp = doc.employee;
    if (!emp) return;
    if (!empMap[emp.id]) {
      empMap[emp.id] = { ...emp, docs: [] };
      byEmployee.push(empMap[emp.id]);
    }
    empMap[emp.id].docs.push(doc);
  });

  const filteredEmployees = byEmployee.filter(e =>
    !search || `${e.firstName} ${e.lastName} ${e.employeeCode}`.toLowerCase().includes(search.toLowerCase())
  );

  const filteredOriginals = originals.filter(e =>
    !search || `${e.firstName} ${e.lastName} ${e.employeeCode}`.toLowerCase().includes(search.toLowerCase())
  );

  const myDocByType = (type: DocType) => myDocs.find(d => d.type === type);

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>;

  // Stats for originals tab
  const totalRequired = DOC_TYPES.filter(d => d.required).length;
  const originalsComplete = originals.filter(e =>
    DOC_TYPES.filter(d => d.required).every(d => e.docs[d.type]?.isOriginalSubmitted)
  ).length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Documents</h1>
          <p className="text-muted-foreground text-sm">Upload and manage identity &amp; education documents</p>
        </div>
        {isHR && (
          <div className="flex gap-2">
            {(['my', 'all', 'originals'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn('px-4 py-2 text-sm font-medium rounded-lg transition-colors', tab === t ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/70')}
              >
                {t === 'my' ? 'My Documents' : t === 'all' ? 'All Employees' : 'Originals Received'}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-3 text-red-500 p-3.5 bg-red-50 dark:bg-red-950/30 rounded-xl border border-red-200 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-3 text-green-600 p-3.5 bg-green-50 dark:bg-green-950/30 rounded-xl border border-green-200 text-sm">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> {success}
        </div>
      )}

      {/* Employee: My Documents */}
      {tab === 'my' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {DOC_TYPES.map(({ type, label, required }) => {
            const doc = myDocByType(type as DocType);
            const isUploading = uploading === type;
            return (
              <div key={type} className={cn(
                'bg-card border rounded-xl p-4 flex flex-col gap-3',
                doc ? 'border-green-200 dark:border-green-900' : required ? 'border-amber-200 dark:border-amber-900' : ''
              )}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className={cn(
                      'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0',
                      doc ? 'bg-green-50 text-green-600 dark:bg-green-950/30' : 'bg-muted text-muted-foreground'
                    )}>
                      <FileText className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium leading-tight">{label}</p>
                      {required && <span className="text-[10px] text-amber-600 font-medium">Required</span>}
                    </div>
                  </div>
                  {doc?.isVerified && (
                    <span className="flex items-center gap-1 text-[10px] font-medium text-green-600 bg-green-50 dark:bg-green-950/30 px-2 py-0.5 rounded-full border border-green-200">
                      <ShieldCheck className="w-3 h-3" /> Verified
                    </span>
                  )}
                </div>

                {doc ? (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground truncate">{doc.name}</p>
                      <p className="text-[10px] text-muted-foreground/60">Uploaded {formatDate(doc.uploadedAt)}</p>
                    </div>
                    <a href={doc.fileUrl.startsWith('http') ? doc.fileUrl : `${BACKEND}${doc.fileUrl}`} target="_blank" rel="noopener noreferrer"
                      className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                      <Eye className="w-3.5 h-3.5" />
                    </a>
                    {!doc.isVerified && (
                      <button onClick={() => handleDelete(doc.id)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Not uploaded yet</p>
                )}

                {doc?.isVerified ? (
                  <p className="flex items-center justify-center gap-1.5 py-2 text-[11px] text-green-700 bg-green-50 dark:bg-green-950/30 border border-green-200 rounded-lg">
                    <ShieldCheck className="w-3.5 h-3.5" /> Verified by HR — locked. Contact HR for corrections.
                  </p>
                ) : (
                  <div>
                    <input
                      ref={el => { fileRefs.current[type] = el; }}
                      type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" className="hidden"
                      onChange={e => {
                        const f = e.target.files?.[0];
                        if (f) handleUpload(type as DocType, f);
                        e.target.value = '';
                      }}
                    />
                    <button onClick={() => fileRefs.current[type]?.click()} disabled={isUploading}
                      className="w-full flex items-center justify-center gap-2 py-2 text-xs font-medium border border-dashed rounded-lg hover:bg-muted transition-colors disabled:opacity-50">
                      {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                      {doc ? 'Replace' : 'Upload'} {label}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* HR: All employees documents */}
      {tab === 'all' && isHR && (
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              className="w-full pl-9 pr-4 py-2.5 text-sm border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="Search employees…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {filteredEmployees.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>No employee documents found</p>
            </div>
          ) : (
            filteredEmployees.map(emp => (
              <div key={emp.id} className="bg-card border rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b bg-muted/30 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-sm">{emp.firstName} {emp.lastName}</p>
                    <p className="text-xs text-muted-foreground">{emp.employeeCode}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{emp.docs.length} doc{emp.docs.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="divide-y">
                  {DOC_TYPES.map(({ type, label }) => {
                    const doc = emp.docs.find(d => d.type === type);
                    return (
                      <div key={type} className="flex items-center gap-3 px-5 py-3">
                        <div className="w-36 flex-shrink-0">
                          <p className="text-xs font-medium">{label}</p>
                        </div>
                        {doc ? (
                          <>
                            <div className="flex-1 flex items-center gap-2 min-w-0">
                              <a href={doc.fileUrl.startsWith('http') ? doc.fileUrl : `${BACKEND}${doc.fileUrl}`} target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline truncate">
                                <Eye className="w-3 h-3 flex-shrink-0" />
                                <span className="truncate">{doc.name}</span>
                              </a>
                              {doc.isVerified && (
                                <span className="flex-shrink-0 flex items-center gap-1 text-[10px] font-medium text-green-600 bg-green-50 dark:bg-green-950/30 px-1.5 py-0.5 rounded-full">
                                  <ShieldCheck className="w-2.5 h-2.5" /> Verified
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className="text-[10px] text-muted-foreground">Original</span>
                              <button
                                onClick={() => handleMarkOriginal(doc.id, !doc.isOriginalSubmitted, true)}
                                className={cn(
                                  'flex items-center gap-1 text-[10px] font-medium px-2.5 py-1 rounded-full border transition-colors',
                                  doc.isOriginalSubmitted
                                    ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:border-green-800'
                                    : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800'
                                )}
                              >
                                {doc.isOriginalSubmitted
                                  ? <><CheckCircle2 className="w-2.5 h-2.5" /> Received</>
                                  : <><XCircle className="w-2.5 h-2.5" /> Pending</>
                                }
                              </button>
                              {!doc.isVerified && (
                                <button onClick={() => handleVerify(doc.id)}
                                  className="text-[10px] font-medium px-2 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors">
                                  Verify
                                </button>
                              )}
                            </div>
                          </>
                        ) : (
                          <div className="flex-1">
                            <span className="text-[10px] text-muted-foreground/60 italic">Not uploaded</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* HR: Originals received summary matrix */}
      {tab === 'originals' && isHR && (
        <div className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-card border rounded-xl p-4 text-center">
              <p className="text-2xl font-bold">{originals.length}</p>
              <p className="text-xs text-muted-foreground mt-1">Total Employees</p>
            </div>
            <div className="bg-card border border-green-200 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-green-600">{originalsComplete}</p>
              <p className="text-xs text-muted-foreground mt-1">All Required Docs Received</p>
            </div>
            <div className="bg-card border border-amber-200 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-amber-600">{originals.length - originalsComplete}</p>
              <p className="text-xs text-muted-foreground mt-1">Pending Documents</p>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              className="w-full pl-9 pr-4 py-2.5 text-sm border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="Search employees…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <div className="bg-card border rounded-xl overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-4 py-3 font-semibold text-sm min-w-[180px]">Employee</th>
                  {DOC_TYPES.map(d => (
                    <th key={d.type} className="text-center px-3 py-3 font-medium min-w-[80px]">
                      <span className={d.required ? 'text-foreground' : 'text-muted-foreground'}>{d.label}</span>
                      {d.required && <span className="block text-[9px] text-amber-500">required</span>}
                    </th>
                  ))}
                  <th className="text-center px-3 py-3 font-medium min-w-[70px]">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredOriginals.length === 0 ? (
                  <tr>
                    <td colSpan={DOC_TYPES.length + 2} className="text-center py-12 text-muted-foreground">
                      No employees found
                    </td>
                  </tr>
                ) : filteredOriginals.map(emp => {
                  const allRequiredDone = DOC_TYPES.filter(d => d.required).every(d => emp.docs[d.type]?.isOriginalSubmitted);
                  return (
                    <tr key={emp.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium">{emp.firstName} {emp.lastName}</p>
                        <p className="text-muted-foreground">{emp.employeeCode}{emp.department ? ` · ${emp.department.name}` : ''}</p>
                      </td>
                      {DOC_TYPES.map(d => {
                        const doc = emp.docs[d.type];
                        if (!doc) {
                          return (
                            <td key={d.type} className="text-center px-3 py-3">
                              <span className="text-muted-foreground/40">—</span>
                            </td>
                          );
                        }
                        return (
                          <td key={d.type} className="text-center px-3 py-3">
                            <button
                              onClick={() => handleMarkOriginal(doc.id, !doc.isOriginalSubmitted)}
                              title={doc.isOriginalSubmitted ? 'Original received — click to undo' : 'Click to mark original received'}
                              className={cn(
                                'inline-flex items-center justify-center w-7 h-7 rounded-full border transition-colors',
                                doc.isOriginalSubmitted
                                  ? 'bg-green-100 text-green-600 border-green-300 hover:bg-green-200 dark:bg-green-950/40 dark:border-green-700'
                                  : 'bg-amber-50 text-amber-400 border-amber-200 hover:bg-amber-100 dark:bg-amber-950/30 dark:border-amber-700'
                              )}
                            >
                              {doc.isOriginalSubmitted
                                ? <CheckCircle2 className="w-3.5 h-3.5" />
                                : <XCircle className="w-3.5 h-3.5" />
                              }
                            </button>
                          </td>
                        );
                      })}
                      <td className="text-center px-3 py-3">
                        <span className={cn(
                          'inline-block px-2 py-0.5 rounded-full text-[10px] font-medium border',
                          allRequiredDone
                            ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:border-green-800'
                            : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800'
                        )}>
                          {allRequiredDone ? 'Complete' : 'Pending'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-muted-foreground">
            — = no digital copy uploaded &nbsp;|&nbsp; ✓ = original physical document received &nbsp;|&nbsp; ✗ = not yet received
          </p>
        </div>
      )}
    </div>
  );
}
