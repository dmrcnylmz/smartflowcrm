import { Timestamp } from 'firebase/firestore';

// Helper to convert Firestore timestamps to Date objects
export function timestampToDate(timestamp: Timestamp | null | undefined): Date | null {
  if (!timestamp) return null;
  return timestamp.toDate();
}

// Helper to create Timestamp from Date
export function dateToTimestamp(date: Date | null | undefined): Timestamp | null {
  if (!date) return null;
  return Timestamp.fromDate(date);
}

// Format date for display
export function formatDate(date: Date | Timestamp | null | undefined, includeTime: boolean = false): string {
  if (!date) return '-';
  
  const dateObj = date instanceof Timestamp ? date.toDate() : date;
  
  if (includeTime) {
    return dateObj.toLocaleString('tr-TR');
  }
  return dateObj.toLocaleDateString('tr-TR');
}

// Check if a date is in the past
export function isPast(date: Date | Timestamp): boolean {
  const dateObj = date instanceof Timestamp ? date.toDate() : date;
  return dateObj < new Date();
}

// Check if a date is today
export function isToday(date: Date | Timestamp): boolean {
  const dateObj = date instanceof Timestamp ? date.toDate() : date;
  const today = new Date();
  return (
    dateObj.getDate() === today.getDate() &&
    dateObj.getMonth() === today.getMonth() &&
    dateObj.getFullYear() === today.getFullYear()
  );
}

