'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { Payslip } from '@/types';
import { formatCurrency } from '@/lib/utils';
import { DollarSign, TrendingDown, TrendingUp, Loader2, Eye, X } from 'lucide-react';
import { MONTH_NAMES } from '@/lib/utils';

export default function PayrollPage() {
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Payslip | null>(null);

  useEffect(() => {
    api.get('/api/payroll/my-payslips')
      .then(({ data }) => setPayslips(data.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary mt-24" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Payroll & Payslips</h1>
        <p className="text-muted-foreground text-sm">View your salary slips and earnings history</p>
      </div>

      {payslips.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: 'Latest Gross', value: formatCurrency(payslips[0].grossSalary), icon: TrendingUp, color: 'text-green-600' },
            { label: 'Deductions', value: formatCurrency(payslips[0].totalDeductions), icon: TrendingDown, color: 'text-red-500' },
            { label: 'Net Salary', value: formatCurrency(payslips[0].netSalary), icon: DollarSign, color: 'text-blue-600' },
          ].map((s) => (
            <div key={s.label} className="bg-white dark:bg-gray-900 border rounded-xl p-5">
              <div className="flex items-center gap-3">
                <s.icon className={`w-8 h-8 ${s.color}`} />
                <div>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="text-xl font-bold">{s.value}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white dark:bg-gray-900 rounded-xl border">
        <div className="px-5 py-4 border-b">
          <h2 className="font-semibold">Payslip History</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left px-5 py-3 text-muted-foreground font-medium">Period</th>
                <th className="text-left px-5 py-3 text-muted-foreground font-medium">Gross</th>
                <th className="text-left px-5 py-3 text-muted-foreground font-medium">Deductions</th>
                <th className="text-left px-5 py-3 text-muted-foreground font-medium">Net Pay</th>
                <th className="text-left px-5 py-3 text-muted-foreground font-medium">LOP Days</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {payslips.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">No payslips yet</td></tr>
              ) : payslips.map((p) => (
                <tr key={p.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-3 font-medium">{MONTH_NAMES[p.month - 1]} {p.year}</td>
                  <td className="px-5 py-3 text-green-600">{formatCurrency(p.grossSalary)}</td>
                  <td className="px-5 py-3 text-red-500">{formatCurrency(p.totalDeductions)}</td>
                  <td className="px-5 py-3 font-semibold">{formatCurrency(p.netSalary)}</td>
                  <td className="px-5 py-3 text-orange-600">{p.lopDays}</td>
                  <td className="px-5 py-3">
                    <button onClick={() => setSelected(p)} className="flex items-center gap-1 text-blue-600 hover:underline text-xs">
                      <Eye className="w-3.5 h-3.5" /> View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payslip Detail Modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-semibold">Payslip — {MONTH_NAMES[selected.month - 1]} {selected.year}</h2>
              <button onClick={() => setSelected(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Earnings</h3>
                <div className="space-y-2">
                  {[
                    ['Basic', selected.basic],
                    ['HRA', selected.hra],
                    ['Conveyance', selected.conveyance],
                    ['Medical Allowance', selected.medicalAllowance],
                    ['Special Allowance', selected.specialAllowance],
                    ['Bonus', selected.bonus],
                    ['Incentives', selected.incentives],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{label}</span>
                      <span>{formatCurrency(Number(value))}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-sm font-semibold border-t pt-2">
                    <span>Gross Salary</span>
                    <span className="text-green-600">{formatCurrency(selected.grossSalary)}</span>
                  </div>
                </div>
              </div>
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Deductions</h3>
                <div className="space-y-2">
                  {[
                    ['PF', selected.pf],
                    ['ESI', selected.esi],
                    ['Professional Tax', selected.professionalTax],
                    ['TDS', selected.tds],
                    ['LOP Deduction', selected.lopDeduction],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="text-red-500">- {formatCurrency(Number(value))}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-sm font-semibold border-t pt-2">
                    <span>Total Deductions</span>
                    <span className="text-red-500">- {formatCurrency(selected.totalDeductions)}</span>
                  </div>
                </div>
              </div>
              <div className="bg-blue-50 dark:bg-blue-950/30 rounded-xl p-4">
                <div className="flex justify-between font-bold text-lg">
                  <span>Net Pay</span>
                  <span className="text-blue-600">{formatCurrency(selected.netSalary)}</span>
                </div>
                <div className="flex gap-6 mt-2 text-xs text-muted-foreground">
                  <span>Days Worked: {selected.presentDays}/{selected.workingDays}</span>
                  <span>LOP: {selected.lopDays} days</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
