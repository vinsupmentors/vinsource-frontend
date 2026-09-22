import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import {
  LiveClass, LiveClassDashboard, STATUS_BADGE,
  formatTimeRange, formatClassDate, errMsg,
} from '@/lib/liveClasses';
import { Radio, Clock, CalendarClock, CheckCircle2, Loader2, X } from 'lucide-react';

type Tab = 'today' | 'upcoming' | 'completed';
const TABS: { id: Tab; label: string }[] = [
  { id: 'today', label: "Today" },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'completed', label: 'Completed' },
];

export default function StudentLiveClasses() {
  const [tab, setTab] = useState<Tab>('today');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Live Classes</h1>
        <p className="text-muted-foreground text-sm">Join your scheduled live sessions and catch up on class history.</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2 flex items-center justify-between">
          {error}<button onClick={() => setError('')}><X className="w-4 h-4" /></button>
        </div>
      )}

      <LiveNowBanner setError={setError} onJoin={(id) => navigate(`/live-classes/${id}/room`)} />

      <div className="flex gap-1 border-b overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition whitespace-nowrap ${tab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <ClassList view={tab} setError={setError} />
    </div>
  );
}

function LiveNowBanner({ setError, onJoin }: { setError: (s: string) => void; onJoin: (id: string) => void }) {
  const [data, setData] = useState<LiveClassDashboard | null>(null);

  const load = useCallback(() => {
    api.get('/api/live-classes/dashboard').then((r) => setData(r.data.data)).catch((err) => setError(errMsg(err, 'Could not check for live classes.')));
  }, [setError]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(load, 20000); return () => clearInterval(t); }, [load]);

  if (!data || data.live.length === 0) return null;

  return (
    <div className="space-y-3">
      {data.live.map((c) => (
        <div key={c.id} className="border-2 border-red-200 bg-red-50/50 rounded-xl p-4 flex items-center justify-between flex-wrap gap-3">
          <div>
            <span className="inline-flex items-center gap-1 text-xs font-bold text-red-700 mb-1"><Radio className="w-3 h-3 animate-pulse" /> LIVE NOW</span>
            <p className="font-semibold text-sm">{c.schedule.course.name} — {c.title}</p>
            <p className="text-xs text-muted-foreground">{formatTimeRange(c.startTime, c.endTime)} · Trainer: {c.createdBy ? `${c.createdBy.firstName} ${c.createdBy.lastName}` : '—'}</p>
          </div>
          <button onClick={() => onJoin(c.id)} className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white font-medium">Join Class</button>
        </div>
      ))}
    </div>
  );
}

function ClassList({ view, setError }: { view: Tab; setError: (s: string) => void }) {
  const [classes, setClasses] = useState<LiveClass[] | null>(null);
  const navigate = useNavigate();

  const load = useCallback(() => {
    api.get('/api/live-classes', { params: { view } }).then((r) => setClasses(r.data.data)).catch((err) => setError(errMsg(err, 'Could not load classes.')));
  }, [view, setError]);
  useEffect(() => { load(); }, [load]);

  if (classes === null) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-blue-600" /></div>;
  if (classes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8 border rounded-xl">
        {view === 'today' && 'No classes today.'}
        {view === 'upcoming' && 'No upcoming classes scheduled yet.'}
        {view === 'completed' && "You haven't attended any classes yet."}
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {classes.map((c) => (
        <div key={c.id} className="border rounded-xl p-4 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold text-sm">{c.schedule.course.name}</p>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_BADGE[c.status]}`}>{c.status}</span>
          </div>
          <p className="text-sm">{c.title}{c.topic ? <span className="text-muted-foreground"> — {c.topic}</span> : null}</p>
          <p className="text-xs text-muted-foreground">Trainer: {c.createdBy ? `${c.createdBy.firstName} ${c.createdBy.lastName}` : '—'}</p>
          <p className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> {formatClassDate(c.scheduledDate)} · {formatTimeRange(c.startTime, c.endTime)}</p>
          {c.status === 'CANCELLED' && c.cancelReason && <p className="text-xs text-red-600">Cancelled: {c.cancelReason}</p>}

          <div className="pt-1">
            {c.status === 'LIVE' && (
              <button onClick={() => navigate(`/live-classes/${c.id}/room`)} className="w-full px-3 py-1.5 text-xs rounded-lg bg-red-600 text-white font-medium">Join Class</button>
            )}
            {c.status === 'SCHEDULED' && (
              <button disabled className="w-full px-3 py-1.5 text-xs rounded-lg border text-muted-foreground inline-flex items-center justify-center gap-1">
                <CalendarClock className="w-3 h-3" /> Not started yet
              </button>
            )}
            {c.status === 'COMPLETED' && (
              <button disabled className="w-full px-3 py-1.5 text-xs rounded-lg border text-muted-foreground inline-flex items-center justify-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Completed
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
