/**
 * Server-side Firestore helpers using Firebase Admin SDK.
 *
 * Used by API routes — NOT for client-side code.
 * Client-side code should use `lib/firebase/db.ts` instead.
 */

import { initAdmin } from '@/lib/auth/firebase-admin';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { NextRequest } from 'next/server';

// Re-export Timestamp for routes that need it directly
export { Timestamp } from 'firebase-admin/firestore';

// ─── Firestore singleton ──────────────────────────────────────────────────────

let _db: FirebaseFirestore.Firestore | null = null;

function getDb() {
  if (!_db) {
    initAdmin();
    _db = getFirestore();
  }
  return _db;
}

// ─── Tenant helpers ───────────────────────────────────────────────────────────

/** Extract tenant ID from middleware-injected headers */
export function getTenantFromRequest(request: NextRequest): string | null {
  return (
    request.headers.get('x-user-tenant') ||
    request.headers.get('x-user-uid') ||
    null
  );
}

/** Get a reference to a tenant-scoped collection: tenants/{tenantId}/{name} */
function tenantCollection(tenantId: string, name: string) {
  return getDb().collection('tenants').doc(tenantId).collection(name);
}

/** Get a reference to a tenant-scoped document */
function tenantDoc(tenantId: string, col: string, docId: string) {
  return getDb()
    .collection('tenants')
    .doc(tenantId)
    .collection(col)
    .doc(docId);
}

// ─── Call Logs ────────────────────────────────────────────────────────────────

export async function getCallLogs(
  tenantId: string,
  options?: {
    customerId?: string;
    dateFrom?: Date;
    dateTo?: Date;
    status?: string;
    limitCount?: number;
  },
) {
  let q: FirebaseFirestore.Query = tenantCollection(tenantId, 'calls');

  if (options?.customerId)
    q = q.where('customerId', '==', options.customerId);
  if (options?.dateFrom)
    q = q.where('createdAt', '>=', Timestamp.fromDate(options.dateFrom));
  if (options?.dateTo)
    q = q.where('createdAt', '<=', Timestamp.fromDate(options.dateTo));
  if (options?.status) q = q.where('status', '==', options.status);

  q = q.orderBy('createdAt', 'desc');

  if (options?.limitCount) q = q.limit(options.limitCount);

  const snapshot = await q.get();
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function addCallLog(
  tenantId: string,
  data: Record<string, unknown>,
) {
  return await tenantCollection(tenantId, 'calls').add({
    ...data,
    createdAt: Timestamp.now(),
  });
}

export async function updateCallLog(
  tenantId: string,
  id: string,
  data: Record<string, unknown>,
) {
  const { id: _id, ...updateData } = data;
  await tenantDoc(tenantId, 'calls', id).update(updateData);
}

// ─── Appointments ─────────────────────────────────────────────────────────────

export async function getAppointments(
  tenantId: string,
  options?: {
    customerId?: string;
    status?: string;
    dateFrom?: Date;
    dateTo?: Date;
  },
) {
  let q: FirebaseFirestore.Query = tenantCollection(tenantId, 'appointments');

  if (options?.customerId)
    q = q.where('customerId', '==', options.customerId);
  if (options?.status) q = q.where('status', '==', options.status);
  if (options?.dateFrom)
    q = q.where('dateTime', '>=', Timestamp.fromDate(options.dateFrom));
  if (options?.dateTo)
    q = q.where('dateTime', '<=', Timestamp.fromDate(options.dateTo));

  q = q.orderBy('dateTime', 'desc');

  const snapshot = await q.get();
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function createAppointment(
  tenantId: string,
  data: Record<string, unknown>,
) {
  return await tenantCollection(tenantId, 'appointments').add({
    ...data,
    createdAt: Timestamp.now(),
  });
}

export async function updateAppointment(
  tenantId: string,
  id: string,
  data: Record<string, unknown>,
) {
  const { id: _id, ...updateData } = data;
  await tenantDoc(tenantId, 'appointments', id).update(updateData);
}

// ─── Complaints ───────────────────────────────────────────────────────────────

export async function getComplaints(
  tenantId: string,
  options?: { customerId?: string; status?: string },
) {
  let q: FirebaseFirestore.Query = tenantCollection(tenantId, 'complaints');

  if (options?.customerId)
    q = q.where('customerId', '==', options.customerId);
  if (options?.status) q = q.where('status', '==', options.status);

  q = q.orderBy('createdAt', 'desc');

  const snapshot = await q.get();
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function createComplaint(
  tenantId: string,
  data: Record<string, unknown>,
) {
  return await tenantCollection(tenantId, 'complaints').add({
    ...data,
    createdAt: Timestamp.now(),
  });
}

export async function updateComplaint(
  tenantId: string,
  id: string,
  data: Record<string, unknown>,
) {
  const { id: _id, ...updateData } = data;
  await tenantDoc(tenantId, 'complaints', id).update(updateData);
}

// ─── Info Requests ────────────────────────────────────────────────────────────

export async function getInfoRequests(
  tenantId: string,
  options?: { customerId?: string; status?: string },
) {
  let q: FirebaseFirestore.Query = tenantCollection(tenantId, 'info_requests');

  if (options?.customerId)
    q = q.where('customerId', '==', options.customerId);
  if (options?.status) q = q.where('status', '==', options.status);

  q = q.orderBy('createdAt', 'desc');

  const snapshot = await q.get();
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function createInfoRequest(
  tenantId: string,
  data: Record<string, unknown>,
) {
  return await tenantCollection(tenantId, 'info_requests').add({
    ...data,
    createdAt: Timestamp.now(),
  });
}

export async function updateInfoRequest(
  tenantId: string,
  id: string,
  data: Record<string, unknown>,
) {
  const { id: _id, ...updateData } = data;
  await tenantDoc(tenantId, 'info_requests', id).update(updateData);
}

// ─── Activity Logs ────────────────────────────────────────────────────────────

export async function addActivityLog(
  tenantId: string,
  data: Record<string, unknown>,
) {
  return await tenantCollection(tenantId, 'activity_logs').add({
    ...data,
    createdAt: Timestamp.now(),
  });
}

// ─── Customers ────────────────────────────────────────────────────────────────

export async function getAllCustomers(tenantId: string) {
  const snapshot = await tenantCollection(tenantId, 'customers')
    .orderBy('createdAt', 'desc')
    .get();
  return snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, any>) }));
}

export async function getCustomer(tenantId: string, id: string): Promise<Record<string, any> | null> {
  const docSnap = await tenantDoc(tenantId, 'customers', id).get();
  if (!docSnap.exists) return null;
  return { id: docSnap.id, ...docSnap.data() };
}

export async function getCustomerByPhone(tenantId: string, phone: string): Promise<Record<string, any> | null> {
  const snapshot = await tenantCollection(tenantId, 'customers')
    .where('phone', '==', phone)
    .limit(1)
    .get();
  if (snapshot.empty) return null;
  const first = snapshot.docs[0];
  return { id: first.id, ...first.data() };
}

export async function createCustomer(
  tenantId: string,
  data: Record<string, unknown>,
) {
  return await tenantCollection(tenantId, 'customers').add({
    ...data,
    createdAt: Timestamp.now(),
  });
}

export async function updateCustomer(
  tenantId: string,
  id: string,
  data: Record<string, unknown>,
) {
  const { id: _id, ...updateData } = data;
  await tenantDoc(tenantId, 'customers', id).update(updateData);
}
