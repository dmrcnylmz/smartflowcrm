import { useEffect, useState, useMemo } from 'react';
import { collection, query, onSnapshot, QueryConstraint, orderBy, limit as firestoreLimit, where, Timestamp } from 'firebase/firestore';
import { db } from './config';

export function useFirestoreCollection<T>(
  collectionName: string,
  constraints: QueryConstraint[] = []
) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Memoize query to avoid unnecessary recreations
  // Note: constraints array reference should be stable
  const q = useMemo(() => {
    try {
      return query(collection(db, collectionName), ...constraints);
    } catch (err) {
      console.error(`Query setup error for ${collectionName}:`, err);
      return null;
    }
  }, [collectionName, constraints]);

  useEffect(() => {
    if (!q) {
      setError(new Error(`Invalid query for ${collectionName}`));
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
        console.error(`Firestore ${collectionName} error:`, err);
        setError(err as Error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [q, collectionName]);

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

  return useFirestoreCollection<import('./types').ActivityLog>('activity_logs', constraints);
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

  return useFirestoreCollection<import('./types').CallLog>('calls', constraints);
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

  return useFirestoreCollection<import('./types').Complaint>('complaints', constraints);
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

  return useFirestoreCollection<import('./types').Appointment>('appointments', constraints);
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

  return useFirestoreCollection<import('./types').Customer>('customers', constraints);
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

  return useFirestoreCollection<import('./types').InfoRequest>('info_requests', constraints);
}

