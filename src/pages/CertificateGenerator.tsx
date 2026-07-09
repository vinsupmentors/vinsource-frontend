import { useEffect, useRef, useState } from 'react';
import api from '@/lib/api';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import { FileText, Printer, Loader2, History, PlusCircle, Search, ZoomIn, X, Check } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type CertType =
  | 'OD_INTERNSHIP_JOINING'
  | 'BONAFIDE'
  | 'INTERNSHIP_COMPLETION_SHORT'
  | 'COURSE_COMPLETION'
  | 'INTERNSHIP_COMPLETION';

interface CertRecord {
  id: string;
  type: CertType;
  studentName: string;
  certNo: string;
  data: Record<string, string>;
  createdAt: string;
  issuedBy?: { firstName: string; lastName: string; employeeCode: string } | null;
}

const TYPE_META: Record<CertType, { label: string; short: string }> = {
  OD_INTERNSHIP_JOINING:       { label: 'OD / Internship Joining Letter (College)', short: 'OD / Joining Letter' },
  BONAFIDE:                    { label: 'Bonafide Certificate (Proof of Duration)', short: 'Bonafide' },
  INTERNSHIP_COMPLETION_SHORT: { label: 'Internship Completion — Short Duration',   short: 'Internship (Short)' },
  COURSE_COMPLETION:           { label: 'Course Completion Certificate',            short: 'Course Completion' },
  INTERNSHIP_COMPLETION:       { label: 'Internship Completion Certificate',        short: 'Internship Completion' },
};

const EMPTY_FORM: Record<string, string> = {
  studentName: '', relation: 'S/o', fatherName: '', gender: 'MALE',
  course: '', collegeName: '', className: '', studentId: '', batch: '',
  fromDate: '', toDate: '', issueDate: new Date().toISOString().slice(0, 10),
  purpose: 'submission to the Hostel Authorities',
  photoUrl: '',
  verifyUrl: '',
};

const fmtD = (d?: string) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }) : '____');

// ─── Photo cropper: drag to position, slider to zoom, circular crop ─────────

