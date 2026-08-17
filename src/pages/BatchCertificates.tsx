import { useEffect, useRef, useState } from 'react';
import api, { BASE_URL } from '@/lib/api';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import {
  Award, Loader2, RefreshCw, Download, Pencil, Trash2, X, Check,
  ImagePlus, Sparkles, ChevronDown, AlertTriangle, Move,
} from 'lucide-react';
import { PhotoCropper, CourseCompletionTemplate } from './CertificateGenerator';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BatchOption { id: string; code: string; status: string; startDate: string; endDate: string | null }

interface CertRow {
  id: string;
  studentId: string;
  batchId: string;
  certNo: string;
  studentName: string;
  studentCode: string;
  course: string;
  batchLabel: string;
  issuedOn: string;
  photoUrl: string | null;
  generatedBy?: { firstName: string; lastName: string; employeeCode: string } | null;
}

// Resolves a server-relative upload path (or a data: URL, or already-absolute
// URL) into something an <img> can load — same convention as Production.tsx /
// MyTraining.tsx / PublicPortfolio.tsx.
const resolveUrl = (path?: string | null) => {
  if (!path) return '';
  if (/^https?:\/\//i.test(path) || path.startsWith('data:')) return path;
  return `${BASE_URL}${path}`;
};

const dmy = (iso: string) => new Date(iso).toLocaleDateString('en-GB');

// A CertRow's fields, reshaped into the { key: string } record the shared
// CourseCompletionTemplate (from CertificateGenerator.tsx) expects.
const toTemplateForm = (row: CertRow, photoOverride?: string): Record<string, string> => ({
  studentName: row.studentName,
  studentId: row.studentCode,
  course: row.course,
  batch: row.batchLabel,
  issueDate: row.issuedOn ? new Date(row.issuedOn).toISOString().slice(0, 10) : '',
  photoUrl: photoOverride !== undefined ? photoOverride : resolveUrl(row.photoUrl),
});

function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, b64] = dataUrl.split(',');
  const mime = /data:(.*?);/.exec(meta)?.[1] || 'image/jpeg';
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

// ─── Single-certificate thumbnail (real template, scaled down via CSS) ──────

function CertThumb({ row }: { row: CertRow }) {
  const SCALE = 0.235;
  return (
    <div style={{ width: 794 * SCALE, height: 1123 * SCALE, overflow: 'hidden', position: 'relative' }} className="rounded-lg border bg-white shrink-0">
      <div style={{ width: 794, height: 1123, transform: `scale(${SCALE})`, transformOrigin: 'top left' }}>
        <CourseCompletionTemplate f={toTemplateForm(row)} />
      </div>
    </div>
  );
}

// ─── Editor modal ─────────────────────────────────────────────────────────────

