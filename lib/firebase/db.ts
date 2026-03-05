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
import { db, auth } from './config';
import type {
  CallLog,
  Appointment,
  Complaint,
  InfoRequest,
  ActivityLog,
  Customer
} from './types';

// ─── Tenant-aware collection helpers ───────────────────────────────────────
// Firestore rules require data under /tenants/{tenantId}/collection.
// We get tenantId from Firebase Auth custom claims.
// If no tenantId claim exists yet (new user, onboarding), we fall back
// to the user's UID as tenantId (single-user tenant = owner's UID).

async function getTenantId(): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Oturum açılmamış. Lütfen giriş yapın.');

  const tokenResult = await user.getIdTokenResult();
  const tenantId = tokenResult.claims.tenantId as string | undefined;

  // Fallback: for newly onboarded users whose custom claims haven't propagated yet,
  // the tenant ID equals the user's UID (owner creates tenant with their UID).
  return tenantId || user.uid;
}

/** Get a reference to a tenant-scoped collection: tenants/{tenantId}/{name} */
function tenantCollection(tenantId: string, name: string) {
  return collection(db, 'tenants', tenantId, name);
}

/** Get a reference to a tenant-scoped document: tenants/{tenantId}/{col}/{docId} */
function tenantDoc(tenantId: string, col: string, docId: string) {
  return doc(db, 'tenants', tenantId, col, docId);
}

/** Build a Firestore query on a tenant-scoped collection */
function buildQuery(tenantId: string, collectionName: string, constraints: QueryConstraint[]): Query {
  return query(tenantCollection(tenantId, collectionName), ...constraints);
}

// ─── Call Logs ──────────────────────────────────────────────────────────────

export async function getCallLogs(options?: {
  customerId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  status?: string;
  limitCount?: number;
}): Promise<CallLog[]> {
  const tid = await getTenantId();
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

  const q = buildQuery(tid, 'calls', constraints);
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as CallLog));
}

export async function addCallLog(data: Omit<CallLog, 'id' | 'createdAt'>): Promise<DocumentReference> {
  const tid = await getTenantId();
  return await addDoc(tenantCollection(tid, 'calls'), {
    ...data,
    createdAt: Timestamp.now(),
  });
}

export async function updateCallLog(id: string, data: Partial<CallLog>): Promise<void> {
  const tid = await getTenantId();
  const docRef = tenantDoc(tid, 'calls', id);
  const { id: _id, ...updateData } = data;
  await updateDoc(docRef, updateData);
}

// ─── Appointments ───────────────────────────────────────────────────────────

export async function getAppointments(options?: {
  customerId?: string;
  status?: string;
  dateFrom?: Date;
  dateTo?: Date;
}): Promise<Appointment[]> {
  const tid = await getTenantId();
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

  const q = buildQuery(tid, 'appointments', constraints);
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Appointment));
}

export async function addAppointment(data: Omit<Appointment, 'id' | 'createdAt'>): Promise<DocumentReference> {
  const tid = await getTenantId();
  return await addDoc(tenantCollection(tid, 'appointments'), {
    ...data,
    createdAt: Timestamp.now(),
  });
}

export async function createAppointment(data: Omit<Appointment, 'id' | 'createdAt'>): Promise<DocumentReference> {
  return addAppointment(data);
}

export async function updateAppointment(id: string, data: Partial<Appointment>): Promise<void> {
  const tid = await getTenantId();
  const docRef = tenantDoc(tid, 'appointments', id);
  const { id: _id, ...updateData } = data;
  await updateDoc(docRef, updateData);
}

export async function deleteAppointment(id: string): Promise<void> {
  const tid = await getTenantId();
  const docRef = tenantDoc(tid, 'appointments', id);
  await deleteDoc(docRef);
}

// ─── Complaints ─────────────────────────────────────────────────────────────

export async function getComplaints(options?: { customerId?: string; status?: string }): Promise<Complaint[]> {
  const tid = await getTenantId();
  const constraints: QueryConstraint[] = [];

  if (options?.customerId) {
    constraints.push(where('customerId', '==', options.customerId));
  }
  if (options?.status) {
    constraints.push(where('status', '==', options.status));
  }

  constraints.push(orderBy('createdAt', 'desc'));

  const q = buildQuery(tid, 'complaints', constraints);
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Complaint));
}

export async function addComplaint(data: Omit<Complaint, 'id' | 'createdAt'>): Promise<DocumentReference> {
  const tid = await getTenantId();
  return await addDoc(tenantCollection(tid, 'complaints'), {
    ...data,
    createdAt: Timestamp.now(),
  });
}

