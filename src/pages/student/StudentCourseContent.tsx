import { useEffect, useState } from 'react';
import api, { BASE_URL } from '@/lib/api';
import { Loader2, CheckCircle2, Circle, BookOpen, FileText, Link2, PlayCircle, Download, Lock } from 'lucide-react';

interface MaterialRow {
  id: string;
  title: string;
  type: 'FILE' | 'LINK' | 'VIDEO';
  url: string;
  notes?: string | null;
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

interface CourseBlock {
  scheduleId: string;
  courseId: string;
  courseName: string;
  generalMaterials?: MaterialRow[];
  modules: ModuleRow[];
}

const materialHref = (url: string) => (/^https?:\/\//i.test(url) ? url : `${BASE_URL}${url}`);

function MaterialChip({ m }: { m: MaterialRow }) {
  const Icon = m.type === 'VIDEO' ? PlayCircle : m.type === 'LINK' ? Link2 : FileText;
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

  useEffect(() => {
    api.get('/api/student-portal/course-content').then((r) => setBlocks(r.data.data || [])).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Course Content</h1>

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
