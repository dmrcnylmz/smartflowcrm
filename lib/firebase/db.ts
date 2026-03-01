import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  doc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit as firestoreLimit,
  Timestamp,
  updateDoc,
  QueryConstraint,
  DocumentReference,
  Query
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

/** Helper function to build Firestore queries with constraints */
function buildQuery(collectionName: string, constraints: QueryConstraint[]): Query {
  return query(collection(db, collectionName), ...constraints);
}

// Call Logs
export async function getCallLogs(options?: {
  customerId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  status?: string;
  limitCount?: number;
}): Promise<CallLog[]> {
  const constraints: QueryConstraint[] = [];
  
  if (options?.customerId) {
    constraints.push(where('customerId', '==', options.customerId));
  }
  
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

export async function addCallLog(data: Omit<CallLog, 'id' | 'createdAt'>): Promise<DocumentReference> {
  return await addDoc(collection(db, 'calls'), {
    ...data,
    createdAt: Timestamp.now(),
  });
}

export async function updateCallLog(id: string, data: Partial<CallLog>): Promise<void> {
  const docRef = doc(db, 'calls', id);
  const { id: _id, ...updateData } = data;
  await updateDoc(docRef, updateData);
}

// Appointments
export async function getAppointments(options?: {
  customerId?: string;
  status?: string;
  dateFrom?: Date;
  dateTo?: Date;
}): Promise<Appointment[]> {
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

export async function addAppointment(data: Omit<Appointment, 'id' | 'createdAt'>): Promise<DocumentReference> {
  return await addDoc(collection(db, 'appointments'), {
    ...data,
    createdAt: Timestamp.now(),
  });
}

export async function createAppointment(data: Omit<Appointment, 'id' | 'createdAt'>): Promise<DocumentReference> {
  return addAppointment(data);
}

export async function updateAppointment(id: string, data: Partial<Appointment>): Promise<void> {
  const docRef = doc(db, 'appointments', id);
  const { id: _id, ...updateData } = data;
  await updateDoc(docRef, updateData);
}

export async function deleteAppointment(id: string): Promise<void> {
  const docRef = doc(db, 'appointments', id);
  await deleteDoc(docRef);
}

// Complaints
export async function getComplaints(options?: { customerId?: string; status?: string }): Promise<Complaint[]> {
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

export async function addComplaint(data: Omit<Complaint, 'id' | 'createdAt'>): Promise<DocumentReference> {
  return await addDoc(collection(db, 'complaints'), {
    ...data,
    createdAt: Timestamp.now(),
  });
}

export async function createComplaint(data: Omit<Complaint, 'id' | 'createdAt'>): Promise<DocumentReference> {
  return addComplaint(data);
}

export async function updateComplaint(id: string, data: Partial<Complaint>): Promise<void> {
  const docRef = doc(db, 'complaints', id);
  const { id: _id, ...updateData } = data;
  await updateDoc(docRef, updateData);
}

// Info Requests
export async function getInfoRequests(options?: { customerId?: string; status?: string }): Promise<InfoRequest[]> {
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

export async function addInfoRequest(data: Omit<InfoRequest, 'id' | 'createdAt'>): Promise<DocumentReference> {
  return await addDoc(collection(db, 'info_requests'), {
    ...data,
    createdAt: Timestamp.now(),
  });
}

export async function createInfoRequest(data: Omit<InfoRequest, 'id' | 'createdAt'>): Promise<DocumentReference> {
  return addInfoRequest(data);
}

export async function updateInfoRequest(id: string, data: Partial<InfoRequest>): Promise<void> {
  const docRef = doc(db, 'info_requests', id);
  const { id: _id, ...updateData } = data;
  await updateDoc(docRef, updateData);
}

// Activity Logs
export async function getActivityLogs(limitCount: number = 20): Promise<ActivityLog[]> {
  const q = query(
    collection(db, 'activity_logs'),
    orderBy('createdAt', 'desc'),
    firestoreLimit(limitCount)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ActivityLog));
}

export async function addActivityLog(data: Omit<ActivityLog, 'id' | 'createdAt'>): Promise<DocumentReference> {
  return await addDoc(collection(db, 'activity_logs'), {
    ...data,
    createdAt: Timestamp.now(),
  });
}

// Customers
export async function getCustomers(): Promise<Customer[]> {
  const q = query(
    collection(db, 'customers'),
    orderBy('createdAt', 'desc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Customer));
}

export async function getAllCustomers(): Promise<Customer[]> {
  return getCustomers();
}

export async function getCustomer(id: string): Promise<Customer | null> {
  const docRef = doc(db, 'customers', id);
  const snapshot = await getDoc(docRef);
  if (!snapshot.exists()) return null;
  return { id: snapshot.id, ...snapshot.data() } as Customer;
}

export async function getCustomerByPhone(phone: string): Promise<Customer | null> {
  const q = query(
    collection(db, 'customers'),
    where('phone', '==', phone),
    firestoreLimit(1)
  );
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  const first = snapshot.docs[0];
  return { id: first.id, ...first.data() } as Customer;
}

export async function addCustomer(data: Omit<Customer, 'id' | 'createdAt'>): Promise<DocumentReference> {
  return await addDoc(collection(db, 'customers'), {
    ...data,
    createdAt: Timestamp.now(),
  });
}

export async function createCustomer(data: Omit<Customer, 'id' | 'createdAt'>): Promise<DocumentReference> {
  return addCustomer(data);
}

export async function updateCustomer(id: string, data: Partial<Customer>): Promise<void> {
  const docRef = doc(db, 'customers', id);
  const { id: _id, ...updateData } = data;
  await updateDoc(docRef, updateData);
}

// Documents (for RAG)
export async function getDocuments(): Promise<Array<{ id: string; title?: string; content?: string; category?: string; [key: string]: unknown }>> {
  const snapshot = await getDocs(collection(db, 'documents'));
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function addDocument(data: { title: string; content: string; category?: string }): Promise<DocumentReference> {
  return await addDoc(collection(db, 'documents'), {
    ...data,
    createdAt: Timestamp.now(),
  });
}
