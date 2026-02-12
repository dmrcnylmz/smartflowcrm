import { Timestamp } from 'firebase/firestore';

/**
 * Safely convert Firestore Timestamp to Date
 * Handles multiple input types:
 * - Firestore Timestamp objects
 * - Date objects
 * - ISO date strings
 * - Unix timestamps (numbers)
 * - null/undefined (returns current date)
 */
export function toDate(timestamp: unknown): Date {
  if (!timestamp) return new Date();
  
  // Already a Date object
  if (timestamp instanceof Date) return timestamp;
  
  // Firestore Timestamp object
  if (
    typeof timestamp === 'object' && 
    'toDate' in timestamp && 
    typeof timestamp.toDate === 'function'
  ) {
    return (timestamp as Timestamp).toDate();
  }
  
  // ISO string or date string
  if (typeof timestamp === 'string') {
    const date = new Date(timestamp);
    return isNaN(date.getTime()) ? new Date() : date;
  }
  
  // Unix timestamp (milliseconds)
  if (typeof timestamp === 'number') {
    return new Date(timestamp);
  }
  
  // Fallback
  return new Date();
}

/**
 * Check if a timestamp is valid
 */
export function isValidTimestamp(timestamp: unknown): boolean {
  try {
    const date = toDate(timestamp);
    return !isNaN(date.getTime());
  } catch {
    return false;
  }
}

