import { useEffect, useState } from 'react';
import api, { BASE_URL } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import SecurePdfViewer from '@/components/SecurePdfViewer';
import { Loader2, CheckCircle2, Circle, BookOpen, FileText, Link2, PlayCircle, Download, Lock } from 'lucide-react';

interface MaterialRow {
  id: string;
  title: string;
  type: 'FILE' | 'LINK' | 'VIDEO';
  url?: string;
  notes?: string | null;
  /** Day-wise files: opened only in the protected viewer, never as a download link. */
  protected?: boolean;
}

interface ModuleRow {
  id: string;
  order: number;
  title: string;
  hours?: number;
  dayRange?: string;
  topics?: string;
  covered: boolean;
  materials?: MaterialRow[];
  lockedMaterialsCount?: number;
}

interface DayRow {
  id: string;
  dayNumber: number;
  title: string;
  topics?: string | null;
  releasedAt?: string;
  materials: MaterialRow[];
}

interface CourseBlock {
  scheduleId: string;
  courseId: string;
  courseName: string;
  days?: DayRow[];
  totalDays?: number;
  lockedDaysCount?: number;
  generalMaterials?: MaterialRow[];
  modules: ModuleRow[];
}

const materialHref = (url = '') => (/^https?:\/\//i.test(url) ? url : `${BASE_URL}${url}`);

function MaterialChip({ m, onOpen }: { m: MaterialRow; onOpen?: (m: MaterialRow) => void }) {
  const Icon = m.type === 'VIDEO' ? PlayCircle : m.type === 'LINK' ? Link2 : FileText;
  if (m.protected && onOpen) {
    return (
      <button
        type="button"
        onClick={() => onOpen(m)}
        title={m.notes || m.title}
        className="inline-flex items-center gap-1.5 text-xs font-medium border rounded-full px-2.5 py-1 transition-colors bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
      >
        <Icon className="w-3.5 h-3.5" /> {m.title}
      </button>
    );
  }
  const color = m.type === 'VIDEO'
    ? 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
    : m.type === 'LINK'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
      : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100';
  return (
    <a
      href={materialHref(m.url)}
      target="_blank"
      rel="noreferrer"
      title={m.notes || m.title}
      className={`inline-flex items-center gap-1.5 text-xs font-medium border rounded-full px-2.5 py-1 transition-colors ${color}`}
    >
      <Icon className="w-3.5 h-3.5" /> {m.title}
      {m.type === 'FILE' && <Download className="w-3 h-3 opacity-60" />}
    </a>
  );
}

export default function StudentCourseContent() {
  const [blocks, setBlocks] = useState<CourseBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<MaterialRow | null>(null);
  const { user } = useAuth();
  const stu = user?.student as { firstName?: string; lastName?: string; studentCode?: string } | null | undefined;
  const watermark = [stu ? `${stu.firstName ?? ''} ${stu.lastName ?? ''}`.trim() : '', stu?.studentCode, user?.email].filter(Boolean).join(' · ');

  useEffect(() => {
    api.get('/api/student-portal/course-content').then((r) => setBlocks(r.data.data || [])).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Course Content</h1>

      {viewing && (
        <SecurePdfViewer
          apiPath={`/api/student-portal/day-material/${viewing.id}/file`}
          title={viewing.title}
          watermark={watermark || 'Vinsup Skill Academy'}
          onClose={() => setViewing(null)}
        />
      )}

      {blocks.length === 0 && (
        <div className="bg-card rounded-xl border p-8 text-center text-muted-foreground text-sm">
          No course content available yet — you're not enrolled in a batch schedule.
        </div>
      )}

      {blocks.map((block) => {
        const coveredCount = block.modules.filter((m) => m.covered).length;
        return (
          <div key={block.scheduleId} className="bg-card rounded-xl border overflow-hidden">
            <div className="px-4 py-3 border-b bg-muted/40 flex items-center justify-between">
              <div className="flex items-center gap-2 font-medium text-sm">
                <BookOpen className="w-4 h-4 text-blue-600" />
                {block.courseName}
              </div>
              <span className="text-xs text-muted-foreground">{coveredCount} / {block.modules.length} modules covered</span>
            </div>

            {/* General course materials — available in full from day one */}
            {!!block.generalMaterials?.length && (
              <div className="px-4 py-3 border-b bg-blue-50/40">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Course Materials</p>
                <div className="flex flex-wrap gap-2">
                  {block.generalMaterials.map((m) => <MaterialChip key={m.id} m={m} />)}
                </div>
              </div>
            )}

            {/* Day-wise study material — appears as the trainer releases each day */}
            {(!!block.days?.length || !!block.totalDays) && (
              <div className="px-4 py-3 border-b">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Day-wise Study Material</p>
                  {!!block.totalDays && <span className="text-xs text-muted-foreground">{block.days?.length ?? 0} / {block.totalDays} days released</span>}
                </div>
                <div className="space-y-2">
                  {[...(block.days || [])].sort((a, b) => b.dayNumber - a.dayNumber).map((d) => (
                    <div key={d.id} className="rounded-lg border p-3">
                      <p className="text-sm font-medium">Day {d.dayNumber} · {d.title}</p>
                      {d.topics && <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{d.topics}</p>}
                      {!!d.materials.length && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {d.materials.map((mat) => <MaterialChip key={mat.id} m={mat} onOpen={setViewing} />)}
                        </div>
                      )}
                    </div>
                  ))}
                  {!!block.lockedDaysCount && (
                    <p className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground bg-muted rounded-full px-2.5 py-1">
                      <Lock className="w-3 h-3" /> {block.lockedDaysCount} more day{block.lockedDaysCount > 1 ? 's' : ''} — released by your trainer as the course progresses
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="divide-y">
              {block.modules.length === 0 && (
                <div className="px-4 py-6 text-center text-muted-foreground text-sm">Syllabus not added yet.</div>
              )}
              {block.modules.map((m) => (
                <div key={m.id} className="px-4 py-3 flex items-start gap-3">
                  {m.covered ? (
                    <CheckCircle2 className="w-4 h-4 mt-0.5 text-green-600 shrink-0" />
                  ) : (
                    <Circle className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{m.order}. {m.title}</span>
                      {m.hours != null && <span className="text-xs text-muted-foreground">{m.hours}h</span>}
                      {m.dayRange && <span className="text-xs text-muted-foreground">· {m.dayRange}</span>}
                    </div>
                    {m.topics && <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{m.topics}</p>}
                    {!!m.materials?.length && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {m.materials.map((mat) => <MaterialChip key={mat.id} m={mat} />)}
                      </div>
                    )}
                    {!!m.lockedMaterialsCount && (
                      <p className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground bg-muted rounded-full px-2.5 py-1 mt-2">
                        <Lock className="w-3 h-3" /> {m.lockedMaterialsCount} material{m.lockedMaterialsCount > 1 ? 's' : ''} — unlocks when this module is covered in class
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
