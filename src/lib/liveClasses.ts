// Shared types/helpers for the Live Classes module — used by the staff page
// (pages/LiveClasses.tsx), the student page (pages/student/StudentLiveClasses.tsx),
// and the classroom itself (pages/LiveClassroom.tsx), which is why this lives
// in lib/ rather than being redeclared per-page like most other modules'
// inlined Modal/Field/inputCls helpers — three very different shells all
// need to agree on exactly the same API response shape.

export type LiveClassStatus = 'SCHEDULED' | 'LIVE' | 'COMPLETED' | 'CANCELLED';

export interface LiveClassScheduleInfo {
  id: string;
  code: string | null;
  timing: string;
  startTime: string | null;
  endTime: string | null;
  mode: string;
  batch: { id: string; code: string };
  course: { id: string; name: string };
  _count?: { enrollments: number };
}

export interface LiveClass {
  id: string;
  classCode: string;
  roomName: string;
  title: string;
  topic: string | null;
  description: string | null;
  scheduleId: string;
  scheduledDate: string;
  startTime: string;
  endTime: string;
  actualStartAt: string | null;
  actualEndAt: string | null;
  status: LiveClassStatus;
  cancelReason: string | null;
  rescheduledFrom: string | null;
  createdBy: { firstName: string; lastName: string } | null;
  schedule: LiveClassScheduleInfo;
  liveParticipantCount?: number;
}

export interface LiveClassDashboard {
  todayCount: number;
  liveCount: number;
  upcomingCount: number;
  completedTodayCount: number;
  live: LiveClass[];
}

export interface ScheduleOption {
  id: string;
  code: string | null;
  timing: string;
  startTime: string | null;
  endTime: string | null;
  batch: { id: string; code: string };
  course: { id: string; name: string };
}

export const STATUS_BADGE: Record<LiveClassStatus, string> = {
  SCHEDULED: 'bg-blue-50 text-blue-700',
  LIVE: 'bg-red-50 text-red-700',
  COMPLETED: 'bg-emerald-50 text-emerald-700',
  CANCELLED: 'bg-gray-100 text-gray-600',
};

// ── Attendance-from-video ───────────────────────────────────────────────────
export type LiveClassAttendanceStatus = 'PRESENT' | 'PARTIAL' | 'ABSENT';

export interface LiveClassAttendanceRecord {
  id: string;
  liveClassId: string;
  studentId: string;
  status: LiveClassAttendanceStatus;
  attendedMinutes: number;
  classMinutes: number;
  percentAttended: number;
  student: { id: string; firstName: string; lastName: string; studentCode: string; photo: string | null };
}

export interface LiveClassAttendanceResponse {
  forEveryone: boolean;
  computed: boolean; // false until the class has actually ended
  records: LiveClassAttendanceRecord[];
}

export const ATTENDANCE_BADGE: Record<LiveClassAttendanceStatus, string> = {
  PRESENT: 'bg-emerald-50 text-emerald-700',
  PARTIAL: 'bg-amber-50 text-amber-700',
  ABSENT: 'bg-red-50 text-red-700',
};

// ── Analytics ────────────────────────────────────────────────────────────────
export interface LiveClassAnalyticsSummary {
  totalClasses: number;
  completedClasses: number;
  cancelledClasses: number;
  avgAttendancePercent: number;
  totalChatMessages: number;
  avgChatMessagesPerClass: number;
}

export interface LiveClassAnalyticsTrainerRow {
  trainerId: string;
  name: string;
  classesHosted: number;
  avgAttendancePercent: number;
}

export interface LiveClassAnalyticsBatchRow {
  batchId: string;
  code: string;
  classesCount: number;
  avgAttendancePercent: number;
}

export interface LiveClassAnalyticsTrendPoint {
  classId: string;
  date: string;
  avgAttendancePercent: number;
  present: number;
  partial: number;
  absent: number;
}

export interface LiveClassAnalytics {
  summary: LiveClassAnalyticsSummary;
  byTrainer: LiveClassAnalyticsTrainerRow[];
  byBatch: LiveClassAnalyticsBatchRow[];
  trend: LiveClassAnalyticsTrendPoint[];
}

// ── Recording ────────────────────────────────────────────────────────────────
export type LiveClassRecordingStatus = 'RECORDING' | 'READY' | 'FAILED';

export interface LiveClassRecordingRecord {
  id: string;
  status: LiveClassRecordingStatus;
  durationSec: number | null;
  startedAt: string;
  endedAt: string | null;
}

export interface LiveClassPlaybackUrl {
  url: string;
  expiresInSeconds: number;
}

export const RECORDING_BADGE: Record<LiveClassRecordingStatus, string> = {
  RECORDING: 'bg-blue-50 text-blue-700',
  READY: 'bg-emerald-50 text-emerald-700',
  FAILED: 'bg-red-50 text-red-700',
};

/** "754" seconds -> "12:34" */
export function formatDuration(sec?: number | null): string {
  if (!sec && sec !== 0) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** "09:30" -> "9:30 AM" */
export function formatClockTime(hhmm?: string | null): string {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

export function formatTimeRange(startTime: string, endTime: string): string {
  return `${formatClockTime(startTime)} – ${formatClockTime(endTime)}`;
}

export function formatClassDate(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function errMsg(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { message?: string } } };
  return e.response?.data?.message || fallback;
}