export async function createComplaint(data: Omit<Complaint, 'id' | 'createdAt'>): Promise<DocumentReference> {
  return addComplaint(data);
}

export async function updateComplaint(id: string, data: Partial<Complaint>): Promise<void> {
  const tid = await getTenantId();
  const docRef = tenantDoc(tid, 'complaints', id);
  const { id: _id, ...updateData } = data;
  await updateDoc(docRef, updateData);
}

// ─── Info Requests ──────────────────────────────────────────────────────────

export async function getInfoRequests(options?: { customerId?: string; status?: string }): Promise<InfoRequest[]> {
  const tid = await getTenantId();
  const constraints: QueryConstraint[] = [];

  if (options?.customerId) {
    constraints.push(where('customerId', '==', options.customerId));
  }
  if (options?.status) {
    constraints.push(where('status', '==', options.status));
  }

  constraints.push(orderBy('createdAt', 'desc'));

  const q = buildQuery(tid, 'info_requests', constraints);
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as InfoRequest));
}

export async function addInfoRequest(data: Omit<InfoRequest, 'id' | 'createdAt'>): Promise<DocumentReference> {
  const tid = await getTenantId();
  return await addDoc(tenantCollection(tid, 'info_requests'), {
    ...data,
    createdAt: Timestamp.now(),
  });
}

export async function createInfoRequest(data: Omit<InfoRequest, 'id' | 'createdAt'>): Promise<DocumentReference> {
  return addInfoRequest(data);
}

export async function updateInfoRequest(id: string, data: Partial<InfoRequest>): Promise<void> {
  const tid = await getTenantId();
  const docRef = tenantDoc(tid, 'info_requests', id);
  const { id: _id, ...updateData } = data;
  await updateDoc(docRef, updateData);
}

// ─── Activity Logs ──────────────────────────────────────────────────────────

export async function getActivityLogs(limitCount: number = 20): Promise<ActivityLog[]> {
  const tid = await getTenantId();
  const q = query(
    tenantCollection(tid, 'activity_logs'),
    orderBy('createdAt', 'desc'),
    firestoreLimit(limitCount)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ActivityLog));
}

export async function addActivityLog(data: Omit<ActivityLog, 'id' | 'createdAt'>): Promise<DocumentReference> {
  const tid = await getTenantId();
  return await addDoc(tenantCollection(tid, 'activity_logs'), {
    ...data,
    createdAt: Timestamp.now(),
  });
}

// ─── Customers ──────────────────────────────────────────────────────────────

export async function getCustomers(): Promise<Customer[]> {
  const tid = await getTenantId();
  const q = query(
    tenantCollection(tid, 'customers'),
    orderBy('createdAt', 'desc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Customer));
}

export async function getAllCustomers(): Promise<Customer[]> {
  return getCustomers();
}

export async function getCustomer(id: string): Promise<Customer | null> {
  const tid = await getTenantId();
  const docRef = tenantDoc(tid, 'customers', id);
  const snapshot = await getDoc(docRef);
  if (!snapshot.exists()) return null;
  return { id: snapshot.id, ...snapshot.data() } as Customer;
}

export async function getCustomerByPhone(phone: string): Promise<Customer | null> {
  const tid = await getTenantId();
  const q = query(
    tenantCollection(tid, 'customers'),
    where('phone', '==', phone),
    firestoreLimit(1)
  );
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  const first = snapshot.docs[0];
  return { id: first.id, ...first.data() } as Customer;
}

export async function addCustomer(data: Omit<Customer, 'id' | 'createdAt'>): Promise<DocumentReference> {
  const tid = await getTenantId();
  return await addDoc(tenantCollection(tid, 'customers'), {
    ...data,
    createdAt: Timestamp.now(),
  });
}

export async function createCustomer(data: Omit<Customer, 'id' | 'createdAt'>): Promise<DocumentReference> {
  return addCustomer(data);
}

export async function updateCustomer(id: string, data: Partial<Customer>): Promise<void> {
  const tid = await getTenantId();
  const docRef = tenantDoc(tid, 'customers', id);
  const { id: _id, ...updateData } = data;
  await updateDoc(docRef, updateData);
}

// ─── Documents (Knowledge Base / RAG) ───────────────────────────────────────

export async function getDocuments(): Promise<Array<{ id: string; title?: string; content?: string; category?: string; [key: string]: unknown }>> {
  const tid = await getTenantId();
  const snapshot = await getDocs(tenantCollection(tid, 'documents'));
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function addDocument(data: { title: string; content: string; category?: string }): Promise<DocumentReference> {
  const tid = await getTenantId();
  return await addDoc(tenantCollection(tid, 'documents'), {
    ...data,
    createdAt: Timestamp.now(),
  });
}
