'use client';
import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { Eye, EyeOff, Building2, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const { signIn } = useAuth();
  const { loading, error } = useSelector((s: RootState) => s.auth);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await signIn(email, password);
  };

  const demoAccounts = [
    { label: 'Super Admin', email: 'superadmin@demo.com', password: 'Admin@123', color: 'bg-purple-100 text-purple-700' },
    { label: 'HR Manager', email: 'hr@demo.com', password: 'Hr@123456', color: 'bg-blue-100 text-blue-700' },
    { label: 'Manager', email: 'manager@demo.com', password: 'Manager@123', color: 'bg-green-100 text-green-700' },
    { label: 'Employee', email: 'employee@demo.com', password: 'Employee@123', color: 'bg-orange-100 text-orange-700' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4 shadow-lg">
            <Building2 className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">Enterprise HRMS</h1>
          <p className="text-slate-400 mt-1">Human Resource Management System</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-6">Sign In</h2>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                placeholder="you@company.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-4 py-3 pr-12 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold rounded-lg transition flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          {/* Demo accounts */}
          <div className="mt-6">
            <p className="text-xs text-gray-500 text-center mb-3">Quick access — Demo Accounts</p>
            <div className="grid grid-cols-2 gap-2">
              {demoAccounts.map((acc) => (
                <button
                  key={acc.label}
                  type="button"
                  onClick={() => { setEmail(acc.email); setPassword(acc.password); }}
                  className={`text-xs px-3 py-2 rounded-lg font-medium transition hover:opacity-80 ${acc.color}`}
                >
                  {acc.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <p className="text-center text-slate-500 text-sm mt-6">
          © {new Date().getFullYear()} Enterprise HRMS. All rights reserved.
        </p>
      </div>
    </div>
  );
}
