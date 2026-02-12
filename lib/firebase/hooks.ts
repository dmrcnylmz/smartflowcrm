import { useEffect, useState, useMemo } from 'react';
import { collection, query, onSnapshot, QueryConstraint, orderBy, limit as firestoreLimit, where, Timestamp } from 'firebase/firestore';
import { db } from './config';
import {
  demoCustomers,
  demoAppointments,
  demoComplaints,
  demoCallLogs,
  demoInfoRequests,
  demoActivityLogs,
  demoDb
} from './demo-data';

// Demo mode flag - set to true when Firebase fails
let useDemoMode = false;

export function useFirestoreCollection<T>(
  collectionName: string,
  constraints: QueryConstraint[] = [],
  demoData: T[] = []
) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Memoize query to avoid unnecessary recreations
  const q = useMemo(() => {
    try {
      return query(collection(db, collectionName), ...constraints);
    } catch (err) {
      console.error(`Query setup error for ${collectionName}:`, err);
      return null;
    }
  }, [collectionName, constraints]);

  useEffect(() => {
    // If demo mode is active, use demo data directly
    if (useDemoMode) {
      console.log(`📋 Demo mode: Using demo data for ${collectionName}`);
      setData(demoData);
      setLoading(false);
      setError(null);
      return;
    }

    if (!q) {
      // Fallback to demo data
      console.log(`📋 Query failed, using demo data for ${collectionName}`);
      setData(demoData);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as T[];
        setData(items);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.warn(`⚠️ Firestore ${collectionName} error:`, err.message);
        // Switch to demo mode on permission error
        if (err.message?.includes('permission') || err.code === 'permission-denied') {
          console.log(`📋 Switching to demo mode for ${collectionName}`);
          useDemoMode = true;
          setData(demoData);
          setError(null);
        } else {
          setError(err as Error);
        }
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [q, collectionName, demoData]);

  return { data, loading, error };
}

/**
 * Real-time hook for activity logs
 */
export function useActivityLogs(limitCount: number = 20) {
  const constraints = useMemo(() => [
    orderBy('createdAt', 'desc'),
    firestoreLimit(limitCount),
  ], [limitCount]);

  const demoData = useMemo(() => demoActivityLogs.slice(0, limitCount), [limitCount]);

  return useFirestoreCollection<import('./types').ActivityLog>('activity_logs', constraints, demoData);
}

/**
 * Real-time hook for calls with optional filters
 */
export function useCalls(options?: {
  dateFrom?: Date;
  dateTo?: Date;
  status?: string;
  limitCount?: number;
}) {
  const constraints = useMemo(() => {
    const cons: QueryConstraint[] = [];

    if (options?.dateFrom) {
      cons.push(where('createdAt', '>=', Timestamp.fromDate(options.dateFrom)));
    }
    if (options?.dateTo) {
      cons.push(where('createdAt', '<=', Timestamp.fromDate(options.dateTo)));
    }
    if (options?.status) {
      cons.push(where('status', '==', options.status));
    }

    cons.push(orderBy('createdAt', 'desc'));

    if (options?.limitCount) {
      cons.push(firestoreLimit(options.limitCount));
    }

    return cons;
  }, [
    options?.dateFrom?.getTime(),
    options?.dateTo?.getTime(),
    options?.status,
    options?.limitCount,
  ]);

  return useFirestoreCollection<import('./types').CallLog>('calls', constraints, demoCallLogs);
}

/**
 * Real-time hook for complaints with optional status filter
 */
export function useComplaints(status?: string) {
  const constraints = useMemo(() => {
    const cons: QueryConstraint[] = [];

    if (status) {
      cons.push(where('status', '==', status));
    }

    cons.push(orderBy('createdAt', 'desc'));

    return cons;
  }, [status]);

  const demoData = useMemo(() => {
    if (status) {
      return demoComplaints.filter(c => c.status === status);
    }
    return demoComplaints;
  }, [status]);

  return useFirestoreCollection<import('./types').Complaint>('complaints', constraints, demoData);
}

/**
 * Real-time hook for appointments with optional filters
 */
export function useAppointments(options?: {
  dateFrom?: Date;
  dateTo?: Date;
  status?: string;
  limitCount?: number;
}) {
  const constraints = useMemo(() => {
    const cons: QueryConstraint[] = [];

    if (options?.dateFrom) {
      cons.push(where('dateTime', '>=', Timestamp.fromDate(options.dateFrom)));
    }
    if (options?.dateTo) {
      cons.push(where('dateTime', '<=', Timestamp.fromDate(options.dateTo)));
    }
    if (options?.status) {
      cons.push(where('status', '==', options.status));
    }

    cons.push(orderBy('dateTime', 'asc'));

    if (options?.limitCount) {
      cons.push(firestoreLimit(options.limitCount));
    }

    return cons;
  }, [
    options?.dateFrom?.getTime(),
    options?.dateTo?.getTime(),
    options?.status,
    options?.limitCount,
  ]);

  return useFirestoreCollection<import('./types').Appointment>('appointments', constraints, demoAppointments);
}

/**
 * Real-time hook for customers
 */
export function useCustomers(limitCount?: number) {
  const constraints = useMemo(() => {
    const cons: QueryConstraint[] = [orderBy('createdAt', 'desc')];
    if (limitCount) {
      cons.push(firestoreLimit(limitCount));
    }
    return cons;
  }, [limitCount]);

  const demoData = useMemo(() => {
    return limitCount ? demoCustomers.slice(0, limitCount) : demoCustomers;
  }, [limitCount]);

  return useFirestoreCollection<import('./types').Customer>('customers', constraints, demoData);
}

/**
 * Real-time hook for info requests with optional filters
 */
export function useInfoRequests(options?: {
  dateFrom?: Date;
  dateTo?: Date;
  status?: string;
  limitCount?: number;
}) {
  const constraints = useMemo(() => {
    const cons: QueryConstraint[] = [];

    if (options?.dateFrom) {
      cons.push(where('createdAt', '>=', Timestamp.fromDate(options.dateFrom)));
    }
    if (options?.dateTo) {
      cons.push(where('createdAt', '<=', Timestamp.fromDate(options.dateTo)));
    }
    if (options?.status) {
      cons.push(where('status', '==', options.status));
    }

    cons.push(orderBy('createdAt', 'desc'));

    if (options?.limitCount) {
      cons.push(firestoreLimit(options.limitCount));
    }

    return cons;
  }, [
    options?.dateFrom?.getTime(),
    options?.dateTo?.getTime(),
    options?.status,
    options?.limitCount,
  ]);

  return useFirestoreCollection<import('./types').InfoRequest>('info_requests', constraints, demoInfoRequests);
}

// Export demo mode utilities
export { demoDb, useDemoMode };
export function isDemoModeActive() {
  return useDemoMode;
}
