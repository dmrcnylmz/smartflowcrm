import { 
  collection, 
  addDoc, 
  getDocs, 
  getDoc,
  doc, 
  query, 
  where, 
  orderBy, 
  limit as firestoreLimit,
  Timestamp,
  updateDoc,
  QueryConstraint
} from 'firebase/firestore';
import { db } from './config';
import type { 
  CallLog, 
  Appointment, 
  Complaint, 
  InfoRequest, 
  ActivityLog, 
  Customer 
} from './types';

// Helper function to build queries
function buildQuery(collectionName: string, constraints: QueryConstraint[]) {
  return query(collection(db, collectionName), ...constraints);
}

// Call Logs
export async function getCallLogs(options?: { 
  dateFrom?: Date; 
  dateTo?: Date; 
  status?: string;
  limitCount?: number;
}) {
  const constraints: QueryConstraint[] = [];
  
  if (options?.dateFrom) {
    constraints.push(where('createdAt', '>=', Timestamp.fromDate(options.dateFrom)));
  }
  if (options?.dateTo) {
    constraints.push(where('createdAt', '<=', Timestamp.fromDate(options.dateTo)));
  }
  if (options?.status) {
    constraints.push(where('status', '==', options.status));
  }
  
  constraints.push(orderBy('createdAt', 'desc'));
  
  if (options?.limitCount) {
    constraints.push(firestoreLimit(options.limitCount));
  }

  const q = buildQuery('calls', constraints);
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CallLog));
}

export async function addCallLog(data: Omit<CallLog, 'id' | 'createdAt'>) {
  return await addDoc(collection(db, 'calls'), {
    ...data,
    createdAt: Timestamp.now(),
  });
}

// Appointments
export async function getAppointments(options?: {
  customerId?: string;
  status?: string;
  dateFrom?: Date;
  dateTo?: Date;
}) {
  const constraints: QueryConstraint[] = [];
  
  if (options?.customerId) {
    constraints.push(where('customerId', '==', options.customerId));
  }
  
  if (options?.status) {
    constraints.push(where('status', '==', options.status));
  }
  if (options?.dateFrom) {
    constraints.push(where('dateTime', '>=', Timestamp.fromDate(options.dateFrom)));
  }
  if (options?.dateTo) {
    constraints.push(where('dateTime', '<=', Timestamp.fromDate(options.dateTo)));
  }
  
  constraints.push(orderBy('dateTime', 'desc'));

  const q = buildQuery('appointments', constraints);
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Appointment));
}

export async function addAppointment(data: Omit<Appointment, 'id' | 'createdAt'>) {
  return await addDoc(collection(db, 'appointments'), {
    ...data,
    createdAt: Timestamp.now(),
  });
}

export async function createAppointment(data: Omit<Appointment, 'id' | 'createdAt'>) {
  return addAppointment(data);
}

export async function updateAppointment(id: string, data: Partial<Appointment>) {
  const docRef = doc(db, 'appointments', id);
  await updateDoc(docRef, data as any);
}

// Complaints
export async function getComplaints(options?: { customerId?: string; status?: string }) {
  const constraints: QueryConstraint[] = [];
  
  if (options?.customerId) {
    constraints.push(where('customerId', '==', options.customerId));
  }
  
  if (options?.status) {
    constraints.push(where('status', '==', options.status));
  }
  
  constraints.push(orderBy('createdAt', 'desc'));

  const q = buildQuery('complaints', constraints);
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Complaint));
}

export async function addComplaint(data: Omit<Complaint, 'id' | 'createdAt'>) {
  return await addDoc(collection(db, 'complaints'), {
    ...data,
    createdAt: Timestamp.now(),
  });
}

export async function createComplaint(data: Omit<Complaint, 'id' | 'createdAt'>) {
  return addComplaint(data);
}

export async function updateComplaint(id: string, data: Partial<Complaint>) {
  const docRef = doc(db, 'complaints', id);
  await updateDoc(docRef, data as any);
}

// Info Requests
export async function getInfoRequests(options?: { customerId?: string; status?: string }) {
  const constraints: QueryConstraint[] = [];
  
  if (options?.customerId) {
    constraints.push(where('customerId', '==', options.customerId));
  }
  
  if (options?.status) {
    constraints.push(where('status', '==', options.status));
  }
  
  constraints.push(orderBy('createdAt', 'desc'));

  const q = buildQuery('info_requests', constraints);
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InfoRequest));
}

export async function addInfoRequest(data: Omit<InfoRequest, 'id' | 'createdAt'>) {
  return await addDoc(collection(db, 'info_requests'), {
    ...data,
    createdAt: Timestamp.now(),
  });
}

export async function createInfoRequest(data: Omit<InfoRequest, 'id' | 'createdAt'>) {
  return addInfoRequest(data);
}

export async function updateInfoRequest(id: string, data: Partial<InfoRequest>) {
  const docRef = doc(db, 'info_requests', id);
  await updateDoc(docRef, data as any);
}

// Activity Logs
export async function getActivityLogs(limitCount: number = 20) {
  const q = query(
    collection(db, 'activity_logs'),
    orderBy('createdAt', 'desc'),
    firestoreLimit(limitCount)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ActivityLog));
}

export async function addActivityLog(data: Omit<ActivityLog, 'id' | 'createdAt'>) {
  return await addDoc(collection(db, 'activity_logs'), {
    ...data,
    createdAt: Timestamp.now(),
  });
}

// Customers
export async function getCustomers() {
  const q = query(
    collection(db, 'customers'),
    orderBy('createdAt', 'desc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer));
}

export async function getAllCustomers() {
  return getCustomers();
}

export async function getCustomer(id: string) {
  const docRef = doc(db, 'customers', id);
  const snapshot = await getDoc(docRef);
  if (!snapshot.exists()) return null;
  return { id: snapshot.id, ...snapshot.data() } as Customer;
}

export async function getCustomerByPhone(phone: string) {
  const q = query(
    collection(db, 'customers'),
    where('phone', '==', phone),
    firestoreLimit(1)
  );
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() } as Customer;
}

export async function addCustomer(data: Omit<Customer, 'id' | 'createdAt'>) {
  return await addDoc(collection(db, 'customers'), {
    ...data,
    createdAt: Timestamp.now(),
  });
}

export async function createCustomer(data: Omit<Customer, 'id' | 'createdAt'>) {
  return addCustomer(data);
}

export async function updateCustomer(id: string, data: Partial<Customer>) {
  const docRef = doc(db, 'customers', id);
  await updateDoc(docRef, data as any);
}

// Documents (for RAG)
export async function getDocuments() {
  const snapshot = await getDocs(collection(db, 'documents'));
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

export async function addDocument(data: { title: string; content: string; category?: string }) {
  return await addDoc(collection(db, 'documents'), {
    ...data,
    createdAt: Timestamp.now(),
  });
}
