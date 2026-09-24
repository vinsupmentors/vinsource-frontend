import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, subMonths,
  format, isSameMonth, isToday,
} from 'date-fns';
import { ChevronLeft, ChevronRight, Loader2, X, Plus, Pencil } from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { useModuleAccess } from '@/hooks/useModuleAccess';

// Shared Google-Calendar-style view, consumed as-is by both the staff
// Calendar page and the student Calendar page (pages/Calendar.tsx,
// pages/student/StudentCalendar.tsx). Deliberately takes no props: it
// fetches straight from GET /api/calendar and lets the backend do all the
// role-scoping (admin sees everything, trainers/students see only their
// own batches — see calendar.controller.ts's selfScheduleScope), so the
// exact same component is correct for every audience the product decision
// named (admin, trainers, students) with zero role-branching in here.
//
// Mostly read-only, with one deliberate exception: anyone holding
// PRODUCTION_TRAINING EDIT (the same permission that already gates the
// Production page's own batch-schedule tools) can create a new batch
// schedule here or quick-edit an existing one's timing/recurrence — both
// go straight through Production's existing endpoints
// (POST /api/production/batches/:batchId/schedules,
// PUT /api/production/schedules/:scheduleId), so a schedule created or
// edited from the Calendar is a real BatchCourseSchedule row, visible
// everywhere schedules already are (Production, Admission, Live Classes).
// Live Class and Leave events stay read-only here — they already have
// their own management surfaces (Live Classes pages, the Leave workflow).

type CalendarEventType = 'BATCH_SCHEDULE' | 'LIVE_CLASS' | 'LEAVE';

interface ScheduleMeta {
  scheduleId: string;
  scheduleCode: string | null;
  timing: string;
  mode: string;
  dayPattern: string;
  customWeekdays: number | null;
  startDate: string;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  capacity: number | null;
  batchId: string;
  courseId: string;
}

interface CalendarEvent {
  id: string;
  type: CalendarEventType;
  title: string;
  subtitle: string | null;
  date: string; // YYYY-MM-DD
  startTime: string | null;
  endTime: string | null;
  allDay: boolean;
  status: string | null;
  meta: Record<string, unknown>;
}

interface BatchLite { id: string; code: string; status: string; }
interface CourseLite { id: string; name: string; }

