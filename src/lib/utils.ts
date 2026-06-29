import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, formatDistanceToNow } from 'date-fns';

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export const formatDate = (date: string | Date) =>
  format(new Date(date), 'dd MMM yyyy');

export const formatDateTime = (date: string | Date) =>
  format(new Date(date), 'dd MMM yyyy, hh:mm a');

export const formatTime = (date: string | Date) =>
  format(new Date(date), 'hh:mm a');

export const timeAgo = (date: string | Date) =>
  formatDistanceToNow(new Date(date), { addSuffix: true });

export const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);

export const getInitials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const getRoleLabel = (role: string) =>
  role.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
