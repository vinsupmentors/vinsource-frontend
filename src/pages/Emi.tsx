import { EmiPanel } from './SalesOnboarding';

export default function EmiPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">EMI</h1>
        <p className="text-sm text-muted-foreground">Every EMI student: how much is paid, what is due next and what is overdue.</p>
      </div>
      <EmiPanel />
    </div>
  );
}
