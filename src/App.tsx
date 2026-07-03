import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { RootState } from './store';

// Layout
import { DashboardLayout } from './components/layout/DashboardLayout';

// Pages
import LoginPage from './pages/Login';
import SetupPage from './pages/Setup';
import DashboardPage from './pages/Dashboard';
import MyProfilePage from './pages/MyProfile';
import CertificateGeneratorPage from './pages/CertificateGenerator';
import EmployeesPage from './pages/Employees';
import EmployeeDetailPage from './pages/EmployeeDetail';
import EmployeeReportPage from './pages/EmployeeReport';
import EmployeeMappingPage from './pages/EmployeeMapping';
import AttendancePage from './pages/Attendance';
import LeavePage from './pages/Leave';
import PayrollPage from './pages/Payroll';
import NotificationsPage from './pages/Notifications';
import DocumentsPage from './pages/Documents';
import AssetsPage from './pages/Assets';
import HelpdeskPage from './pages/Helpdesk';
import OrgSetupPage from './pages/OrgSetup';
import ReportsPage from './pages/Reports';
import LeaveRequestsPage from './pages/LeaveRequests';
import PermissionsPage from './pages/Permissions';
import MasterControlPage from './pages/MasterControl';
import FinanceAdminPage from './pages/FinanceAdmin';
import AdminOpsPage from './pages/AdminOps';
import PlacementsPage from './pages/Placements';
import ProductionPage from './pages/Production';
import { ModulePlaceholder } from './components/ModulePlaceholder';
import DigitalMarketingPage from './pages/DigitalMarketing';
import CampaignDetailPage from './pages/CampaignDetail';
import DigitalMarketingDayPage from './pages/DigitalMarketingDay';
import OnboardingPage from './pages/Onboarding';
import ChangePasswordPage from './pages/ChangePassword';
import OnboardingDetailPage from './pages/OnboardingDetail';
import ResignationPage from './pages/Resignation';
import ExitClearancePage from './pages/ExitClearance';
import MyTrainingPage from './pages/MyTraining';
import OrgChartPage from './pages/OrgChart';

// Student portal
import { StudentLayout } from './pages/student/StudentLayout';
import CompleteProfilePage from './pages/student/CompleteProfile';
import StudentDashboard from './pages/student/StudentDashboard';
import StudentAttendance from './pages/student/StudentAttendance';
import StudentTest from './pages/student/StudentTest';
import StudentCertificates from './pages/student/StudentCertificates';
import StudentPlacements from './pages/student/StudentPlacements';
import StudentProfile from './pages/student/StudentProfile';
import StudentCourseContent from './pages/student/StudentCourseContent';
import StudentRankCard from './pages/student/StudentRankCard';
import StudentReferFriend from './pages/student/StudentReferFriend';
import StudentProjects from './pages/student/StudentProjects';
import StudentFeedbackForms from './pages/student/StudentFeedbackForms';
import StudentPortfolio from './pages/student/StudentPortfolio';
import PublicPortfolioPage from './pages/PublicPortfolio';