function PhotoCropper({ src, onApply, onCancel }: { src: string; onApply: (dataUrl: string) => void; onCancel: () => void }) {
  const SIZE = 240; // viewport px
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);

  const baseScale = natural ? SIZE / Math.min(natural.w, natural.h) : 1;

  const clampOffset = (x: number, y: number, z = zoom) => {
    if (!natural) return { x, y };
    const dw = natural.w * baseScale * z;
    const dh = natural.h * baseScale * z;
    const maxX = Math.max(0, (dw - SIZE) / 2);
    const maxY = Math.max(0, (dh - SIZE) / 2);
    return { x: Math.min(maxX, Math.max(-maxX, x)), y: Math.min(maxY, Math.max(-maxY, y)) };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, baseX: offset.x, baseY: offset.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const { startX, startY, baseX, baseY } = dragRef.current;
    setOffset(clampOffset(baseX + (e.clientX - startX), baseY + (e.clientY - startY)));
  };
  const onPointerUp = () => { dragRef.current = null; };

  const apply = () => {
    if (!natural) return;
    const OUT = 480;
    const canvas = document.createElement('canvas');
    canvas.width = OUT; canvas.height = OUT;
    const ctx = canvas.getContext('2d')!;
    const img = new Image();
    img.onload = () => {
      const ratio = OUT / SIZE;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, OUT, OUT);
      ctx.save();
      ctx.beginPath();
      ctx.arc(OUT / 2, OUT / 2, OUT / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.translate(OUT / 2 + offset.x * ratio, OUT / 2 + offset.y * ratio);
      const s = baseScale * zoom * ratio;
      ctx.scale(s, s);
      ctx.drawImage(img, -natural.w / 2, -natural.h / 2);
      ctx.restore();
      onApply(canvas.toDataURL('image/jpeg', 0.92));
    };
    img.src = src;
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-card border rounded-2xl shadow-xl p-6 space-y-4" style={{ width: 320 }}>
        <p className="font-semibold text-sm">Position &amp; crop the photo</p>
        <div
          style={{ width: SIZE, height: SIZE }}
          className="mx-auto rounded-full overflow-hidden border-4 border-primary/30 relative cursor-move touch-none bg-muted"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <img
            src={src}
            draggable={false}
            onLoad={(e) => {
              const t = e.target as HTMLImageElement;
              setNatural({ w: t.naturalWidth, h: t.naturalHeight });
            }}
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) scale(${baseScale * zoom})`,
              transformOrigin: 'center',
              width: natural ? natural.w : undefined,
              maxWidth: 'none',
              userSelect: 'none',
              pointerEvents: 'none',
            }}
          />
        </div>
        <div className="flex items-center gap-2">
          <ZoomIn className="w-4 h-4 text-muted-foreground" />
          <input
            type="range" min={1} max={3} step={0.01} value={zoom}
            onChange={(e) => { const z = Number(e.target.value); setZoom(z); setOffset((o) => clampOffset(o.x, o.y, z)); }}
            className="flex-1 accent-blue-600"
          />
        </div>
        <p className="text-[11px] text-muted-foreground text-center">Drag the photo to position · slide to zoom</p>
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 flex items-center justify-center gap-1 px-4 py-2 border rounded-lg text-sm hover:bg-accent">
            <X className="w-4 h-4" /> Cancel
          </button>
          <button onClick={apply} className="flex-1 flex items-center justify-center gap-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90">
            <Check className="w-4 h-4" /> Apply
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── VINSUP INFOTECH logo — real image if present, faithful CSS version otherwise ──

function InfotechLogo({ height = 66 }: { height?: number }) {
  const [imgOk, setImgOk] = useState(true);
  if (imgOk) {
    return (
      <img
        src="/certificates/infotech-logo.png"
        onError={() => setImgOk(false)}
        alt="Vinsup Infotech Pvt Ltd"
        style={{ height, margin: '0 auto', display: 'block' }}
      />
    );
  }
  // CSS recreation: tri-colour V mark + blue VINSUP + INFOTECH PVT LTD
  return (
    <div style={{ display: 'inline-block', textAlign: 'center', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ fontSize: 34, fontWeight: 900, letterSpacing: 1, lineHeight: 1 }}>
        <span style={{ color: '#e11d48' }}>▼</span>
        <span style={{ color: '#1e3a8a' }}>VINSUP</span>
      </div>
      <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: 3.5, color: '#111', marginTop: 2 }}>
        INFOTECH PVT LTD
      </div>
    </div>
  );
}

// ─── Letterhead (VINSUP INFOTECH letters) ────────────────────────────────────

function Letterhead() {
  return (
    <div style={{ textAlign: 'center' }}>
      <InfotechLogo />
      <div style={{ borderTop: '4px solid #111', margin: '12px 12px 2px' }} />
      <div style={{ borderTop: '1.5px solid #111', margin: '0 12px 8px' }} />
      <p style={{ fontSize: 12.5, margin: 0, fontWeight: 500 }}>148, Gopalasamy Kovil St, Ganapathy, Coimbatore, Tamil Nadu - 641006</p>
      <p style={{ fontSize: 12.5, margin: '2px 0 0' }}><b>EMail:</b> hrvinsup@gmail.com &nbsp;&nbsp;<span style={{ color: '#dc2626' }}>☎</span> 8870060607</p>
    </div>
  );
}

// React-state-based CBPO signature — survives re-renders caused by form input
function CBPOSign({ height = 48 }: { height?: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div style={{ fontFamily: "'Brush Script MT','Segoe Script',cursive", fontSize: 36, color: '#1a1a8e', lineHeight: 1 }}>
        Pooranam
      </div>
    );
  }
  return (
    <img
      src="/certificates/cbpo.png"
      alt=""
      style={{ height, display: 'block' }}
      onError={() => setFailed(true)}
    />
  );
}

function SignBlock({ date }: { date?: string }) {
  // Sign image removed — OD / Bonafide show name + designation text only
  return (
    <div style={{ flexShrink: 0, paddingTop: 16, paddingBottom: 100, fontSize: 15, lineHeight: 1.75 }}>
      <p style={{ margin: '0 0 4px' }}>{fmtD(date)}</p>
      <p style={{ margin: '0 0 20px' }}>Thanks and Regards,</p>
      <p style={{ margin: '0 0 2px', fontWeight: 700 }}>Pooranam Annamalai</p>
      <p style={{ margin: 0 }}>CBPO</p>
    </div>
  );
}

// ─── Templates ────────────────────────────────────────────────────────────────

function BonafideTemplate({ f }: { f: Record<string, string> }) {
  const pronoun = f.gender === 'FEMALE' ? 'her' : 'him';
  const P: React.CSSProperties = { fontSize: 15.5, lineHeight: 2.1, textAlign: 'justify', margin: '0 0 18px' };
  return (
    <div style={{
      width: 794, height: 1123, overflow: 'hidden',
      padding: '48px 60px', background: '#fff', boxSizing: 'border-box',
      position: 'relative', fontFamily: 'Georgia, serif', color: '#111',
    }}>
      <Letterhead />
      <p style={{ textAlign: 'right', fontSize: 14.5, marginTop: 28 }}><b>Date:</b> {fmtD(f.issueDate)}</p>
      <h2 style={{ textAlign: 'center', fontSize: 19, letterSpacing: 2, margin: '20px 0 16px', textDecoration: 'underline', textUnderlineOffset: 6 }}>BONAFIDE CERTIFICATE</h2>
      <h3 style={{ textAlign: 'center', fontSize: 16, letterSpacing: 1, margin: '0 0 24px' }}>TO WHOMSOEVER IT MAY CONCERN</h3>
      <p style={P}>
        This is to certify that <b>{f.studentName || 'Name'}</b>, {f.relation} <b>{f.fatherName || 'Father name'}</b>, is a bonafide
        student of <b>Vinsup Skill Academy</b> and is currently enrolled in the <b>{f.course || 'course'}</b> training program.
      </p>
      <p style={P}>
        The student joined the <b>{f.course || '—'}</b> course and is pursuing the training program with us during the academic
        period <b>{fmtD(f.fromDate)}</b> to <b>{fmtD(f.toDate)}</b>. During this period, the student has been regular and is in
        good standing with the academy.
      </p>
      <p style={P}>
        This certificate is issued at the specific request of the student for {f.purpose || 'submission to the concerned authorities'}.
      </p>
      <p style={{ ...P, textAlign: 'left' }}>We wish {pronoun} all the best in future endeavors.</p>

      {/* Sign: absolute, bottom:220 keeps full block above preview viewport cut */}
      <div style={{ position: 'absolute', bottom: 220, left: 60, right: 60, fontSize: 15, lineHeight: 1.75 }}>
        <p style={{ margin: '0 0 4px' }}>{fmtD(f.issueDate)}</p>
        <p style={{ margin: '0 0 20px' }}>Thanks and Regards,</p>
        <p style={{ margin: '0 0 2px', fontWeight: 700 }}>Pooranam Annamalai</p>
        <p style={{ margin: 0 }}>CBPO</p>
      </div>
    </div>
  );
}

function ODJoiningTemplate({ f }: { f: Record<string, string> }) {
  const pronoun = f.gender === 'FEMALE' ? 'she' : 'he';
  const possessive = f.gender === 'FEMALE' ? 'her' : 'his';
  const P: React.CSSProperties = { fontSize: 15.5, lineHeight: 2.1, textAlign: 'justify', margin: '0 0 18px' };
  return (
    <div style={{
      width: 794, height: 1123, overflow: 'hidden',
      padding: '48px 60px', background: '#fff', boxSizing: 'border-box',
      position: 'relative', fontFamily: 'Georgia, serif', color: '#111',
    }}>
      <Letterhead />
      <h3 style={{ textAlign: 'center', fontSize: 16, letterSpacing: 1, margin: '28px 0 14px' }}>TO WHOMSOEVER IT MAY CONCERN</h3>
      <h2 style={{ textAlign: 'center', fontSize: 18, letterSpacing: 2, margin: '0 0 22px', textDecoration: 'underline', textUnderlineOffset: 6 }}>INTERNSHIP JOINING LETTER</h2>
      <p style={P}>
        This is to respectfully inform you that <b>{f.studentName || 'Name'}</b>, a student of <b>{f.collegeName || 'College Name'}{f.className ? `, ${f.className}` : ''}</b>,
        is currently doing an internship at our organization, <b>VINSUP INFOTECH PVT LTD</b>, for the period <b>{fmtD(f.fromDate)}</b> to <b>{fmtD(f.toDate)}</b>.
      </p>
      <p style={P}>
        During the above-mentioned period, {pronoun} has been actively involved in various assigned tasks and projects as part of {possessive} internship,
        gaining practical exposure and industry-relevant knowledge aligned with {possessive} academic curriculum.
      </p>
      <p style={P}>
        In view of the above, we humbly request you to kindly consider the mentioned duration as <b>On-Duty (OD)</b> for the student.
      </p>
      <p style={P}>
        Should you require any further information or clarification, please feel free to contact us. We shall be glad to assist you.
      </p>
      <p style={{ ...P, textAlign: 'left' }}>Thank you for your time, support, and kind consideration.</p>

      {/* Sign: absolutely pinned. bottom:220 keeps full block (130px tall) well above the viewport cut */}
      <div style={{ position: 'absolute', bottom: 220, left: 60, right: 60, fontSize: 15, lineHeight: 1.75 }}>
        <p style={{ margin: '0 0 4px' }}>{fmtD(f.issueDate)}</p>
        <p style={{ margin: '0 0 20px' }}>Thanks and Regards,</p>
        <p style={{ margin: '0 0 2px', fontWeight: 700 }}>Pooranam Annamalai</p>
        <p style={{ margin: 0 }}>CBPO</p>
      </div>
    </div>
  );
}

function InternshipCompletionTemplate({ f, short }: { f: Record<string, string>; short?: boolean }) {
  const P: React.CSSProperties = {
    fontSize: 15, lineHeight: 2.05, textAlign: 'justify', margin: '0 0 22px',
    fontFamily: 'Georgia, "Times New Roman", serif',
  };
  const qrUrl = f.verifyUrl?.trim();
  const dmy = f.issueDate ? new Date(f.issueDate).toLocaleDateString('en-GB') : '—';

  return (
    <div className="cert-internship-content" style={{
      width: 794, height: 1123, overflow: 'hidden',
      padding: '36px 56px 32px', background: '#FFF9F2', boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column',
      fontFamily: 'Georgia, "Times New Roman", serif', color: '#1a1a1a',
    }}>

      {/* ── Header ── */}
      <div style={{ flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <InfotechLogo height={55} />
          <div style={{
            fontSize: 11.5, lineHeight: 1.8, textAlign: 'left',
            borderLeft: '2px solid #333', paddingLeft: 16, maxWidth: 285,
            fontFamily: 'Arial, sans-serif',
          }}>
            <p style={{ margin: 0 }}><b>Phone</b> : 8870060607</p>
            <p style={{ margin: 0 }}><b>Email</b> : hrvinsup@gmail.com</p>
            <p style={{ margin: 0 }}><b>Address</b> : 148, Gopalasamy Kovil St, Ganapathy,<br />Coimbatore, Tamil Nadu - 641006</p>
          </div>
        </div>
        <div style={{ borderTop: '4px solid #111', margin: '14px 0 3px' }} />
        <div style={{ borderTop: '1.5px solid #111', margin: '0 0 28px' }} />
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1 }}>
        <h2 style={{
          textAlign: 'center', fontSize: 20, letterSpacing: 1.5, margin: '0 0 28px',
          fontWeight: 700, color: '#1a1a1a', fontFamily: 'Arial, sans-serif',
        }}>
          INTERNSHIP COMPLETION CERTIFICATE
        </h2>
        <p style={P}>
          This is to certify that <b>{f.studentName || 'Name'}</b> has successfully completed the <b>Internship Program</b> at{' '}
          <b>Vinsup Infotech Private Limited</b>{f.fromDate ? <> for the period <b>{fmtD(f.fromDate)}</b> to <b>{fmtD(f.toDate)}</b></> : null}.
        </p>
        <p style={P}>
          Throughout the internship tenure, the candidate has demonstrated commendable proficiency in industry-relevant technical
          competencies and has effectively translated theoretical knowledge into practical execution through real-time projects and assignments.
        </p>
        <p style={{ fontSize: 15, fontWeight: 700, margin: '0 0 0', fontFamily: 'Arial, sans-serif', lineHeight: 2.05 }}>
          During the program, the student consistently displayed:
        </p>
        <div style={{ fontSize: 15, lineHeight: 2.05, margin: '0 0 22px', paddingLeft: 10, fontFamily: 'Georgia, "Times New Roman", serif' }}>
          <p style={{ margin: 0 }}>• &nbsp;Strong analytical and problem-solving abilities</p>
          <p style={{ margin: 0 }}>• &nbsp;Professional work ethics and discipline</p>
          <p style={{ margin: 0 }}>• &nbsp;Effective communication and collaborative skills</p>
          <p style={{ margin: 0 }}>• &nbsp;Commitment towards quality delivery and performance excellence</p>
        </div>
        <p style={P}>
          The internship experience has equipped the candidate with practical exposure aligned to current industry standards and workplace expectations.
        </p>
        <p style={{ ...P, margin: 0 }}>
          We acknowledge and appreciate the dedication, sincerity, and performance demonstrated during the course of the internship and
          extend our best wishes for continued growth and success in all future professional endeavors.
        </p>
      </div>

      {/* ── Footer row 1: details + QR ── */}
      <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingTop: 20 }}>
        <div style={{ fontSize: 13.5, lineHeight: 2.05, fontFamily: 'Arial, sans-serif', color: '#1a1a1a' }}>
          <p style={{ margin: 0 }}><b>Issued On :</b> {dmy}</p>
          <p style={{ margin: 0 }}><b>Course &nbsp;&nbsp;&nbsp;&nbsp;:</b> {f.course || '—'}</p>
          <p style={{ margin: 0 }}><b>Student ID :</b> {f.studentId || '—'}</p>
          <p style={{ margin: 0 }}><b>Batch &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;:</b> {f.batch || '—'}</p>
        </div>
        {qrUrl ? (
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=110x110&data=${encodeURIComponent(qrUrl)}`}
            alt="Verify Certificate"
            style={{ width: 110, height: 110, display: 'block' }}
          />
        ) : null}
      </div>

      {/* ── Footer row 2: signature (right-aligned, below QR) ── */}
      <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'flex-end', paddingTop: 16 }}>
        <div style={{ textAlign: 'center', minWidth: 130 }}>
          <CBPOSign height={44} />
          <div style={{ borderTop: '1.5px solid #333', marginTop: 6, paddingTop: 5 }}>
            <p style={{ margin: 0, fontWeight: 700, letterSpacing: 2, fontSize: 13, fontFamily: 'Arial, sans-serif' }}>CBPO</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function CourseCompletionTemplate({ f }: { f: Record<string, string> }) {
  // Pixel-perfect: the official design (course-completion-bg.png, 1414×2000 with
  // dynamic areas blanked) as background, live data overlaid at exact positions.
  // Sheet is fixed at 794px (= A4 width @96dpi), scale = 794/1414.
  const dmy = f.issueDate ? new Date(f.issueDate).toLocaleDateString('en-GB') : '__/__/____';
  return (
    <div style={{ position: 'relative', width: 794, height: 1123, background: '#fff', fontFamily: 'Arial, sans-serif', overflow: 'hidden' }}>
      <img src="/certificates/course-completion-bg.png" alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />

      {/* Student photo → fills the medal's inner circle exactly */}
      {f.photoUrl && (
        <img src={f.photoUrl} alt="" style={{ position: 'absolute', left: 50, top: 484, width: 174, height: 174, borderRadius: '50%', objectFit: 'cover' }} />
      )}

      {/* Student name + underline */}
      <div style={{ position: 'absolute', left: 275, top: 458, width: 472, textAlign: 'center', borderBottom: '2px solid #1e3a8a', paddingBottom: 10 }}>
        <span style={{ fontSize: f.studentName && f.studentName.length > 18 ? 27 : 34, fontWeight: 800, color: '#111', textTransform: 'uppercase', letterSpacing: 1, whiteSpace: 'nowrap' }}>
          {f.studentName || 'STUDENT NAME'}
        </span>
      </div>

      {/* Info block — label / colon / value in aligned columns */}
      <div style={{ position: 'absolute', left: 245, top: 733, fontSize: 14, color: '#111' }}>
        {([['ISSUED ON', dmy], ['STUDENT ID', f.studentId || '—'], ['COURSE', f.course || '—'], ['BATCH', f.batch || '—']] as [string, string][]).map(([label, value]) => (
          <div key={label} style={{ display: 'grid', gridTemplateColumns: '90px 12px auto', lineHeight: '23px' }}>
            <b>{label}</b><b>:</b><span>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CertificateGeneratorPage() {
  const { hasModule, loaded } = useModuleAccess();
  const canView = hasModule('CERTIFICATES', 'VIEW');
  const canGenerate = hasModule('CERTIFICATES', 'EDIT');

  const [mode, setMode] = useState<'generate' | 'history'>('generate');
  const [type, setType] = useState<CertType>('BONAFIDE');
  const [form, setForm] = useState<Record<string, string>>({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [lastCertNo, setLastCertNo] = useState('');

  const [history, setHistory] = useState<CertRecord[]>([]);
  const [historySearch, setHistorySearch] = useState('');
  const [historyLoading, setHistoryLoading] = useState(false);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const { data } = await api.get('/api/certificates', { params: { search: historySearch || undefined, limit: 50 } });
      setHistory(data.data || []);
    } catch { /* ignore */ }
    finally { setHistoryLoading(false); }
  };
  useEffect(() => { if (mode === 'history') fetchHistory(); /* eslint-disable-next-line */ }, [mode]);

  const [cropSrc, setCropSrc] = useState<string | null>(null);

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setCropSrc(String(ev.target?.result || ''));
    reader.readAsDataURL(file);
  };

  const printCert = () => {
    const certEl = document.getElementById('cert-sheet');
    if (!certEl) return;
    const clone = certEl.cloneNode(true) as HTMLElement;
    const origin = window.location.origin;
    // Fix relative image src → absolute so popup can load them
    clone.querySelectorAll('img[src^="/"]').forEach((img) => {
      (img as HTMLImageElement).src = origin + (img as HTMLImageElement).getAttribute('src');
    });
    const printWin = window.open('', '_blank', 'width=900,height=1200');
    if (!printWin) { window.print(); return; }
    printWin.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Certificate</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{background:#fff;width:794px}
  @page{size:A4;margin:0}
  @media print{html,body{width:794px}}
  body{font-family:Georgia,serif;color:#1a1a1a}
</style></head><body>${clone.outerHTML}</body></html>`);
    printWin.document.close();
    setTimeout(() => { printWin.focus(); printWin.print(); printWin.close(); }, 600);
  };

  const generateAndPrint = async () => {
    if (!form.studentName.trim()) { setError('Student name is required'); return; }
    setSaving(true);
    setError('');
    try {
      const { data } = await api.post('/api/certificates', {
        type,
        studentName: form.studentName,
        data: { ...form, photoUrl: form.photoUrl ? '(photo attached)' : '' },
      });
      setLastCertNo(data.data?.certNo || '');
      // Give React a tick to render the cert number, then print
      setTimeout(() => printCert(), 350);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to record certificate');
    } finally { setSaving(false); }
  };

  const reprint = (r: CertRecord) => {
    setType(r.type);
    setForm({ ...EMPTY_FORM, ...r.data, studentName: r.studentName, photoUrl: '' });
    setLastCertNo(r.certNo);
    setMode('generate');
    setTimeout(() => printCert(), 600);
  };

  if (loaded && !canView) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <FileText className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-40" />
          <p className="font-medium">No access to Certificate Generator</p>
          <p className="text-sm text-muted-foreground">Ask a Super Admin to grant you the "Certificate Generator" module in Master Control.</p>
        </div>
      </div>
    );
  }

  const isLetter = type === 'BONAFIDE' || type === 'OD_INTERNSHIP_JOINING';

  return (
    <div className="space-y-6">
      {/* Print-only styles: print just the certificate sheet */}
      <style>{`
        @media screen { .cert-internship-content { height: auto !important; } }
        .cert-preview-zoom { zoom: 0.75; width: fit-content; margin: 0 auto; }
        .cert-a4 { width: 794px; min-height: 1123px; padding: 48px 60px; background: #fff; box-sizing: border-box; }
        .cert-letter { display: flex; flex-direction: column; height: 1123px; }
      `}</style>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><FileText className="w-6 h-6" /> Certificate Generator</h1>
          <p className="text-muted-foreground text-sm">Generate student letters &amp; certificates — fills the template, records it, and opens print/save-as-PDF</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setMode('generate')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border ${mode === 'generate' ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-accent'}`}>
            <PlusCircle className="w-4 h-4" /> Generate
          </button>
          <button onClick={() => setMode('history')} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border ${mode === 'history' ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-accent'}`}>
            <History className="w-4 h-4" /> History
          </button>
        </div>
      </div>

      {cropSrc && (
        <PhotoCropper
          src={cropSrc}
          onApply={(dataUrl) => { setForm((f) => ({ ...f, photoUrl: dataUrl })); setCropSrc(null); }}
          onCancel={() => setCropSrc(null)}
        />
      )}

      {mode === 'history' ? (
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
              <input value={historySearch} onChange={(e) => setHistorySearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && fetchHistory()}
                placeholder="Search student name…" className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm bg-background" />
            </div>
            <button onClick={fetchHistory} className="px-4 py-2 text-sm border rounded-lg hover:bg-accent">Search</button>
          </div>
          <div className="bg-card border rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Cert No.</th>
                  <th className="px-4 py-3">Student</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Generated</th>
                  <th className="px-4 py-3">By</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {historyLoading ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>
                ) : history.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No certificates generated yet</td></tr>
                ) : history.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-mono text-xs">{r.certNo}</td>
                    <td className="px-4 py-3 font-medium">{r.studentName}</td>
                    <td className="px-4 py-3 text-muted-foreground">{TYPE_META[r.type]?.short || r.type}</td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{new Date(r.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.issuedBy ? `${r.issuedBy.firstName} ${r.issuedBy.lastName}` : '—'}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => reprint(r)} className="flex items-center gap-1 px-2.5 py-1.5 text-xs border rounded-lg hover:bg-accent">
                        <Printer className="w-3.5 h-3.5" /> Re-print
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid lg:grid-cols-[380px_1fr] gap-6 items-start">
          {/* ── Form ── */}
          <div className="bg-card border rounded-2xl p-5 space-y-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Document Type</label>
              <select value={type} onChange={(e) => setType(e.target.value as CertType)} className="w-full px-3 py-2 border rounded-lg text-sm bg-background">
                {(Object.keys(TYPE_META) as CertType[]).map((t) => <option key={t} value={t}>{TYPE_META[t].label}</option>)}
              </select>
              {type === 'INTERNSHIP_COMPLETION_SHORT' && (
                <p className="text-[11px] text-amber-600 mt-1">Using the standard completion layout with a duration line — will be updated once the sample is provided.</p>
              )}
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Student Name *</label>
              <input value={form.studentName} onChange={set('studentName')} className="w-full px-3 py-2 border rounded-lg text-sm bg-background" placeholder="e.g. Anbarasu" />
            </div>

            {type === 'BONAFIDE' && (
              <>
                <div className="grid grid-cols-[90px_1fr] gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Relation</label>
                    <select value={form.relation} onChange={set('relation')} className="w-full px-3 py-2 border rounded-lg text-sm bg-background">
                      <option value="S/o">S/o</option>
                      <option value="D/o">D/o</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Father / Guardian Name</label>
                    <input value={form.fatherName} onChange={set('fatherName')} className="w-full px-3 py-2 border rounded-lg text-sm bg-background" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Issued for (purpose)</label>
                  <input value={form.purpose} onChange={set('purpose')} className="w-full px-3 py-2 border rounded-lg text-sm bg-background" />
                </div>
              </>
            )}

            {type === 'OD_INTERNSHIP_JOINING' && (
              <>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">College Name</label>
                  <input value={form.collegeName} onChange={set('collegeName')} className="w-full px-3 py-2 border rounded-lg text-sm bg-background" placeholder="e.g. PSG College of Arts" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Class / Degree</label>
                  <input value={form.className} onChange={set('className')} className="w-full px-3 py-2 border rounded-lg text-sm bg-background" placeholder="e.g. II MCA" />
                </div>
              </>
            )}

            {(type !== 'COURSE_COMPLETION') && (
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Gender (for pronouns)</label>
                <select value={form.gender} onChange={set('gender')} className="w-full px-3 py-2 border rounded-lg text-sm bg-background">
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                </select>
              </div>
            )}

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Course</label>
              <input value={form.course} onChange={set('course')} className="w-full px-3 py-2 border rounded-lg text-sm bg-background" placeholder="e.g. Data Analytics" />
            </div>

            {(type === 'COURSE_COMPLETION' || type === 'INTERNSHIP_COMPLETION' || type === 'INTERNSHIP_COMPLETION_SHORT') && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Student ID</label>
                  <input value={form.studentId} onChange={set('studentId')} className="w-full px-3 py-2 border rounded-lg text-sm bg-background" placeholder="e.g. VS70370" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Batch</label>
                  <input value={form.batch} onChange={set('batch')} className="w-full px-3 py-2 border rounded-lg text-sm bg-background" placeholder="e.g. Batch 10" />
                </div>
              </div>
            )}

            {(type === 'INTERNSHIP_COMPLETION' || type === 'INTERNSHIP_COMPLETION_SHORT') && (
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Verification URL (for QR code)</label>
                <input
                  value={form.verifyUrl || ''}
                  onChange={set('verifyUrl')}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-background"
                  placeholder="https://vinsource.vinsupskillacademy.com/verify/..."
                />
                <p className="text-[10px] text-muted-foreground mt-0.5">Each student gets their own URL → converted to QR on the certificate. Leave blank to omit.</p>
              </div>
            )}

            {(type === 'BONAFIDE' || type === 'OD_INTERNSHIP_JOINING' || type === 'INTERNSHIP_COMPLETION_SHORT') && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Period From</label>
                  <input type="date" value={form.fromDate} onChange={set('fromDate')} className="w-full px-3 py-2 border rounded-lg text-sm bg-background" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Period To</label>
                  <input type="date" value={form.toDate} onChange={set('toDate')} className="w-full px-3 py-2 border rounded-lg text-sm bg-background" />
                </div>
              </div>
            )}

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Issue Date</label>
              <input type="date" value={form.issueDate} onChange={set('issueDate')} className="w-full px-3 py-2 border rounded-lg text-sm bg-background" />
            </div>

            {type === 'COURSE_COMPLETION' && (
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Student Photo (optional)</label>
                <input type="file" accept="image/*" onChange={handlePhoto} className="w-full text-xs" />
                {form.photoUrl && (
                  <div className="flex items-center gap-2 mt-2">
                    <img src={form.photoUrl} alt="" className="w-10 h-10 rounded-full object-cover border" />
                    <button onClick={() => setForm((f) => ({ ...f, photoUrl: '' }))} className="text-xs text-red-600 hover:underline">Remove</button>
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground mt-1">You'll be able to zoom &amp; position the photo after choosing it.</p>
              </div>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}
            {lastCertNo && <p className="text-xs text-muted-foreground">Last generated: <span className="font-mono">{lastCertNo}</span></p>}

            <div className="flex gap-2 pt-1">
              <button
                onClick={generateAndPrint}
                disabled={saving || !canGenerate}
                title={canGenerate ? '' : 'You have view-only access'}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                Generate &amp; Print / Save PDF
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">In the print dialog choose "Save as PDF" to download the document for the student.</p>
          </div>

          {/* ── Live preview — .cert-preview-zoom applies zoom:0.82 on screen only
               so the full A4 certificate fits without scrolling. Print CSS resets
               the wrapper to zoom:1 while cert-sheet uses position:fixed;inset:0. ── */}
          <div className="overflow-auto">
            <div className="cert-preview-zoom">
              <div id="cert-sheet" className="shadow-lg" style={{ background: '#fff', outline: '1px solid #e5e7eb' }}>
                {type === 'BONAFIDE' && <BonafideTemplate f={form} />}
                {type === 'OD_INTERNSHIP_JOINING' && <ODJoiningTemplate f={form} />}
                {type === 'INTERNSHIP_COMPLETION' && <InternshipCompletionTemplate f={form} />}
                {type === 'INTERNSHIP_COMPLETION_SHORT' && <InternshipCompletionTemplate f={form} short />}
                {type === 'COURSE_COMPLETION' && <CourseCompletionTemplate f={form} />}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