const TYPE_STYLES: Record<CalendarEventType, { chip: string; dot: string; label: string }> = {
  BATCH_SCHEDULE: { chip: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-500', label: 'Batch Class' },
  LIVE_CLASS: { chip: 'bg-violet-50 text-violet-700 border-violet-200', dot: 'bg-violet-500', label: 'Live Class' },
  LEAVE: { chip: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500', label: 'Leave' },
};

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// Timeline window for Day view — covers this academy's actual class hours
// (morning batches from ~7-8am, evening batches can run past 8pm), padded
// slightly on both ends rather than rendering a full 24h scroll.
const DAY_START_HOUR = 6;
const DAY_END_HOUR = 22;
const HOUR_PX = 56;

function toDateStr(d: Date) {
  return format(d, 'yyyy-MM-dd');
}

function timeToMinutes(t: string | null): number | null {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function formatTimeLabel(t: string) {
  const [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h)) return t;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

function errMsg(err: unknown, fallback: string) {
  const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
  return message || fallback;
}

// ── Weekday-selection <-> DayPattern conversion ────────────────────────────
// A 7-item boolean array, index 0 = Sunday ... 6 = Saturday, is the single
// source of truth the UI works with (matches the customWeekdays bitmask bit
// order used server-side). If the ticked days exactly match one of the three
// original coarse patterns, we store that pattern instead of CUSTOM — same
// data Production/Admission's own dropdowns already write, so a schedule
// created here with "every day but Sunday" ticked is indistinguishable from
// one created the old way.
const MON_SAT_SEL = [false, true, true, true, true, true, true];
const SAT_SUN_SEL = [true, false, false, false, false, false, true];
const SUNDAY_ONLY_SEL = [true, false, false, false, false, false, false];

function patternToSelection(dayPattern: string, customWeekdays: number | null): boolean[] {
  if (dayPattern === 'CUSTOM') {
    const mask = customWeekdays || 0;
    return Array.from({ length: 7 }, (_, i) => (mask & (1 << i)) !== 0);
  }
  if (dayPattern === 'MON_SAT') return MON_SAT_SEL;
  if (dayPattern === 'SAT_SUN') return SAT_SUN_SEL;
  if (dayPattern === 'SUNDAY_ONLY') return SUNDAY_ONLY_SEL;
  return [false, false, false, false, false, false, false];
}

function selectionToPattern(selection: boolean[]): { dayPattern: string; customWeekdays: number | null } {
  const eq = (a: boolean[]) => a.every((v, i) => v === selection[i]);
  if (eq(MON_SAT_SEL)) return { dayPattern: 'MON_SAT', customWeekdays: null };
  if (eq(SAT_SUN_SEL)) return { dayPattern: 'SAT_SUN', customWeekdays: null };
  if (eq(SUNDAY_ONLY_SEL)) return { dayPattern: 'SUNDAY_ONLY', customWeekdays: null };
  let mask = 0;
  selection.forEach((v, i) => { if (v) mask |= (1 << i); });
  return { dayPattern: 'CUSTOM', customWeekdays: mask };
}

function WeekdayPicker({ selection, onChange }: { selection: boolean[]; onChange: (s: boolean[]) => void }) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">Repeat on</label>
      <div className="flex gap-1.5 mt-1">
        {WEEKDAY_LETTERS.map((letter, i) => (
          <button
            key={i}
            type="button"
            onClick={() => {
              const next = [...selection];
              next[i] = !next[i];
              onChange(next);
            }}
            className={cn(
              'w-8 h-8 rounded-full text-xs font-semibold border transition-colors',
              selection[i] ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-muted-foreground hover:bg-muted'
            )}
          >
            {letter}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function CalendarView() {
  const { hasModule } = useModuleAccess();
  const canEdit = hasModule('PRODUCTION_TRAINING', 'EDIT');

  const [view, setView] = useState<'month' | 'day'>('month');
  const [focusDate, setFocusDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dayDetail, setDayDetail] = useState<Date | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editEvent, setEditEvent] = useState<CalendarEvent | null>(null);

  const { rangeFrom, rangeTo, gridStart, gridEnd } = useMemo(() => {
    if (view === 'month') {
      const gs = startOfWeek(startOfMonth(focusDate));
      const ge = endOfWeek(endOfMonth(focusDate));
      return { rangeFrom: gs, rangeTo: ge, gridStart: gs, gridEnd: ge };
    }
    return { rangeFrom: focusDate, rangeTo: focusDate, gridStart: focusDate, gridEnd: focusDate };
  }, [view, focusDate]);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/api/calendar', {
        params: { from: toDateStr(rangeFrom), to: toDateStr(rangeTo) },
      });
      setEvents(data.data.events);
    } catch (err: unknown) {
      setError(errMsg(err, 'Could not load the calendar.'));
    } finally {
      setLoading(false);
    }
  }, [rangeFrom, rangeTo]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const list = map.get(e.date) || [];
      list.push(e);
      map.set(e.date, list);
    }
    for (const list of map.values()) {
      // All-day (leave) banners first, then timed events in start-time order.
      list.sort((a, b) => {
        if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
        return (a.startTime || '').localeCompare(b.startTime || '');
      });
    }
    return map;
  }, [events]);

  const weeks = useMemo(() => {
    const days: Date[] = [];
    for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d);
    const rows: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) rows.push(days.slice(i, i + 7));
    return rows;
  }, [gridStart, gridEnd]);

  const goToday = () => setFocusDate(new Date());
  const goPrev = () => setFocusDate((d) => (view === 'month' ? subMonths(d, 1) : addDays(d, -1)));
  const goNext = () => setFocusDate((d) => (view === 'month' ? addMonths(d, 1) : addDays(d, 1)));
  const openDay = (d: Date) => { setFocusDate(d); setView('day'); };

  const handleEventClick = (e: CalendarEvent) => {
    if (canEdit && e.type === 'BATCH_SCHEDULE') setEditEvent(e);
  };

  const handleSaved = () => {
    setShowCreate(false);
    setEditEvent(null);
    setDayDetail(null);
    fetchEvents();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={goToday} className="px-3 py-1.5 text-sm font-medium border rounded-lg hover:bg-muted">
            Today
          </button>
          <button onClick={goPrev} className="p-1.5 border rounded-lg hover:bg-muted"><ChevronLeft className="w-4 h-4" /></button>
          <button onClick={goNext} className="p-1.5 border rounded-lg hover:bg-muted"><ChevronRight className="w-4 h-4" /></button>
          <h2 className="text-lg font-semibold ml-1">
            {view === 'month' ? format(focusDate, 'MMMM yyyy') : format(focusDate, 'EEEE, d MMMM yyyy')}
          </h2>
          {loading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Plus className="w-4 h-4" /> Create
            </button>
          )}
          <div className="flex items-center gap-1 border rounded-lg p-1 bg-muted/40">
            <button
              onClick={() => setView('month')}
              className={cn('px-3 py-1 text-sm rounded-md font-medium', view === 'month' ? 'bg-white shadow-sm' : 'text-muted-foreground')}
            >
              Month
            </button>
            <button
              onClick={() => setView('day')}
              className={cn('px-3 py-1 text-sm rounded-md font-medium', view === 'day' ? 'bg-white shadow-sm' : 'text-muted-foreground')}
            >
              Day
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        {(Object.keys(TYPE_STYLES) as CalendarEventType[]).map((t) => (
          <span key={t} className="flex items-center gap-1.5">
            <span className={cn('w-2 h-2 rounded-full', TYPE_STYLES[t].dot)} />
            {TYPE_STYLES[t].label}
          </span>
        ))}
        {canEdit && <span className="text-muted-foreground/70">· Click a Batch Class to edit it</span>}
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200">{error}</div>
      )}

      {view === 'month' ? (
        <div className="border rounded-xl overflow-hidden bg-white">
          <div className="grid grid-cols-7 bg-muted/50 border-b">
            {DAY_LABELS.map((d) => (
              <div key={d} className="px-2 py-2 text-xs font-semibold text-center text-muted-foreground">{d}</div>
            ))}
          </div>
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 border-b last:border-b-0">
              {week.map((day) => {
                const dateStr = toDateStr(day);
                const dayEvents = eventsByDate.get(dateStr) || [];
                const visible = dayEvents.slice(0, 3);
                const overflow = dayEvents.length - visible.length;
                const inMonth = isSameMonth(day, focusDate);
                return (
                  <div
                    key={dateStr}
                    onClick={() => openDay(day)}
                    className={cn(
                      'min-h-[92px] p-1.5 border-r last:border-r-0 cursor-pointer hover:bg-blue-50/40 transition-colors flex flex-col gap-1',
                      !inMonth && 'bg-muted/20'
                    )}
                  >
                    <span
                      className={cn(
                        'text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full',
                        isToday(day) ? 'bg-blue-600 text-white' : inMonth ? 'text-foreground' : 'text-muted-foreground/50'
                      )}
                    >
                      {format(day, 'd')}
                    </span>
                    <div className="space-y-0.5">
                      {visible.map((e) => {
                        const clickable = canEdit && e.type === 'BATCH_SCHEDULE';
                        return (
                          <div
                            key={e.id}
                            title={e.title}
                            onClick={clickable ? (ev) => { ev.stopPropagation(); handleEventClick(e); } : undefined}
                            className={cn(
                              'text-[10px] px-1.5 py-0.5 rounded border truncate',
                              TYPE_STYLES[e.type].chip,
                              clickable && 'hover:ring-1 hover:ring-blue-400 cursor-pointer'
                            )}
                          >
                            {!e.allDay && e.startTime && <span className="font-medium">{formatTimeLabel(e.startTime)} </span>}
                            {e.title}
                          </div>
                        );
                      })}
                      {overflow > 0 && (
                        <div
                          onClick={(ev) => { ev.stopPropagation(); setDayDetail(day); }}
                          className="text-[10px] text-blue-700 font-medium px-1.5 hover:underline"
                        >
                          +{overflow} more
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ) : (
        <DayTimeline events={eventsByDate.get(toDateStr(focusDate)) || []} canEdit={canEdit} onEventClick={handleEventClick} />
      )}

      {dayDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setDayDetail(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[70vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b flex items-center justify-between sticky top-0 bg-white">
              <h3 className="font-semibold text-sm">{format(dayDetail, 'EEEE, d MMMM yyyy')}</h3>
              <button onClick={() => setDayDetail(null)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3 space-y-2">
              {(eventsByDate.get(toDateStr(dayDetail)) || []).map((e) => (
                <EventRow key={e.id} event={e} canEdit={canEdit} onClick={handleEventClick} />
              ))}
            </div>
          </div>
        </div>
      )}

      {showCreate && (
        <ScheduleFormModal mode="create" onClose={() => setShowCreate(false)} onSaved={handleSaved} defaultDate={focusDate} />
      )}
      {editEvent && (
        <ScheduleFormModal
          key={editEvent.id}
          mode="edit"
          event={editEvent}
          onClose={() => setEditEvent(null)}
          onSaved={handleSaved}
          defaultDate={focusDate}
        />
      )}
    </div>
  );
}

function EventRow({ event, canEdit, onClick }: { event: CalendarEvent; canEdit: boolean; onClick: (e: CalendarEvent) => void }) {
  const style = TYPE_STYLES[event.type];
  const clickable = canEdit && event.type === 'BATCH_SCHEDULE';
  return (
    <div
      onClick={clickable ? () => onClick(event) : undefined}
      className={cn('rounded-lg border p-2.5 text-sm', style.chip, clickable && 'cursor-pointer hover:ring-1 hover:ring-blue-400')}
    >
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5 font-medium">
          <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', style.dot)} />
          {event.title}
        </div>
        {clickable && <Pencil className="w-3 h-3 opacity-60 shrink-0" />}
      </div>
      {event.subtitle && <div className="text-xs opacity-80 mt-0.5">{event.subtitle}</div>}
      <div className="text-xs opacity-70 mt-0.5">
        {event.allDay
          ? 'All day'
          : event.startTime && event.endTime
            ? `${formatTimeLabel(event.startTime)} – ${formatTimeLabel(event.endTime)}`
            : ''}
        {event.status && <span className="ml-2 uppercase tracking-wide">{event.status.replace(/_/g, ' ')}</span>}
      </div>
    </div>
  );
}

function DayTimeline({ events, canEdit, onEventClick }: { events: CalendarEvent[]; canEdit: boolean; onEventClick: (e: CalendarEvent) => void }) {
  const allDayEvents = events.filter((e) => e.allDay);
  const timedEvents = events.filter((e) => !e.allDay && e.startTime && e.endTime);
  const totalMinutes = (DAY_END_HOUR - DAY_START_HOUR) * 60;
  const timelineHeight = (DAY_END_HOUR - DAY_START_HOUR) * HOUR_PX;
  const hours = Array.from({ length: DAY_END_HOUR - DAY_START_HOUR + 1 }, (_, i) => DAY_START_HOUR + i);

  return (
    <div className="border rounded-xl bg-white overflow-hidden">
      {allDayEvents.length > 0 && (
        <div className="border-b p-2 space-y-1.5">
          {allDayEvents.map((e) => <EventRow key={e.id} event={e} canEdit={canEdit} onClick={onEventClick} />)}
        </div>
      )}
      {timedEvents.length === 0 && allDayEvents.length === 0 && (
        <div className="p-8 text-center text-sm text-muted-foreground">No events scheduled for this day.</div>
      )}
      {timedEvents.length > 0 && (
        <div className="relative flex" style={{ minHeight: `${timelineHeight}px` }}>
          <div className="w-16 shrink-0 border-r">
            {hours.map((h) => (
              <div key={h} className="text-right pr-2 text-[11px] text-muted-foreground -mt-2.5" style={{ height: HOUR_PX }}>
                {formatTimeLabel(`${String(h).padStart(2, '0')}:00`)}
              </div>
            ))}
          </div>
          <div className="flex-1 relative">
            {hours.map((h) => (
              <div key={h} className="border-b border-dashed border-muted" style={{ height: HOUR_PX }} />
            ))}
            {timedEvents.map((e) => {
              const rawStart = (timeToMinutes(e.startTime) ?? 0) - DAY_START_HOUR * 60;
              const rawEnd = (timeToMinutes(e.endTime) ?? totalMinutes) - DAY_START_HOUR * 60;
              const startMin = Math.max(0, rawStart);
              const endMin = Math.min(totalMinutes, rawEnd);
              const top = (startMin / totalMinutes) * timelineHeight;
              const height = Math.max(26, ((endMin - startMin) / totalMinutes) * timelineHeight);
              const style = TYPE_STYLES[e.type];
              const clickable = canEdit && e.type === 'BATCH_SCHEDULE';
              return (
                <div
                  key={e.id}
                  title={`${e.title}${e.subtitle ? ' — ' + e.subtitle : ''}`}
                  onClick={clickable ? () => onEventClick(e) : undefined}
                  className={cn(
                    'absolute left-2 right-2 rounded-lg border px-2 py-1 overflow-hidden',
                    style.chip,
                    clickable && 'cursor-pointer hover:ring-1 hover:ring-blue-400'
                  )}
                  style={{ top, height }}
                >
                  <div className="text-xs font-semibold truncate">{e.title}</div>
                  <div className="text-[10px] opacity-80 truncate">
                    {formatTimeLabel(e.startTime!)} – {formatTimeLabel(e.endTime!)}
                    {e.subtitle ? ` · ${e.subtitle}` : ''}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Create / quick-edit modal ───────────────────────────────────────────────
// Both modes post straight to Production's own existing endpoints — this
// component doesn't own any batch-schedule data of its own, it's just
// another door into the same POST/PUT Production already exposes.
function ScheduleFormModal({
  mode, event, defaultDate, onClose, onSaved,
}: {
  mode: 'create' | 'edit';
  event?: CalendarEvent;
  defaultDate: Date;
  onClose: () => void;
  onSaved: () => void;
}) {
  const meta = (event?.meta || {}) as Partial<ScheduleMeta>;

  const [batches, setBatches] = useState<BatchLite[]>([]);
  const [courses, setCourses] = useState<CourseLite[]>([]);
  const [batchId, setBatchId] = useState('');
  const [courseId, setCourseId] = useState(meta.courseId || '');
  const [timing, setTiming] = useState(meta.timing || 'MORNING');
  const [deliveryMode, setDeliveryMode] = useState(meta.mode || 'OFFLINE');
  const [startDate, setStartDate] = useState(meta.startDate || toDateStr(defaultDate));
  const [endDate, setEndDate] = useState(meta.endDate || '');
  const [startTime, setStartTime] = useState(meta.startTime || '');
  const [endTime, setEndTime] = useState(meta.endTime || '');
  const [capacity, setCapacity] = useState(meta.capacity != null ? String(meta.capacity) : '');
  const [selection, setSelection] = useState<boolean[]>(
    mode === 'edit' && meta.dayPattern ? patternToSelection(meta.dayPattern, meta.customWeekdays ?? null) : MON_SAT_SEL
  );
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (mode !== 'create') return;
    api.get('/api/production/batches').then((res) => setBatches(res.data.data.map((b: { id: string; code: string; status: string }) => ({ id: b.id, code: b.code, status: b.status })))).catch(() => setBatches([]));
    api.get('/api/production/courses').then((res) => setCourses(res.data.data.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })))).catch(() => setCourses([]));
  }, [mode]);

  const submit = async () => {
    const anyDaySelected = selection.some(Boolean);
    if (!anyDaySelected) { setFormError('Pick at least one day of the week.'); return; }
    if (!startDate) { setFormError('Start date is required.'); return; }
    if (mode === 'create' && (!batchId || !courseId)) { setFormError('Select a batch and a course.'); return; }

    const { dayPattern, customWeekdays } = selectionToPattern(selection);
    setSaving(true);
    setFormError('');
    try {
      if (mode === 'create') {
        await api.post(`/api/production/batches/${batchId}/schedules`, {
          courseId, timing, mode: deliveryMode, dayPattern, customWeekdays,
          startDate, endDate: endDate || undefined,
          startTime: startTime || undefined, endTime: endTime || undefined,
          capacity: capacity || undefined,
        });
      } else {
        await api.put(`/api/production/schedules/${meta.scheduleId}`, {
          dayPattern, customWeekdays,
          startDate, endDate: endDate === '' ? '' : endDate,
          startTime: startTime || undefined, endTime: endTime || undefined,
        });
      }
      onSaved();
    } catch (err) {
      setFormError(errMsg(err, mode === 'create' ? 'Failed to create the schedule.' : 'Failed to update the schedule.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0">
          <h2 className="font-semibold text-lg">{mode === 'create' ? 'New Batch Class' : 'Edit Class Schedule'}</h2>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-3 overflow-y-auto">
          {mode === 'edit' && (
            <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-800">
              Editing <span className="font-medium">{event?.title}</span> — changes apply to the whole recurring series, not just this one day.
            </div>
          )}

          {mode === 'create' && (
            <>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Batch *</label>
                <select className="w-full px-3 py-2 border rounded-lg text-sm mt-1" value={batchId} onChange={(e) => setBatchId(e.target.value)}>
                  <option value="">Select an existing batch</option>
                  {batches.map((b) => <option key={b.id} value={b.id}>{b.code} ({b.status})</option>)}
                </select>
                <p className="text-[11px] text-muted-foreground mt-1">No batch yet? Create one first in Production or Admission, then come back here to schedule it.</p>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Course *</label>
                <select className="w-full px-3 py-2 border rounded-lg text-sm mt-1" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
                  <option value="">Select a course</option>
                  {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Timing</label>
                  <select className="w-full px-3 py-2 border rounded-lg text-sm mt-1" value={timing} onChange={(e) => setTiming(e.target.value)}>
                    <option value="MORNING">Morning</option>
                    <option value="AFTERNOON">Afternoon</option>
                    <option value="EVENING">Evening</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Mode</label>
                  <select className="w-full px-3 py-2 border rounded-lg text-sm mt-1" value={deliveryMode} onChange={(e) => setDeliveryMode(e.target.value)}>
                    <option value="ONLINE">Online</option>
                    <option value="OFFLINE">Offline</option>
                    <option value="HYBRID">Hybrid</option>
                  </select>
                </div>
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Start time</label>
              <input type="time" className="w-full px-3 py-2 border rounded-lg text-sm mt-1" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">End time</label>
              <input type="time" className="w-full px-3 py-2 border rounded-lg text-sm mt-1" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>

          <WeekdayPicker selection={selection} onChange={setSelection} />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Start date *</label>
              <input type="date" className="w-full px-3 py-2 border rounded-lg text-sm mt-1" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">End date</label>
              <input type="date" className="w-full px-3 py-2 border rounded-lg text-sm mt-1" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              <p className="text-[11px] text-muted-foreground mt-1">Leave blank for an ongoing batch.</p>
            </div>
          </div>

          {mode === 'create' && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">Capacity</label>
              <input type="number" min={1} className="w-full px-3 py-2 border rounded-lg text-sm mt-1" value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="Optional seat cap" />
            </div>
          )}

          {formError && <div className="p-2.5 rounded-lg bg-red-50 text-red-700 text-xs border border-red-200">{formError}</div>}
        </div>
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium border rounded-lg hover:bg-muted">Cancel</button>
          <button
            onClick={submit}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? 'Saving…' : mode === 'create' ? 'Create' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
