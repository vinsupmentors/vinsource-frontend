import CalendarView from '@/components/calendar/CalendarView';

// Student-facing Calendar page — same shared CalendarView as the staff
// page. The backend already limits a student to their own batch's classes
// (via StudentBatchEnrollment) and never returns leave events for a
// student role, so nothing here needs to filter anything further.
export default function StudentCalendarPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Calendar</h1>
        <p className="text-sm text-muted-foreground">Your batch's classes, month by month.</p>
      </div>
      <CalendarView />
    </div>
  );
}
