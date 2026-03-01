import { Timestamp } from 'firebase/firestore';

/**
 * Convert Firestore Timestamp, Date, string, or number to JS Date.
 * Returns null for invalid input.
 */
export function toDate(value: unknown): Date | null {
  if (!value) return null;
  
  // Firestore Timestamp
  if (value instanceof Timestamp) {
    return value.toDate();
  }
  
  // Already a Date
  if (value instanceof Date) {
    return value;
  }
  
  // Object with toDate method (Firestore Timestamp-like)
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    const tsLike = value as { toDate: unknown };
    if (typeof tsLike.toDate === 'function') {
      return (tsLike.toDate as () => Date)();
    }
  }

  // Object with seconds (Firestore Timestamp serialized)
  if (typeof value === 'object' && value !== null && 'seconds' in value) {
    return new Date((value as { seconds: number }).seconds * 1000);
  }
  
  // String or number
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }
  
  return null;
}

/**
 * Format a date-like value to a localized string.
 */
export function formatDate(value: unknown, locale: string = 'tr-TR', options?: Intl.DateTimeFormatOptions): string {
  const date = toDate(value);
  if (!date) return '-';
  
  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...options,
  };
  
  return date.toLocaleDateString(locale, defaultOptions);
}

/**
 * Format date only (no time).
 */
export function formatDateOnly(value: unknown, locale: string = 'tr-TR'): string {
  const date = toDate(value);
  if (!date) return '-';
  return date.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * Get relative time string (e.g., "2 saat önce").
 */
export function timeAgo(value: unknown, locale: string = 'tr'): string {
  const date = toDate(value);
  if (!date) return '-';
  
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (locale === 'tr') {
    if (diffMins < 1) return 'Az önce';
    if (diffMins < 60) return `${diffMins} dakika önce`;
    if (diffHours < 24) return `${diffHours} saat önce`;
    if (diffDays < 7) return `${diffDays} gün önce`;
    return formatDateOnly(date, 'tr-TR');
  }
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} minutes ago`;
  if (diffHours < 24) return `${diffHours} hours ago`;
  if (diffDays < 7) return `${diffDays} days ago`;
  return formatDateOnly(date, 'en-US');
}
