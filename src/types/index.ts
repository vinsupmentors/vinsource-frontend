export type Role =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'HR'
  | 'MANAGER'
  | 'EMPLOYEE'
  | 'STUDENT';

export interface StudentProfile {
  id: string;
  studentCode: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  photo?: string;
  track: 'JRP' | 'IOP' | 'PAP';
  status: string;
  joiningDate?: string;
  dateOfBirth?: string;
  gender?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  education?: { degree: string; institution: string; fieldOfStudy?: string; year?: string; grade?: string }[];
  aadharNumber?: string;
  aadharPhoto?: string;
  fatherName?: string;
  fatherPhone?: string;
  motherName?: string;
  motherPhone?: string;
  profileCompletedAt?: string | null;
}

export interface User {
  id: string;
  email: string;
  role: Role;
  isActive: boolean;
  canManageAccess?: boolean;
  mustChangePassword?: boolean;
  employee?: Employee;
  student?: StudentProfile | null;
  /** True if this user has at least one TrainerAssignment row — gates "My Training" in the sidebar. */
  isTrainer?: boolean;
}

export type ModuleName =
  | 'SALES'
  | 'FINANCE_SALES'
  | 'FINANCE_ADMIN'
  | 'ADMIN'
  | 'HR'
  | 'PRODUCTION_TRAINING'
  | 'PLACEMENTS'
  | 'DIGITAL_MARKETING'
  | 'CERTIFICATES';

export type AccessLevel = 'NONE' | 'VIEW' | 'EDIT' | 'ADMIN';

export type EffectiveAccessMap = Partial<Record<ModuleName, AccessLevel>>;

export interface Employee {
  id: string;
  userId: string;
  companyId: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  profilePhoto?: string;
  status: string;
  joiningDate: string;
  probationEndDate?: string;
  dateOfBirth?: string;
  gender?: string;
  bloodGroup?: string;
  maritalStatus?: string;
  managerId?: string;
  department?: { id: string; name: string };
  designation?: { id: string; name: string };
  branch?: { id: string; name: string };
  manager?: { id: string; firstName: string; lastName: string };
  user?: { id: string; email: string; role: Role };
  address?: EmployeeAddress;
  bankDetails?: BankDetail[];
  salaryStructure?: SalaryStructure;
}

export interface SalaryStructure {
  id: string;
  employeeId: string;
  netSalary: number;
  grossSalary: number;
  basic: number;
  hra: number;
  conveyance: number;
  medicalAllowance: number;
  specialAllowance: number;
  pf: number;
  esi: number;
  professionalTax: number;
  tds: number;
  effectiveDate: string;
}

export interface EmployeeAddress {
  id: string;
  current?: string;
  permanent?: string;
  city?: string;
  state?: string;
  country?: string;
  pincode?: string;
}

export interface BankDetail {
  id: string;
  accountNumber: string;
  ifscCode: string;
  bankName: string;
  accountType?: string;
  isPrimary: boolean;
}

export interface Attendance {
  id: string;
  date: string;
  checkIn?: string;
  checkOut?: string;
  status: 'PRESENT' | 'ABSENT' | 'HALF_DAY' | 'LATE' | 'ON_LEAVE' | 'LEAVE' | 'HOLIDAY' | 'WEEKEND';
  workHours?: number;
  overtimeHours?: number;
  isRegularized?: boolean;
}

export interface LeaveType {
  id: string;
  name: string;
  type?: string;
  maxDaysPerYear?: number;
  isPaid: boolean;
}

export interface LeaveBalance {
  id: string;
  year: number;
  totalDays: number;
  usedDays: number;
  pendingDays: number;
  leaveTypeId: string;
  leaveType: LeaveType;
  /** Computed: totalDays - usedDays - pendingDays */
  remaining?: number;
}

export interface LeaveRequest {
  id: string;
  startDate: string;
  endDate: string;
  /** Number of leave days (backend field is 'days') */
  days: number;
  totalDays?: number; // alias kept for backward compat
  reason?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'ESCALATED';
  leaveType: LeaveType;
  leaveTypeId?: string;
  employee?: {
    firstName: string;
    lastName: string;
    employeeCode: string;
    profilePhoto?: string;
  };
  managerNote?: string;
  createdAt: string;
}

export interface Payslip {
  id: string;
  payrollId?: string;
  employeeId?: string;
  month: number;
  year: number;
  payroll?: { status: string };
  status?: string;
  // Earnings — field names match Prisma schema exactly
  basic: number;
  hra: number;
  conveyance?: number;
  medicalAllowance?: number;
  specialAllowance?: number;
  bonus?: number;
  incentives?: number;
  grossSalary: number;
  // Deductions — field names match Prisma schema exactly
  pf: number;
  esi: number;
  professionalTax?: number;
  tds: number;
  loanRecovery?: number;
  lopDeduction: number;
  totalDeductions: number;
  // Net
  netSalary: number;
  // Attendance
  lopDays?: number;
  presentDays?: number;
  workingDays?: number;
  overtimeHours?: number;
  // PDF
  pdfUrl?: string;
  // Relations
  employee?: {
    id: string;
    firstName: string;
    lastName: string;
    employeeCode: string;
  };
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  data?: Record<string, unknown>;
  createdAt: string;
}

export interface DashboardStats {
  totalEmployees: number;
  activeEmployees: number;
  presentToday: number;
  onLeaveToday: number;
  pendingLeaves: number;
  newJoineeThisMonth: number;
  absentToday: number;
  upcomingBirthdays: { name: string; date: string }[];
  attendanceTrend: { date: string; count: number }[];
}

export interface ApiMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
