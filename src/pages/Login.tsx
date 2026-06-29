import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '@/store';
import { login } from '@/store/slices/authSlice';
import { Building2, Loader2, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Login() {
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();
  const { loading, error } = useSelector((s: RootState) => s.auth);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);

  const demoAccounts = [
    { label: 'Super Admin', email: 'superadmin@hrms.com', password: 'Admin@123' },
    { label: 'HR Manager', email: 'hr@hrms.com', password: 'HR@1234' },
    { label: 'Manager', email: 'manager@hrms.com', password: 'Mgr@1234' },
    { label: 'Employee', email: 'employee@hrms.com', password: 'Emp@1234' },
  ];

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const result = await dispatch(login({ email, password }));
    if (login.fulfilled.match(result)) {
      const role = result.payload.user?.role;
      navigate(role === 'STUDENT' ? '/student/dashboard' : '/dashboard');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex w-16 h-16 bg-blue-600 rounded-2xl items-center justify-center shadow-lg mb-4">
            <Building2 className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Enterprise HRMS</h1>
          <p className="text-muted-foreground mt-1 text-sm">Sign in to your account</p>
        </div>

        {/* Card */}
        <div className="bg-card rounded-2xl shadow-xl border p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3 text-sm text-red-600 dark:text-red-400">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-1.5">Email address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition"
                placeholder="you@company.com"
                required
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2.5 pr-10 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className={cn(
                'w-full py-2.5 px-4 rounded-lg font-medium text-sm transition-all',
                'bg-blue-600 text-white hover:bg-blue-700 active:scale-[0.98] shadow-sm',
                'disabled:opacity-60 disabled:cursor-not-allowed',
                'flex items-center justify-center gap-2'
              )}
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          {/* Demo accounts */}
          <div className="mt-6 pt-5 border-t">
            <p className="text-xs text-muted-foreground mb-3 font-medium uppercase tracking-wide">Demo accounts</p>
            <div className="grid grid-cols-2 gap-2">
              {demoAccounts.map((a) => (
                <button
                  key={a.email}
                  onClick={() => { setEmail(a.email); setPassword(a.password); }}
                  className="text-left px-3 py-2 rounded-lg border bg-muted/40 hover:bg-muted transition-colors"
                >
                  <p className="text-xs font-semibold text-foreground">{a.label}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{a.email}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
