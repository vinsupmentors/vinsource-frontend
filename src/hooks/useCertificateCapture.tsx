import { useEffect, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { CourseCompletionTemplate, InternshipCompletionTemplate } from '@/pages/CertificateGenerator';
import { BASE_URL } from '@/lib/api';

export interface CertRenderData {
  type: 'COURSE_COMPLETION' | 'INTERNSHIP';
  studentName: string;
  studentId: string;
  course: string | null;
  batch: string | null;
  issueDate: string | null;
  photoUrl: string | null;
  certificateNo: string;
}

const resolveUrl = (p?: string | null) => {
  if (!p) return '';
  if (/^https?:\/\//i.test(p) || p.startsWith('data:')) return p;
  return `${BASE_URL}${p}`;
};

function toTemplateForm(d: CertRenderData): Record<string, string> {
  return {
    studentName: d.studentName,
    studentId: d.studentId,
    course: d.course || '',
    batch: d.batch || '',
    issueDate: d.issueDate ? new Date(d.issueDate).toISOString().slice(0, 10) : '',
    photoUrl: resolveUrl(d.photoUrl),
  };
}

/**
 * Off-screen render + PDF capture for the two official certificate
 * templates (CourseCompletionTemplate / InternshipCompletionTemplate from
 * CertificateGenerator.tsx) — same html2canvas+jsPDF pattern already used
 * in BatchCertificates.tsx, so the auto-generated certificates from the
 * approval workflow are pixel-identical to hand-made ones instead of a
 * separately-designed layout.
 *
 * Usage: `const { capture, CaptureNode } = useCertificateCapture();` then
 * mount `{CaptureNode}` once anywhere in the component tree, and call
 * `await capture(renderData)` to get a PDF Blob back.
 */
export function useCertificateCapture() {
  const captureRef = useRef<HTMLDivElement>(null);
  const [row, setRow] = useState<CertRenderData | null>(null);
  const resolveRef = useRef<((blob: Blob | null) => void) | null>(null);

  useEffect(() => {
    if (!row) return;
    const t = setTimeout(async () => {
      let blob: Blob | null = null;
      try {
        const node = captureRef.current;
        if (node) {
          const canvas = await html2canvas(node, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
          const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [794, 1123] });
          pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 794, 1123);
          blob = pdf.output('blob');
        }
      } catch (e) {
        console.error('Certificate PDF export failed', e);
      } finally {
        setRow(null);
        resolveRef.current?.(blob);
        resolveRef.current = null;
      }
    }, 400); // let the background image / student photo finish loading before capture
    return () => clearTimeout(t);
  }, [row]);

  const capture = (data: CertRenderData) => new Promise<Blob | null>((resolve) => {
    resolveRef.current = resolve;
    setRow(data);
  });

  const CaptureNode = row ? (
    <div style={{ position: 'fixed', left: -99999, top: 0, width: 794, height: 1123 }}>
      <div ref={captureRef} style={{ width: 794, height: 1123 }}>
        {row.type === 'COURSE_COMPLETION'
          ? <CourseCompletionTemplate f={toTemplateForm(row)} />
          : <InternshipCompletionTemplate f={toTemplateForm(row)} />}
      </div>
    </div>
  ) : null;

  return { capture, CaptureNode };
}
