import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, subMonths,
  format, isSameMonth, isToday,
} from 'date-fns';
import { ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@/lib/utils';

// Shared Google-Calendar-style view, consumed as-is by both the staff
// Calendar page and the student Calendar page (pages/Calendar.tsx,
// pages/student/StudentCalendar.tsx). Deliberately takes no props: it
// fetches straight from GET /api/calendar and lets the backend do all the
// role-scoping (admin sees everything, trainers/students see only their
// own batches — see calendar.controller.ts's selfScheduleScope), so the
// exact same component is correct for every audience the product decision
// named (admin, trainers, students) with zero role-branching in here.
// Read-only by design (per this pass's scope) — clicking an event shows
// its details, nothing here creates or edits anything.

type CalendarEventType = 'BATCH_SCHEDULE' | 'LIVE_CLASS' | 'LEAVE';

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

const TYPE_STYLES: Record<CalendarEventType, { chip: string; dot: string; label: string }> = {
  BATCH_SCHEDULE: { chip: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-500', label: 'Batch Class' },
  LIVE_CLASS: { chip: 'bg-violet-50 text-violet-700 border-violet-200', dot: 'bg-violet-500', label: 'Live Class' },
  LEAVE: { chip: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500', label: 'Leave' },
};

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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

export default function CalendarView() {
  const [view, setView] = useState<'month' | 'day'>('month');
  const [focusDate, setFocusDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dayDetail, setDayDetail] = useState<Date | null>(null);

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
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(message || 'Could not load the calendar.');
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

      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        {(Object.keys(TYPE_STYLES) as CalendarEventType[]).map((t) => (
          <span key={t} className="flex items-center gap-1.5">
            <span className={cn('w-2 h-2 rounded-full', TYPE_STYLES[t].dot)} />
            {TYPE_STYLES[t].label}
          </span>
        ))}
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
                      {visible.map((e) => (
                        <div
                          key={e.id}
                          title={e.title}
                          className={cn('text-[10px] px-1.5 py-0.5 rounded border truncate', TYPE_STYLES[e.type].chip)}
                        >
                          {!e.allDay && e.startTime && <span className="font-medium">{formatTimeLabel(e.startTime)} </span>}
                          {e.title}
                        </div>
                      ))}
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
        <DayTimeline events={eventsByDate.get(toDateStr(focusDate)) || []} />
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
                <EventRow key={e.id} event={e} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EventRow({ event }: { event: CalendarEvent }) {
  const style = TYPE_STYLES[event.type];
  return (
    <div className={cn('rounded-lg border p-2.5 text-sm', style.chip)}>
      <div className="flex items-center gap-1.5 font-medium">
        <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', style.dot)} />
        {event.title}
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

function DayTimeline({ events }: { events: CalendarEvent[] }) {
  const allDayEvents = events.filter((e) => e.allDay);
  const timedEvents = events.filter((e) => !e.allDay && e.startTime && e.endTime);
  const totalMinutes = (DAY_END_HOUR - DAY_START_HOUR) * 60;
  const timelineHeight = (DAY_END_HOUR - DAY_START_HOUR) * HOUR_PX;
  const hours = Array.from({ length: DAY_END_HOUR - DAY_START_HOUR + 1 }, (_, i) => DAY_START_HOUR + i);

  return (
    <div className="border rounded-xl bg-white overflow-hidden">
      {allDayEvents.length > 0 && (
        <div className="border-b p-2 space-y-1.5">
          {allDayEvents.map((e) => <EventRow key={e.id} event={e} />)}
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
              return (
                <div
                  key={e.id}
                  title={`${e.title}${e.subtitle ? ' — ' + e.subtitle : ''}`}
                  className={cn('absolute left-2 right-2 rounded-lg border px-2 py-1 overflow-hidden', style.chip)}
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
