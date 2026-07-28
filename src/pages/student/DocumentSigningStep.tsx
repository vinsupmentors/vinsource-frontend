import { useState, useEffect, useRef, useCallback } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import api, { BASE_URL } from '@/lib/api';
import { Loader2, FileText, CheckCircle2, Camera, RotateCcw, PenLine, AlertTriangle, ExternalLink } from 'lucide-react';

interface FeeDeclarationRow {
  date?: string;
  totalFee?: string;
  feesPaid?: string;
  amountDue?: string;
}

interface OnboardingItem {
  kind: 'template' | 'fee_declaration';
  id: string;
  title: string;
  signed: boolean;
  signedAt: string | null;
  fileUrl?: string;
  feeDeclaration?: {
    guardianName: string | null;
    courseName: string | null;
    dueDate: string | null;
    rows: FeeDeclarationRow[];
  };
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, base64] = dataUrl.split(',');
  const mime = meta.match(/:(.*?);/)?.[1] || 'image/png';
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export default function DocumentSigningStep({ onAllSigned }: { onAllSigned: () => void }) {
  const [docs, setDocs] = useState<OnboardingItem[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    api.get('/api/student-portal/onboarding-documents')
      .then((res) => {
        const data: OnboardingItem[] = res.data.data;
        setDocs(data);
        const firstPending = data.findIndex((d) => !d.signed);
        setActiveIndex(firstPending === -1 ? 0 : firstPending);
        if (data.length > 0 && firstPending === -1) onAllSigned();
      })
      .catch(() => setLoadError('Failed to load onboarding documents. Please refresh and try again.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loadError) {
    return <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">{loadError}</div>;
  }
  if (!docs) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>;
  }
  if (docs.length === 0) {
    // Nothing required yet — nothing blocks this student, move on.
    onAllSigned();
    return null;
  }

  const pending = docs.filter((d) => !d.signed);
  const current = docs[activeIndex];

  if (!current || pending.length === 0) {
    return null;
  }

  const handleSigned = () => {
    const remaining = docs.map((d, i) => (i === activeIndex ? { ...d, signed: true } : d));
    setDocs(remaining);
    const nextPending = remaining.findIndex((d) => !d.signed);
    if (nextPending === -1) {
      onAllSigned();
    } else {
      setActiveIndex(nextPending);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Please read and sign the following {pending.length === 1 ? 'document' : `${pending.length} documents`} to finish setting up your account.
        {docs.length > 1 && <span className="ml-1">({docs.filter((d) => d.signed).length}/{docs.length} completed)</span>}
      </p>
      <SingleDocumentSigner key={current.id} doc={current} onSigned={handleSigned} />
    </div>
  );
}

function formatDate(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Read-only rendering of an admin-filled fee declaration — dynamic per
 * student, so (unlike the shared PDF templates) there's no source file to
 * display; this is styled to match the actual paper form instead. */
function FeeDeclarationContent({ fd }: { fd: NonNullable<OnboardingItem['feeDeclaration']> }) {
  return (
    <div className="bg-white rounded-lg shadow-sm p-6 max-w-xl mx-auto text-sm leading-relaxed space-y-4">
      <h2 className="font-bold text-base text-center">Student Declaration Form for Pending Fee Payment</h2>
      <p>
        To<br />The Management,<br />Vinsup Skill Academy,<br />Ganapathy,<br />Coimbatore – 641006.
      </p>
      <p><strong>Subject:</strong> Declaration Regarding Pending Fee Payment</p>
      <p>
        I, S/o or D/o <strong>{fd.guardianName || '—'}</strong>, enrolled in the course{' '}
        <strong>{fd.courseName || '—'}</strong>, hereby declare that I have pending fee dues with Vinsup Skill
        Academy and I take full responsibility to clear the dues on or before{' '}
        <strong>{formatDate(fd.dueDate)}</strong>.
      </p>
      <p>
        I understand that non-payment of the due amount within the stipulated time may lead to consequences
        including restriction from attending classes, withholding of certificates, or termination of enrollment.
      </p>
      <table className="w-full border text-xs">
        <thead>
          <tr className="bg-muted/50">
            <th className="border px-2 py-1">Date</th>
            <th className="border px-2 py-1">Total Course Fees</th>
            <th className="border px-2 py-1">Fees Paid</th>
            <th className="border px-2 py-1">Amount Due</th>
          </tr>
        </thead>
        <tbody>
          {(fd.rows || []).map((r, i) => (
            <tr key={i}>
              <td className="border px-2 py-1">{r.date || '—'}</td>
              <td className="border px-2 py-1">{r.totalFee || '—'}</td>
              <td className="border px-2 py-1">{r.feesPaid || '—'}</td>
              <td className="border px-2 py-1">{r.amountDue || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const REQUIRED_VIEW_SECONDS = 15;

function SingleDocumentSigner({ doc, onSigned }: { doc: OnboardingItem; onSigned: () => void }) {
  // Full public URL to the document — served as a plain static file with no
  // auth required, so the browser's own native PDF viewer can just load it
  // directly inside an <iframe>, exactly like tapping a PDF link. Previously
  // this fetched raw bytes via axios and rendered pages ourselves with
  // react-pdf/pdfjs (a web-worker, manual canvas rendering, byte-array
  // parsing) — every one of those steps was a possible point of failure and
  // produced the same generic "could not load" error no matter the real
  // cause. Letting the browser handle a plain URL removes that entire class
  // of bug: there's no custom fetch, no worker, nothing to parse ourselves.
  const fileUrl = doc.kind === 'template' && doc.fileUrl ? `${BASE_URL}${doc.fileUrl}` : null;

  // We can no longer detect "scrolled to the end" inside a native PDF viewer
  // (it's a separate sandboxed viewer, not something our JS can inspect).
  // Instead, require the document to stay open for a minimum time and an
  // explicit confirmation checkbox before signing unlocks — the same pattern
  // most e-signature products use.
  const [secondsLeft, setSecondsLeft] = useState(REQUIRED_VIEW_SECONDS);
  const [confirmedRead, setConfirmedRead] = useState(false);
  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft]);

  const canSign = secondsLeft <= 0 && confirmedRead;

  // Camera + signature only become relevant once reading is confirmed.
  const [signatureEmpty, setSignatureEmpty] = useState(true);
  const [photoDataUrl, setPhotoDataUrl] = useState('');
  const [cameraError, setCameraError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sigRef = useRef<InstanceType<typeof SignatureCanvas>>(null);

  const startCamera = useCallback(async () => {
    setCameraError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch {
      setCameraError('Camera access is required to sign this document — please allow camera access and try again.');
    }
  }, []);

  useEffect(() => {
    if (!canSign || photoDataUrl) return;
    startCamera();
    return () => { streamRef.current?.getTracks().forEach((t) => t.stop()); };
  }, [canSign, photoDataUrl, startCamera]);

  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx?.drawImage(video, 0, 0);
    setPhotoDataUrl(canvas.toDataURL('image/jpeg', 0.9));
    streamRef.current?.getTracks().forEach((t) => t.stop());
  };

  const retakePhoto = () => setPhotoDataUrl('');

  const submit = async () => {
    if (signatureEmpty || sigRef.current?.isEmpty()) { setSubmitError('Please draw your signature'); return; }
    if (!photoDataUrl) { setSubmitError('Please take a photo before submitting'); return; }
    setSubmitError('');
    setSubmitting(true);
    try {
      const signatureCanvas = sigRef.current?.getTrimmedCanvas() ?? sigRef.current?.getCanvas();
      const signatureBlob: Blob = await new Promise((resolve, reject) => {
        signatureCanvas?.toBlob((b) => (b ? resolve(b) : reject(new Error('Failed to capture signature'))), 'image/png');
      });
      const photoBlob = dataUrlToBlob(photoDataUrl);

      const fd = new FormData();
      fd.append('signature', signatureBlob, 'signature.png');
      fd.append('photo', photoBlob, 'photo.jpg');
      const endpoint = doc.kind === 'fee_declaration'
        ? `/api/student-portal/fee-declarations/${doc.id}/sign`
        : `/api/student-portal/onboarding-documents/${doc.id}/sign`;
      await api.post(endpoint, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onSigned();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setSubmitError(e.response?.data?.message || 'Failed to submit signature. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b bg-muted/30 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-blue-600" />
          <h3 className="font-semibold text-sm">{doc.title}</h3>
        </div>
        {fileUrl && (
          <a
            href={fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:underline flex items-center gap-1 shrink-0"
          >
            Open in new tab <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>

      <div className="bg-muted/20 p-2">
        {doc.kind === 'fee_declaration' && doc.feeDeclaration ? (
          <FeeDeclarationContent fd={doc.feeDeclaration} />
        ) : fileUrl ? (
          <iframe
            src={fileUrl}
            title={doc.title}
            className="w-full rounded-lg border bg-white"
            style={{ height: '60vh' }}
          />
        ) : (
          <p className="text-sm text-red-600 p-4">This document is not available. Please contact support.</p>
        )}
      </div>

      {!canSign ? (
        <div className="px-4 py-3 border-t bg-amber-50 space-y-2">
          <div className="flex items-center gap-2 text-xs text-amber-700">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            {secondsLeft > 0
              ? `Please review the document. You can confirm in ${secondsLeft}s.`
              : 'Please confirm you have read the document below to unlock signing.'}
          </div>
          <label className={`flex items-start gap-2 text-sm ${secondsLeft > 0 ? 'opacity-50' : ''}`}>
            <input
              type="checkbox"
              className="mt-0.5"
              checked={confirmedRead}
              disabled={secondsLeft > 0}
              onChange={(e) => setConfirmedRead(e.target.checked)}
            />
            <span>I have read and understood this document.</span>
          </label>
        </div>
      ) : (
        <div className="p-4 border-t space-y-4">
          {submitError && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600">{submitError}</div>}

          <div>
            <label className="text-sm font-medium mb-1.5 flex items-center gap-1.5"><PenLine className="w-3.5 h-3.5" /> Draw your signature</label>
            <div className="border rounded-lg bg-white overflow-hidden" style={{ touchAction: 'none' }}>
              <SignatureCanvas
                ref={sigRef}
                penColor="#111827"
                canvasProps={{ className: 'w-full h-32' }}
                onEnd={() => setSignatureEmpty(sigRef.current?.isEmpty() ?? true)}
              />
            </div>
            <button
              type="button"
              onClick={() => { sigRef.current?.clear(); setSignatureEmpty(true); }}
              className="mt-1.5 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" /> Clear
            </button>
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 flex items-center gap-1.5"><Camera className="w-3.5 h-3.5" /> Take a photo</label>
            <div className="w-full max-w-xs rounded-lg overflow-hidden border bg-black/5 aspect-[4/3] flex items-center justify-center">
              {photoDataUrl ? (
                <img src={photoDataUrl} alt="Captured" className="w-full h-full object-cover" />
              ) : cameraError ? (
                <p className="text-xs text-red-600 p-4 text-center">{cameraError}</p>
              ) : (
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              )}
            </div>
            <canvas ref={canvasRef} className="hidden" />
            <div className="mt-1.5">
              {photoDataUrl ? (
                <button type="button" onClick={retakePhoto} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                  <RotateCcw className="w-3 h-3" /> Retake
                </button>
              ) : (
                <button
                  type="button"
                  onClick={capturePhoto}
                  disabled={!!cameraError}
                  className="text-xs px-3 py-1.5 border rounded-lg font-medium hover:bg-muted disabled:opacity-50"
                >
                  Capture photo
                </button>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={submit}
            disabled={submitting || signatureEmpty || !photoDataUrl}
            className="w-full py-2.5 px-4 rounded-lg font-medium text-sm bg-blue-600 text-white hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Sign & Continue
          </button>
        </div>
      )}
    </div>
  );
}
