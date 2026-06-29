import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { Payslip } from '@/types';
import { formatCurrency, MONTH_NAMES } from '@/lib/utils';
import { useRole } from '@/hooks/useAuth';
import { DollarSign, Download, Loader2, AlertCircle, FileText, Check, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PayrollBatch {
  id: string;
  month: number;
  year: number;
  status: string;
  createdAt: string;
  _count: { payslips: number };
}

const BATCH_STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  PENDING_REVIEW: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  APPROVED: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400',
  LOCKED: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400',
  PAID: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
};

const PAYSLIP_STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  PENDING_REVIEW: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  APPROVED: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400',
  PAID: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
};

export default function PayrollPage() {
  const { can } = useRole();

  // Employee view
  const [myPayslips, setMyPayslips] = useState<Payslip[]>([]);
  const [selectedSlip, setSelectedSlip] = useState<Payslip | null>(null);

  // HR/Admin batch view
  const [batches, setBatches] = useState<PayrollBatch[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<PayrollBatch | null>(null);
  const [batchSlips, setBatchSlips] = useState<Payslip[]>([]);
  const [batchSlipsLoading, setBatchSlipsLoading] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [processing, setProcessing] = useState(false);
  const [processForm, setProcessForm] = useState({
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (can('HR')) {
        const [myRes, allRes] = await Promise.all([
          api.get<{ data: Payslip[] }>('/api/payroll/my-payslips'),
          api.get<{ data: PayrollBatch[] }>('/api/payroll/'),
        ]);
        setMyPayslips(myRes.data.data ?? []);
        setBatches(allRes.data.data ?? []);
      } else {
        const myRes = await api.get<{ data: Payslip[] }>('/api/payroll/my-payslips');
        setMyPayslips(myRes.data.data ?? []);
      }
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'Failed to load payroll data');
    } finally {
      setLoading(false);
    }
  }, [can]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const loadBatchSlips = useCallback(async (batch: PayrollBatch) => {
    setSelectedBatch(batch);
    setSelectedSlip(null);
    setBatchSlipsLoading(true);
    try {
      const r = await api.get<{ data: Payslip[] }>(`/api/payroll/${batch.id}/payslips`);
      setBatchSlips(r.data.data ?? []);
    } catch {
      setBatchSlips([]);
    } finally {
      setBatchSlipsLoading(false);
    }
  }, []);

  const handleProcess = async () => {
    setProcessing(true);
    setError('');
    try {
      const r = await api.post<{ data: { payslipsCount: number } }>('/api/payroll/process', processForm);
      setSuccess(`Payroll processed for ${MONTH_NAMES[processForm.month - 1]} ${processForm.year} — ${r.data.data?.payslipsCount ?? 0} payslips generated`);
      setTimeout(() => setSuccess(''), 5000);
      fetchData();
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'Processing failed');
    } finally {
      setProcessing(false);
    }
  };

  const handleApprove = async (id: string) => {
    setError('');
    try {
      await api.put(`/api/payroll/${id}/approve`);
      setSuccess('Payroll approved! Employees will be notified.');
      setTimeout(() => setSuccess(''), 4000);
      setSelectedBatch(null);
      fetchData();
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'Failed to approve');
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Payroll</h1>
        <p className="text-muted-foreground text-sm">
          {can('HR') ? 'Process and manage company payroll' : 'View your payslips'}
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-3 text-red-500 p-3.5 bg-red-50 dark:bg-red-950/30 rounded-xl border border-red-200 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-3 text-green-600 p-3.5 bg-green-50 dark:bg-green-950/30 rounded-xl border border-green-200 text-sm">
          <Check className="w-4 h-4 flex-shrink-0" /> {success}
        </div>
      )}

      {/* ── HR / Admin view ── */}
      {can('HR') && (
        <>
          {/* Process payroll */}
          <div className="bg-card border rounded-xl p-5">
            <h2 className="font-semibold mb-4 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-green-500" /> Process Payroll
            </h2>
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">Month</label>
                <select
                  value={processForm.month}
                  onChange={(e) => setProcessForm((f) => ({ ...f, month: Number(e.target.value) }))}
                  className="px-3 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">Year</label>
                <input
                  type="number"
                  value={processForm.year}
                  min={2020} max={2030}
                  onChange={(e) => setProcessForm((f) => ({ ...f, year: Number(e.target.value) }))}
                  className="px-3 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 w-24"
                />
              </div>
              <button
                onClick={handleProcess}
                disabled={processing}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-60"
              >
                {processing && <Loader2 className="w-4 h-4 animate-spin" />}
                {processing ? 'Processing…' : 'Run Payroll'}
              </button>
            </div>
          </div>

          {/* Payroll batches */}
          <div className="flex gap-5">
            <div className="flex-1 min-w-0 bg-card border rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b bg-muted/30 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Payroll Runs
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/20 text-muted-foreground">
                    <th className="text-left px-5 py-3 font-medium">Period</th>
                    <th className="text-left px-5 py-3 font-medium">Employees</th>
                    <th className="text-left px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {batches.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-center py-16 text-muted-foreground">
                        <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        <p>No payroll runs yet</p>
                        <p className="text-xs mt-1">Use "Run Payroll" above to generate</p>
                      </td>
                    </tr>
                  ) : batches.map((b) => (
                    <tr
                      key={b.id}
                      onClick={() => loadBatchSlips(b)}
                      className={cn(
                        'hover:bg-muted/30 transition-colors cursor-pointer',
                        selectedBatch?.id === b.id && 'bg-blue-50/50 dark:bg-blue-950/10'
                      )}
                    >
                      <td className="px-5 py-3 font-medium">
                        {MONTH_NAMES[b.month - 1]} {b.year}
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5" /> {b._count.payslips}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <span className={cn('text-xs font-medium px-2.5 py-1 rounded-full', BATCH_STATUS_COLORS[b.status] ?? BATCH_STATUS_COLORS.DRAFT)}>
                          {b.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        {can('ADMIN') && b.status === 'PENDING_REVIEW' && (
                          <button
                            onClick={() => handleApprove(b.id)}
                            className="text-xs px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                          >
                            Approve
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Selected batch info panel */}
            {selectedBatch && (
              <div className="w-64 bg-card border rounded-xl p-5 flex-shrink-0 h-fit sticky top-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-sm">
                    {MONTH_NAMES[selectedBatch.month - 1]} {selectedBatch.year}
                  </h3>
                  <button onClick={() => setSelectedBatch(null)} className="text-muted-foreground hover:text-foreground text-lg">×</button>
                </div>
                <div className="space-y-2.5 text-sm">
                  <SlipRow label="Status" value={selectedBatch.status.replace(/_/g, ' ')} />
                  <SlipRow label="Employees" value={String(selectedBatch._count.payslips)} />
                </div>
                {can('ADMIN') && selectedBatch.status === 'PENDING_REVIEW' && (
                  <button
                    onClick={() => handleApprove(selectedBatch.id)}
                    className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
                  >
                    <Check className="w-4 h-4" /> Approve Payroll
                  </button>
                )}
                {batchSlipsLoading && (
                  <div className="flex items-center justify-center mt-4">
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Employee payslip view (visible to all, including HR's own slips) ── */}
      <div>
        <h2 className="font-semibold mb-3">My Payslips</h2>
        <div className="flex gap-5">
          <div className="flex-1 min-w-0 bg-card border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-muted-foreground">
                  <th className="text-left px-5 py-3 font-medium">Period</th>
                  <th className="text-left px-5 py-3 font-medium">Gross</th>
                  <th className="text-left px-5 py-3 font-medium">Deductions</th>
                  <th className="text-left px-5 py-3 font-medium">Net Pay</th>
                  <th className="text-left px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {myPayslips.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-16 text-muted-foreground">
                      <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p>No payslips yet</p>
                      {can('HR') && <p className="text-xs mt-1">Run payroll above to generate</p>}
                    </td>
                  </tr>
                ) : myPayslips.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => { setSelectedSlip(p); setSelectedBatch(null); }}
                    className={cn(
                      'hover:bg-muted/30 transition-colors cursor-pointer',
                      selectedSlip?.id === p.id && 'bg-blue-50/50 dark:bg-blue-950/10'
                    )}
                  >
                    <td className="px-5 py-3 font-medium">{MONTH_NAMES[(p.month ?? 1) - 1]} {p.year}</td>
                    <td className="px-5 py-3 text-green-600 font-medium">{formatCurrency(p.grossSalary ?? 0)}</td>
                    <td className="px-5 py-3 text-red-500">{formatCurrency(p.totalDeductions ?? 0)}</td>
                    <td className="px-5 py-3 font-semibold">{formatCurrency(p.netSalary ?? 0)}</td>
                    <td className="px-5 py-3">
                      <span className={cn('text-xs font-medium px-2.5 py-1 rounded-full', PAYSLIP_STATUS_COLORS[p.payroll?.status ?? 'DRAFT'] ?? PAYSLIP_STATUS_COLORS.DRAFT)}>
                        {(p.payroll?.status ?? 'DRAFT').replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-5 py-3" />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Payslip detail panel */}
          {selectedSlip && (
            <div className="w-72 bg-card border rounded-xl p-5 flex-shrink-0 h-fit sticky top-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-sm">Payslip Detail</h3>
                <button onClick={() => setSelectedSlip(null)} className="text-muted-foreground hover:text-foreground text-lg leading-none">×</button>
              </div>
              <div className="text-center mb-4 pb-4 border-b">
                <p className="text-xs text-muted-foreground">{MONTH_NAMES[(selectedSlip.month ?? 1) - 1]} {selectedSlip.year}</p>
              </div>
              <div className="space-y-2.5 text-sm">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Earnings</p>
                <SlipRow label="Basic" value={formatCurrency(selectedSlip.basic ?? 0)} />
                <SlipRow label="HRA" value={formatCurrency(selectedSlip.hra ?? 0)} />
                {(selectedSlip.conveyance ?? 0) > 0 && <SlipRow label="Conveyance" value={formatCurrency(selectedSlip.conveyance!)} />}
                {(selectedSlip.medicalAllowance ?? 0) > 0 && <SlipRow label="Medical" value={formatCurrency(selectedSlip.medicalAllowance!)} />}
                {(selectedSlip.specialAllowance ?? 0) > 0 && <SlipRow label="Special Allow." value={formatCurrency(selectedSlip.specialAllowance!)} />}
                {(selectedSlip.bonus ?? 0) > 0 && <SlipRow label="Bonus" value={formatCurrency(selectedSlip.bonus!)} />}
                {(selectedSlip.incentives ?? 0) > 0 && <SlipRow label="Incentives" value={formatCurrency(selectedSlip.incentives!)} />}
                <SlipRow label="Gross" value={formatCurrency(selectedSlip.grossSalary ?? 0)} bold />

                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mt-3 mb-2">Deductions</p>
                <SlipRow label="PF" value={`-${formatCurrency(selectedSlip.pf ?? 0)}`} red />
                {(selectedSlip.esi ?? 0) > 0 && <SlipRow label="ESI" value={`-${formatCurrency(selectedSlip.esi!)}`} red />}
                {(selectedSlip.professionalTax ?? 0) > 0 && <SlipRow label="Prof. Tax" value={`-${formatCurrency(selectedSlip.professionalTax!)}`} red />}
                {(selectedSlip.tds ?? 0) > 0 && <SlipRow label="TDS" value={`-${formatCurrency(selectedSlip.tds!)}`} red />}
                {(selectedSlip.lopDeduction ?? 0) > 0 && (
                  <SlipRow label={`LOP (${selectedSlip.lopDays ?? 0}d)`} value={`-${formatCurrency(selectedSlip.lopDeduction)}`} red />
                )}
                <div className="border-t pt-2.5 mt-2">
                  <SlipRow label="Net Pay" value={formatCurrency(selectedSlip.netSalary ?? 0)} bold big />
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-muted-foreground border-t pt-3">
                <div><span className="block text-[10px] uppercase tracking-wide">Present</span><span className="font-medium text-foreground">{selectedSlip.presentDays ?? 0}d</span></div>
                <div><span className="block text-[10px] uppercase tracking-wide">Working Days</span><span className="font-medium text-foreground">{selectedSlip.workingDays ?? 0}d</span></div>
                {(selectedSlip.overtimeHours ?? 0) > 0 && <div><span className="block text-[10px] uppercase tracking-wide">Overtime</span><span className="font-medium text-foreground">{selectedSlip.overtimeHours}h</span></div>}
                {(selectedSlip.lopDays ?? 0) > 0 && <div><span className="block text-[10px] uppercase tracking-wide">LOP Days</span><span className="font-medium text-red-500">{selectedSlip.lopDays}d</span></div>}
              </div>
              <button
                onClick={() => {
                  const s = selectedSlip;
                  const w = window.open('', '_blank');
                  if (!w || !s) return;
                  w.document.write(`<html><head><title>Payslip</title><style>body{font-family:sans-serif;padding:32px;max-width:600px;margin:auto}h2{margin:0}table{width:100%;border-collapse:collapse;margin-top:16px}td{padding:6px 8px;border:1px solid #ddd;font-size:13px}tr:nth-child(even){background:#f9f9f9}.label{color:#666;width:55%}.total{font-weight:bold;background:#f0f0f0!important}</style></head><body>
                  <h2>Payslip — ${MONTH_NAMES[(s.month ?? 1) - 1]} ${s.year}</h2>
                  <p style="color:#666;font-size:13px">${(s as any).employee ? `${(s as any).employee.firstName} ${(s as any).employee.lastName} · ${(s as any).employee.employeeCode}` : ''}</p>
                  <table>
                  <tr><td class="label">Gross Salary</td><td>₹${(s.grossSalary ?? 0).toLocaleString('en-IN')}</td></tr>
                  <tr><td class="label">Basic</td><td>₹${(s.basic ?? 0).toLocaleString('en-IN')}</td></tr>
                  <tr><td class="label">HRA</td><td>₹${(s.hra ?? 0).toLocaleString('en-IN')}</td></tr>
                  <tr><td class="label">Conveyance</td><td>₹${(s.conveyance ?? 0).toLocaleString('en-IN')}</td></tr>
                  <tr><td class="label">Medical Allowance</td><td>₹${(s.medicalAllowance ?? 0).toLocaleString('en-IN')}</td></tr>
                  <tr><td class="label">PF Deduction</td><td>-₹${(s.pf ?? 0).toLocaleString('en-IN')}</td></tr>
                  <tr><td class="label">Professional Tax</td><td>-₹${(s.professionalTax ?? 0).toLocaleString('en-IN')}</td></tr>
                  <tr><td class="label">TDS</td><td>-₹${(s.tds ?? 0).toLocaleString('en-IN')}</td></tr>
                  <tr><td class="label">LOP Deduction</td><td>-₹${(s.lopDeduction ?? 0).toLocaleString('en-IN')}</td></tr>
                  <tr class="total"><td>Net Pay</td><td>₹${(s.netSalary ?? 0).toLocaleString('en-IN')}</td></tr>
                  </table>
                  <p style="font-size:11px;color:#aaa;margin-top:24px">Generated by HRMS · ${new Date().toLocaleDateString('en-IN')}</p>
                  </body></html>`);
                  w.document.close();
                  w.print();
                }}
                className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                <Download className="w-4 h-4" /> Download PDF
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SlipRow({ label, value, bold, red, big }: {
  label: string; value: string; bold?: boolean; red?: boolean; big?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className={cn('font-medium text-xs', bold && 'font-semibold', big && 'text-base', red && 'text-red-500')}>
        {value}
      </span>
    </div>
  );
}