// Toast — wraps the whole app so useToast() works everywhere
import { ToastProvider } from './components/ui/toaster';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = useSelector((s: RootState) => s.auth.token);
  return token ? <>{children}</> : <Navigate to="/login" replace />;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const token = useSelector((s: RootState) => s.auth.token);
  return !token ? <>{children}</> : <Navigate to="/dashboard" replace />;
}

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <Routes>
          {/* Public */}
          <Route
            path="/login"
            element={
              <PublicRoute>
                <LoginPage />
              </PublicRoute>
            }
          />

          {/* Standalone onboarding wizard — no sidebar/header, gates access to the dashboard */}
          <Route
            path="/setup"
            element={
              <PrivateRoute>
                <SetupPage />
              </PrivateRoute>
            }
          />

          {/* Force password change for first-time employees */}
          <Route
            path="/change-password"
            element={
              <PrivateRoute>
                <ChangePasswordPage />
              </PrivateRoute>
            }
          />

          {/* Standalone student onboarding wizard — no sidebar, gates access to the student portal */}
          <Route
            path="/student/complete-profile"
            element={
              <PrivateRoute>
                <CompleteProfilePage />
              </PrivateRoute>
            }
          />

          {/* Public, no-login portfolio page — this is what a scanned QR code / shared link opens */}
          <Route path="/portfolio/:slug" element={<PublicPortfolioPage />} />

          {/* Student portal routes */}
          <Route
            path="/student"
            element={
              <PrivateRoute>
                <StudentLayout />
              </PrivateRoute>
            }
          >
            <Route index element={<Navigate to="/student/dashboard" replace />} />
            <Route path="dashboard" element={<StudentDashboard />} />
            <Route path="attendance" element={<StudentAttendance />} />
            <Route path="test" element={<StudentTest />} />
            <Route path="certificates" element={<StudentCertificates />} />
            <Route path="placements" element={<StudentPlacements />} />
            <Route path="profile" element={<StudentProfile />} />
            <Route path="course-content" element={<StudentCourseContent />} />
            <Route path="rank-card" element={<StudentRankCard />} />
            <Route path="refer-friend" element={<StudentReferFriend />} />
            <Route path="projects" element={<StudentProjects />} />
            <Route path="feedback-forms" element={<StudentFeedbackForms />} />
            <Route path="portfolio" element={<StudentPortfolio />} />
            <Route path="marks" element={<Navigate to="/student/test" replace />} />
            <Route path="online-tests" element={<Navigate to="/student/test" replace />} />
            <Route path="feedback" element={<Navigate to="/student/feedback-forms" replace />} />
          </Route>

          {/* Protected dashboard routes */}
          <Route
            path="/"
            element={
              <PrivateRoute>
                <DashboardLayout />
              </PrivateRoute>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="profile" element={<MyProfilePage />} />
            <Route path="certificates" element={<CertificateGeneratorPage />} />
            <Route path="settings" element={<Navigate to="/profile" replace />} />
            <Route path="employees" element={<EmployeesPage />} />
            <Route path="employees/report" element={<EmployeeReportPage />} />
            <Route path="employees/mapping" element={<EmployeeMappingPage />} />
            <Route path="employees/:id" element={<EmployeeDetailPage />} />
            <Route path="attendance" element={<AttendancePage />} />
            <Route path="leave" element={<LeavePage />} />
            <Route path="payroll" element={<PayrollPage />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="documents" element={<DocumentsPage />} />
            <Route path="assets" element={<AssetsPage />} />
            <Route path="helpdesk" element={<HelpdeskPage />} />
            <Route path="org-setup" element={<OrgSetupPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="leave-requests" element={<LeaveRequestsPage />} />
            <Route path="permissions" element={<PermissionsPage />} />
            <Route path="master-control" element={<MasterControlPage />} />
            <Route path="sales" element={<ModulePlaceholder title="Sales" module="SALES" description="Leads, demos, and conversion pipeline" />} />
            <Route path="finance/sales" element={<ModulePlaceholder title="Finance (Sales)" module="FINANCE_SALES" description="Student fee collections and sales-side revenue" />} />
            <Route path="finance/admin" element={<FinanceAdminPage />} />
            <Route path="admin-ops" element={<AdminOpsPage />} />
            <Route path="production" element={<ProductionPage />} />
            <Route path="placements" element={<PlacementsPage />} />
            <Route path="digital-marketing" element={<DigitalMarketingPage />} />
            <Route path="digital-marketing/day/:date" element={<DigitalMarketingDayPage />} />
            <Route path="digital-marketing/:id" element={<CampaignDetailPage />} />
            <Route path="onboarding" element={<OnboardingPage />} />
            <Route path="onboarding/:id" element={<OnboardingDetailPage />} />
            <Route path="resignation" element={<ResignationPage />} />
            <Route path="exit-clearance/:id" element={<ExitClearancePage />} />
            <Route path="my-training" element={<MyTrainingPage />} />
            {/* Org Chart locked — <Route path="org-chart" element={<OrgChartPage />} /> */}
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
    </BrowserRouter>
  </ToastProvider>
  );
}
