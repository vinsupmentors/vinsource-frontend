import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { Loader2, CheckCircle2, Circle, BookOpen } from 'lucide-react';

interface ModuleRow {
  id: string;
  order: number;
  title: string;
  hours?: number;
  dayRange?: string;
  topics?: string;
  covered: boolean;
}

interface CourseBlock {
  scheduleId: string;
  courseId: string;
  courseName: string;
  modules: ModuleRow[];
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