function EditorModal({
  row, canEdit, onClose, onSaved, onDeleted,
}: {
  row: CertRow;
  canEdit: boolean;
  onClose: () => void;
  onSaved: (updated: CertRow) => void;
  onDeleted: (id: string) => void;
}) {
  const [form, setForm] = useState({
    studentName: row.studentName,
    studentCode: row.studentCode,
    course: row.course,
    batchLabel: row.batchLabel,
    issuedOn: row.issuedOn ? new Date(row.issuedOn).toISOString().slice(0, 10) : '',
  });
  const [photoUrl, setPhotoUrl] = useState(resolveUrl(row.photoUrl));
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const pickPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setCropSrc(String(ev.target?.result || ''));
    reader.readAsDataURL(file);
  };

  const applyCroppedPhoto = async (dataUrl: string) => {
    setCropSrc(null);
    setPhotoUrl(dataUrl); // optimistic
    setUploadingPhoto(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('photo', dataUrlToBlob(dataUrl), 'certificate-photo.jpg');
      const { data } = await api.post(`/api/batch-certificates/${row.id}/photo`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setPhotoUrl(resolveUrl(data.data.photoUrl));
      onSaved(data.data);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Photo upload failed');
    } finally { setUploadingPhoto(false); }
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const { data } = await api.put(`/api/batch-certificates/${row.id}`, form);
      onSaved(data.data);
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to save');
    } finally { setSaving(false); }
  };

  const remove = async () => {
    setSaving(true);
    try {
      await api.delete(`/api/batch-certificates/${row.id}`);
      onDeleted(row.id);
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to delete');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      {cropSrc && <PhotoCropper src={cropSrc} onApply={applyCroppedPhoto} onCancel={() => setCropSrc(null)} />}
      <div className="bg-card border rounded-2xl shadow-xl w-full max-w-4xl max-h-[92vh] overflow-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-card z-10">
          <div>
            <p className="font-semibold text-sm">Edit certificate</p>
            <p className="text-xs text-muted-foreground font-mono">{row.certNo}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent"><X className="w-4 h-4" /></button>
        </div>

        <div className="grid md:grid-cols-[300px_1fr] gap-6 p-5">
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Student Name</label>
              <input disabled={!canEdit} value={form.studentName} onChange={set('studentName')} className="w-full px-3 py-2 border rounded-lg text-sm bg-background disabled:opacity-60" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Student ID</label>
              <input disabled={!canEdit} value={form.studentCode} onChange={set('studentCode')} className="w-full px-3 py-2 border rounded-lg text-sm bg-background disabled:opacity-60" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Course</label>
              <input disabled={!canEdit} value={form.course} onChange={set('course')} className="w-full px-3 py-2 border rounded-lg text-sm bg-background disabled:opacity-60" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Batch Label</label>
              <input disabled={!canEdit} value={form.batchLabel} onChange={set('batchLabel')} className="w-full px-3 py-2 border rounded-lg text-sm bg-background disabled:opacity-60" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Issued On</label>
              <input disabled={!canEdit} type="date" value={form.issuedOn} onChange={set('issuedOn')} className="w-full px-3 py-2 border rounded-lg text-sm bg-background disabled:opacity-60" />
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Photo</label>
              <div className="flex gap-2">
                {photoUrl && (
                  <button
                    type="button"
                    onClick={() => setCropSrc(photoUrl)}
                    disabled={!canEdit || uploadingPhoto}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 border rounded-lg text-xs hover:bg-accent disabled:opacity-60"
                  >
                    <Move className="w-3.5 h-3.5" /> Reposition / zoom
                  </button>
                )}
                <label className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 border rounded-lg text-xs cursor-pointer hover:bg-accent ${!canEdit ? 'opacity-60 pointer-events-none' : ''}`}>
                  {uploadingPhoto ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
                  Replace photo
                  <input type="file" accept="image/*" className="hidden" onChange={pickPhoto} disabled={!canEdit} />
                </label>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">"Reposition / zoom" re-crops the existing photo. Only this student's certificate is affected — their profile photo is untouched.</p>
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}

            <div className="flex gap-2 pt-2">
              <button onClick={save} disabled={saving || !canEdit} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Save
              </button>
            </div>

            {canEdit && (
              confirmDelete ? (
                <div className="border border-red-200 bg-red-50 rounded-lg p-2.5 space-y-2">
                  <p className="text-xs text-red-700 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Delete this certificate?</p>
                  <div className="flex gap-2">
                    <button onClick={() => setConfirmDelete(false)} className="flex-1 px-2 py-1.5 text-xs border rounded-lg hover:bg-white">Cancel</button>
                    <button onClick={remove} disabled={saving} className="flex-1 px-2 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">Delete</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setConfirmDelete(true)} className="w-full flex items-center justify-center gap-1.5 px-3 py-2 border border-red-200 text-red-600 rounded-lg text-xs hover:bg-red-50">
                  <Trash2 className="w-3.5 h-3.5" /> Delete certificate
                </button>
              )
            )}
          </div>

          {/* Live preview */}
          <div className="overflow-auto flex justify-center bg-muted/30 rounded-xl p-4">
            <div style={{ width: 794 * 0.62, height: 1123 * 0.62, overflow: 'hidden' }}>
              <div style={{ width: 794, height: 1123, transform: 'scale(0.62)', transformOrigin: 'top left' }} className="shadow-lg">
                <CourseCompletionTemplate f={{ ...toTemplateForm(row, photoUrl), studentName: form.studentName, studentId: form.studentCode, course: form.course, batch: form.batchLabel, issueDate: form.issuedOn }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BatchCertificatesPage() {
  const { hasModule, loaded } = useModuleAccess();
  const canView = hasModule('CERTIFICATES', 'VIEW');
  const canEdit = hasModule('CERTIFICATES', 'EDIT');

  const [batches, setBatches] = useState<BatchOption[]>([]);
  const [batchId, setBatchId] = useState('');
  const [certs, setCerts] = useState<CertRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genMsg, setGenMsg] = useState('');
  const [editing, setEditing] = useState<CertRow | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/api/batch-certificates/batches').then(({ data }) => {
      setBatches(data.data || []);
      if (data.data?.length && !batchId) setBatchId(data.data[0].id);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadCerts = async (id: string) => {
    if (!id) { setCerts([]); return; }
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/api/batch-certificates', { params: { batchId: id } });
      setCerts(data.data || []);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to load certificates');
    } finally { setLoading(false); }
  };

  useEffect(() => { loadCerts(batchId); /* eslint-disable-next-line */ }, [batchId]);

  const generate = async () => {
    if (!batchId) return;
    setGenerating(true);
    setGenMsg('');
    setError('');
    try {
      const { data } = await api.post('/api/batch-certificates/generate', { batchId });
      setGenMsg(data.message || '');
      await loadCerts(batchId);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to generate certificates');
    } finally { setGenerating(false); }
  };

  // ── PDF download: render each cert off-screen full-size, capture, save ──
  const captureRef = useRef<HTMLDivElement>(null);
  const [captureRow, setCaptureRow] = useState<CertRow | null>(null);
  const resolveCaptureRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!captureRow) return;
    const t = setTimeout(async () => {
      try {
        const node = captureRef.current;
        if (node) {
          const canvas = await html2canvas(node, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
          const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [794, 1123] });
          pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 794, 1123);
          const safeName = captureRow.studentName.replace(/[^a-z0-9]+/gi, '_');
          const safeCert = captureRow.certNo.replace(/[^a-z0-9]+/gi, '_');
          pdf.save(`${safeName}_${safeCert}.pdf`);
        }
      } catch (e) {
        console.error('Certificate PDF export failed', e);
      } finally {
        setCaptureRow(null);
        resolveCaptureRef.current?.();
        resolveCaptureRef.current = null;
      }
    }, 300); // let the photo <img> finish loading before capture
    return () => clearTimeout(t);
  }, [captureRow]);

  const downloadOne = (row: CertRow) => new Promise<void>((resolve) => {
    resolveCaptureRef.current = resolve;
    setCaptureRow(row);
  });

  const [bulkDownloading, setBulkDownloading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);

  const downloadAll = async () => {
    if (!certs.length) return;
    setBulkDownloading(true);
    setBulkProgress(0);
    for (let i = 0; i < certs.length; i++) {
      await downloadOne(certs[i]);
      setBulkProgress(i + 1);
      await new Promise((r) => setTimeout(r, 350)); // avoid the browser's multi-download popup blocker
    }
    setBulkDownloading(false);
  };

  if (loaded && !canView) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <Award className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-40" />
          <p className="font-medium">No access to Batch Certificates</p>
          <p className="text-sm text-muted-foreground">Ask a Super Admin to grant you the "Certificate Generator" module in Master Control.</p>
        </div>
      </div>
    );
  }

  const selectedBatch = batches.find((b) => b.id === batchId);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Award className="w-6 h-6" /> Batch Certificates</h1>
          <p className="text-muted-foreground text-sm">Bulk-generate Course Completion certificates for a whole batch, then review &amp; edit each one individually.</p>
        </div>
      </div>

      <div className="bg-card border rounded-2xl p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Batch</label>
          <div className="relative">
            <select value={batchId} onChange={(e) => setBatchId(e.target.value)} className="appearance-none pl-3 pr-8 py-2 border rounded-lg text-sm bg-background min-w-[220px]">
              {batches.length === 0 && <option value="">No batches found</option>}
              {batches.map((b) => (
                <option key={b.id} value={b.id}>{b.code} {b.status ? `· ${b.status}` : ''}</option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-3 text-muted-foreground pointer-events-none" />
          </div>
        </div>

        <button
          onClick={generate}
          disabled={generating || !batchId || !canEdit}
          title={canEdit ? '' : 'You have view-only access'}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Generate for Batch
        </button>

        <button onClick={() => loadCerts(batchId)} className="flex items-center gap-2 px-3 py-2 border rounded-lg text-sm hover:bg-accent">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>

        {certs.length > 0 && (
          <button
            onClick={downloadAll}
            disabled={bulkDownloading}
            className="flex items-center gap-2 px-3 py-2 border rounded-lg text-sm hover:bg-accent disabled:opacity-50 ml-auto"
          >
            {bulkDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {bulkDownloading ? `Downloading ${bulkProgress}/${certs.length}…` : `Download All (${certs.length})`}
          </button>
        )}
      </div>

      {genMsg && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{genMsg}</p>}
      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading certificates…
        </div>
      ) : certs.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Award className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No certificates yet for {selectedBatch?.code || 'this batch'}</p>
          <p className="text-sm">Click "Generate for Batch" to pull in every enrolled student automatically.</p>
        </div>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))' }}>
          {certs.map((row) => (
            <div key={row.id} className="bg-card border rounded-xl p-3 space-y-2 hover:shadow-md transition">
              <div className="flex justify-center">
                <CertThumb row={row} />
              </div>
              <div>
                <p className="font-medium text-sm truncate" title={row.studentName}>{row.studentName}</p>
                <p className="text-[11px] text-muted-foreground font-mono truncate">{row.certNo}</p>
                <p className="text-[11px] text-muted-foreground truncate">{row.course} · {dmy(row.issuedOn)}</p>
              </div>
              <div className="flex gap-1.5">
                <button onClick={() => setEditing(row)} className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 border rounded-lg text-xs hover:bg-accent">
                  <Pencil className="w-3.5 h-3.5" /> {canEdit ? 'Edit' : 'View'}
                </button>
                <button onClick={() => downloadOne(row)} disabled={bulkDownloading} className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 border rounded-lg text-xs hover:bg-accent disabled:opacity-50">
                  <Download className="w-3.5 h-3.5" /> PDF
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <EditorModal
          row={editing}
          canEdit={canEdit}
          onClose={() => setEditing(null)}
          onSaved={(updated) => setCerts((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)))}
          onDeleted={(id) => setCerts((prev) => prev.filter((c) => c.id !== id))}
        />
      )}

      {/* Off-screen full-size render used only for PDF capture */}
      {captureRow && (
        <div style={{ position: 'fixed', left: -99999, top: 0, width: 794, height: 1123 }}>
          <div ref={captureRef} style={{ width: 794, height: 1123 }}>
            <CourseCompletionTemplate f={toTemplateForm(captureRow)} />
          </div>
        </div>
      )}
    </div>
  );
}
