'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import api from '@/lib/api';
import { formatDate, getInitials } from '@/lib/utils';
import { ArrowLeft, Mail, Phone, Calendar, Building2, Loader2, User } from 'lucide-react';
import Link from 'next/link';

export default function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [employee, setEmployee] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    api.get(`/api/employees/${id}`)
      .then(({ data }) => setEmployee(data.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="flex justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary mt-24" /></div>;
  if (!employee) return <div className="text-center py-16 text-muted-foreground">Employee not found</div>;

  const emp = employee as Record<string, unknown> & {
    firstName: string; lastName: string; email: string; employeeCode: string;
    phone?: string; status: string; joiningDate: string; profilePhoto?: string;
    department?: { name: string }; designation?: { name: string }; branch?: { name: string };
    manager?: { firstName: string; lastName: string };
    address?: Record<string, string>;
    education?: unknown[];
    experience?: unknown[];
    certifications?: unknown[];
    emergencyContacts?: unknown[];
    bankDetails?: unknown[];
  };

  const fullName = `${emp.firstName} ${emp.lastName}`;

  const tabs = ['overview', 'education', 'experience', 'documents', 'bank'];

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link href="/employees" className="p-2 hover:bg-muted rounded-lg transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">{fullName}</h1>
          <p className="text-muted-foreground text-sm">{String(emp.employeeCode)}</p>
        </div>
      </div>

      {/* Profile card */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border p-6">
        <div className="flex items-start gap-5">
          <div className="w-20 h-20 bg-blue-100 text-blue-700 rounded-2xl flex items-center justify-center text-2xl font-bold flex-shrink-0">
            {getInitials(fullName)}
          </div>
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex items-center gap-2 text-sm">
              <Mail className="w-4 h-4 text-muted-foreground" />
              <span>{String(emp.email)}</span>
            </div>
            {emp.phone && (
              <div className="flex items-center gap-2 text-sm">
                <Phone className="w-4 h-4 text-muted-foreground" />
                <span>{String(emp.phone)}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-sm">
              <Building2 className="w-4 h-4 text-muted-foreground" />
              <span>{emp.department?.name || 'N/A'} · {emp.designation?.name || 'N/A'}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <span>Joined {formatDate(emp.joiningDate)}</span>
            </div>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${emp.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
            {String(emp.status).replace('_', ' ')}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b flex gap-0">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium capitalize border-b-2 transition-colors ${
              activeTab === tab ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border p-6">
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              ['Branch', emp.branch?.name],
              ['Manager', emp.manager ? `${emp.manager.firstName} ${emp.manager.lastName}` : 'None'],
              ['Employee Code', emp.employeeCode],
              ['Status', String(emp.status).replace('_', ' ')],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
                <p className="font-medium text-sm">{String(value || '-')}</p>
              </div>
            ))}
          </div>
        )}
        {activeTab === 'education' && (
          <div>
            {(Array.isArray(emp.education) ? emp.education : []).length === 0
              ? <p className="text-muted-foreground text-sm">No education records</p>
              : (emp.education as Record<string, unknown>[]).map((e, i) => (
                <div key={i} className="border-b last:border-0 py-3">
                  <p className="font-medium text-sm">{String(e.degree)}</p>
                  <p className="text-xs text-muted-foreground">{String(e.institution)} · {String(e.startYear || '')} – {String(e.endYear || 'Present')}</p>
                </div>
              ))
            }
          </div>
        )}
        {activeTab === 'experience' && (
          <div>
            {(Array.isArray(emp.experience) ? emp.experience : []).length === 0
              ? <p className="text-muted-foreground text-sm">No experience records</p>
              : (emp.experience as Record<string, unknown>[]).map((e, i) => (
                <div key={i} className="border-b last:border-0 py-3">
                  <p className="font-medium text-sm">{String(e.designation)} at {String(e.company)}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(String(e.startDate))} – {e.isCurrent ? 'Present' : formatDate(String(e.endDate))}</p>
                </div>
              ))
            }
          </div>
        )}
        {activeTab === 'documents' && <p className="text-muted-foreground text-sm">Documents will appear here</p>}
        {activeTab === 'bank' && (
          <div>
            {(Array.isArray(emp.bankDetails) ? emp.bankDetails : []).length === 0
              ? <p className="text-muted-foreground text-sm">No bank details</p>
              : (emp.bankDetails as Record<string, unknown>[]).map((b, i) => (
                <div key={i} className="border-b last:border-0 py-3">
                  <p className="font-medium text-sm">{String(b.bankName)}</p>
                  <p className="text-xs text-muted-foreground">A/C: {String(b.accountNumber)} · IFSC: {String(b.ifscCode)}</p>
                  {b.isPrimary && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full mt-1 inline-block">Primary</span>}
                </div>
              ))
            }
          </div>
        )}
      </div>
    </div>
  );
}
