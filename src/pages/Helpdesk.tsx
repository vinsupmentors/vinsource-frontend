import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { useRole, useAuth } from '@/hooks/useAuth';
import { formatDate } from '@/lib/utils';
import {
  HelpCircle, Plus, Loader2, AlertCircle, CheckCircle2,
  X, MessageSquare, ChevronDown, Clock, Search
} from 'lucide-react';
import { cn } from '@/lib/utils';

type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

interface TicketComment {
  id: string;
  authorId: string;
  comment: string;
  createdAt: string;
}

interface Ticket {
  id: string;
  subject: string;
  description: string;
  priority: TicketPriority;
  status: TicketStatus;
  createdAt: string;
  resolvedAt?: string;
  department?: { name: string };
  employee?: { id: string; firstName: string; lastName: string; employeeCode: string };
  comments: TicketComment[];
  _count?: { comments: number };
}

const STATUS_COLORS: Record<TicketStatus, string> = {
  OPEN: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400',
  IN_PROGRESS: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  RESOLVED: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400',
  CLOSED: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

const PRIORITY_COLORS: Record<TicketPriority, string> = {
  LOW: 'text-gray-500',
  MEDIUM: 'text-amber-600',
  HIGH: 'text-orange-600',
  CRITICAL: 'text-red-600',
};

export default function HelpdeskPage() {
  const { can } = useRole();
  const { user } = useAuth();
  const isManager = can('MANAGER');

  const [myTickets, setMyTickets] = useState<Ticket[]>([]);
  const [allTickets, setAllTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [tab, setTab] = useState<'my' | 'all'>('my');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [comment, setComment] = useState('');
  const [sendingComment, setSendingComment] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({ subject: '', description: '', priority: 'MEDIUM' });

  const fetchMy = useCallback(async () => {
    const r = await api.get<{ data: Ticket[] }>('/api/helpdesk/my');
    setMyTickets(r.data.data ?? []);
  }, []);

  const fetchAll = useCallback(async () => {
    const q = statusFilter ? `?status=${statusFilter}` : '';
    const r = await api.get<{ data: Ticket[] }>(`/api/helpdesk${q}`);
    setAllTickets(r.data.data ?? []);
  }, [statusFilter]);

  useEffect(() => {
    setLoading(true);
    const fetches = [fetchMy()];
    if (isManager) fetches.push(fetchAll());
    Promise.all(fetches).finally(() => setLoading(false));
  }, [fetchMy, fetchAll, isManager]);

  const flash = (msg: string) => { setSuccess(msg); setTimeout(() => setSuccess(''), 4000); };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/api/helpdesk', form);
      await fetchMy();
      setShowCreate(false);
      setForm({ subject: '', description: '', priority: 'MEDIUM' });
      flash('Ticket created successfully');
    } catch (e: any) { setError(e.response?.data?.message ?? 'Failed to create ticket'); }
    finally { setSubmitting(false); }
  };

  const handleComment = async () => {
    if (!selected || !comment.trim()) return;
    setSendingComment(true);
    try {
      await api.post(`/api/helpdesk/${selected.id}/comments`, { comment });
      const r = await api.get<{ data: Ticket }>(`/api/helpdesk/${selected.id}`);
      setSelected(r.data.data);
      setComment('');
      await Promise.all([fetchMy(), isManager ? fetchAll() : Promise.resolve()]);
    } catch (e: any) { setError(e.response?.data?.message ?? 'Failed to send comment'); }
    finally { setSendingComment(false); }
  };

  const handleStatusChange = async (ticketId: string, status: TicketStatus) => {
    try {
      const r = await api.put<{ data: Ticket }>(`/api/helpdesk/${ticketId}`, { status });
      setSelected(r.data.data);
      await Promise.all([fetchMy(), fetchAll()]);
      flash(`Ticket marked as ${status.replace(/_/g, ' ')}`);
    } catch (e: any) { setError(e.response?.data?.message ?? 'Update failed'); }
  };

  const openTicket = async (ticket: Ticket) => {
    const r = await api.get<{ data: Ticket }>(`/api/helpdesk/${ticket.id}`);
    setSelected(r.data.data);
  };

  const displayTickets = tab === 'my' ? myTickets : allTickets;
  const filtered = displayTickets.filter(t =>
    !search || t.subject.toLowerCase().includes(search.toLowerCase()) ||
    t.employee?.firstName?.toLowerCase().includes(search.toLowerCase()) ||
    t.employee?.lastName?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>;

  const inputCls = 'w-full px-3 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30';

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Helpdesk</h1>
          <p className="text-muted-foreground text-sm">Raise and track support tickets</p>
        </div>
        <div className="flex items-center gap-2">
          {isManager && (
            <div className="flex gap-1">
              <button onClick={() => setTab('my')} className={cn('px-3 py-2 text-sm font-medium rounded-lg', tab === 'my' ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/70')}>My Tickets</button>
              <button onClick={() => setTab('all')} className={cn('px-3 py-2 text-sm font-medium rounded-lg', tab === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/70')}>
                All Tickets {allTickets.filter(t => t.status === 'OPEN').length > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 text-[10px] bg-red-500 text-white rounded-full">{allTickets.filter(t => t.status === 'OPEN').length}</span>
                )}
              </button>
            </div>
          )}
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
          >
            <Plus className="w-4 h-4" /> New Ticket
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-500 p-3.5 bg-red-50 dark:bg-red-950/30 rounded-xl border border-red-200 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
          <button onClick={() => setError('')} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 text-green-600 p-3.5 bg-green-50 dark:bg-green-950/30 rounded-xl border border-green-200 text-sm">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> {success}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input className="w-full pl-9 pr-4 py-2.5 text-sm border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder="Search tickets…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {tab === 'all' && (
          <select className="px-3 py-2 text-sm border rounded-xl bg-background focus:outline-none" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All Status</option>
            <option value="OPEN">Open</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="RESOLVED">Resolved</option>
            <option value="CLOSED">Closed</option>
          </select>
        )}
      </div>

      {/* Ticket list */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <HelpCircle className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>{tab === 'my' ? 'No tickets raised yet' : 'No tickets found'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(ticket => (
            <div
              key={ticket.id}
              onClick={() => openTicket(ticket)}
              className="bg-card border rounded-xl p-4 cursor-pointer hover:shadow-sm transition-all hover:border-primary/30"
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', STATUS_COLORS[ticket.status])}>
                      {ticket.status.replace(/_/g, ' ')}
                    </span>
                    <span className={cn('text-[10px] font-semibold', PRIORITY_COLORS[ticket.priority])}>
                      ● {ticket.priority}
                    </span>
                    {tab === 'all' && ticket.employee && (
                      <span className="text-xs text-muted-foreground">{ticket.employee.firstName} {ticket.employee.lastName}</span>
                    )}
                  </div>
                  <p className="font-medium text-sm truncate">{ticket.subject}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{ticket.description}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-[10px] text-muted-foreground">{formatDate(ticket.createdAt)}</p>
                  {(ticket._count?.comments ?? ticket.comments?.length ?? 0) > 0 && (
                    <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground justify-end">
                      <MessageSquare className="w-3 h-3" />
                      {ticket._count?.comments ?? ticket.comments?.length}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Ticket detail drawer */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-start justify-end z-50">
          <div className="bg-card h-full w-full max-w-lg border-l flex flex-col shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-sm truncate">{selected.subject}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', STATUS_COLORS[selected.status])}>
                    {selected.status.replace(/_/g, ' ')}
                  </span>
                  <span className={cn('text-[10px] font-semibold', PRIORITY_COLORS[selected.priority])}>
                    ● {selected.priority}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                {isManager && selected.status !== 'CLOSED' && (
                  <div className="relative">
                    <select
                      value={selected.status}
                      onChange={e => handleStatusChange(selected.id, e.target.value as TicketStatus)}
                      className="appearance-none text-xs border rounded-lg px-2.5 py-1.5 bg-background focus:outline-none pr-6"
                    >
                      <option value="OPEN">Open</option>
                      <option value="IN_PROGRESS">In Progress</option>
                      <option value="RESOLVED">Resolved</option>
                      <option value="CLOSED">Closed</option>
                    </select>
                    <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                  </div>
                )}
                <button onClick={() => setSelected(null)} className="p-1.5 rounded-lg hover:bg-muted">
                  <X className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Ticket info */}
              <div className="space-y-2">
                {selected.employee && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground w-24 flex-shrink-0">Raised by</span>
                    <span>{selected.employee.firstName} {selected.employee.lastName} ({selected.employee.employeeCode})</span>
                  </div>
                )}
                {selected.department && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground w-24 flex-shrink-0">Department</span>
                    <span>{selected.department.name}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground w-24 flex-shrink-0">Created</span>
                  <span>{formatDate(selected.createdAt)}</span>
                </div>
                {selected.resolvedAt && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground w-24 flex-shrink-0">Resolved</span>
                    <span>{formatDate(selected.resolvedAt)}</span>
                  </div>
                )}
              </div>

              <div className="bg-muted/40 rounded-xl p-4">
                <p className="text-sm leading-relaxed">{selected.description}</p>
              </div>

              {/* Comments */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                  Comments ({selected.comments?.length ?? 0})
                </p>
                <div className="space-y-3">
                  {selected.comments?.length === 0 && (
                    <p className="text-xs text-muted-foreground">No comments yet. Be the first to respond.</p>
                  )}
                  {selected.comments?.map(c => {
                    const isMe = c.authorId === user?.id;
                    return (
                      <div key={c.id} className={cn('flex gap-2', isMe && 'flex-row-reverse')}>
                        <div className={cn(
                          'max-w-[80%] rounded-xl px-3.5 py-2.5 text-sm',
                          isMe
                            ? 'bg-primary text-primary-foreground rounded-tr-sm'
                            : 'bg-muted rounded-tl-sm'
                        )}>
                          <p>{c.comment}</p>
                          <p className={cn('text-[10px] mt-1 opacity-60', isMe ? 'text-right' : '')}>{formatDate(c.createdAt)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Comment input */}
            {selected.status !== 'CLOSED' && (
              <div className="border-t p-4 flex gap-2">
                <input
                  className="flex-1 px-3 py-2 text-sm border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="Type your reply…"
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleComment()}
                />
                <button
                  onClick={handleComment}
                  disabled={sendingComment || !comment.trim()}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                >
                  {sendingComment ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create ticket modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-card border rounded-2xl w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-semibold">Raise Support Ticket</h2>
              <button onClick={() => setShowCreate(false)}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">Subject *</label>
                <input className={inputCls} value={form.subject} onChange={e => setForm(f => ({...f, subject: e.target.value}))} placeholder="Brief description of the issue" required />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">Priority</label>
                <select className={inputCls} value={form.priority} onChange={e => setForm(f => ({...f, priority: e.target.value}))}>
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="CRITICAL">Critical</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">Description *</label>
                <textarea
                  className={`${inputCls} min-h-[100px] resize-none`}
                  value={form.description}
                  onChange={e => setForm(f => ({...f, description: e.target.value}))}
                  placeholder="Describe your issue in detail…"
                  required
                />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowCreate(false)} className="flex-1 py-2.5 text-sm border rounded-xl hover:bg-muted transition-colors">Cancel</button>
                <button type="submit" disabled={submitting} className="flex-1 py-2.5 text-sm font-medium bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 disabled:opacity-50">
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Submit Ticket'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
