import CalendarView from '@/components/calendar/CalendarView';

// Staff-facing Calendar page (admin/trainers/other staff) — a thin wrapper
// around the shared CalendarView. All role-scoping happens server-side in
// GET /api/calendar, so this page has nothing of its own to configure.
export default function CalendarPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Calendar</h1>
        <p className="text-sm text-muted-foreground">
          Batch classes, Live Classes sessions, and approved leave in one place.
        </p>
      </div>
      <CalendarView />
    </div>
  );
}
