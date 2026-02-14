/**
 * Scoped Firestore DB — Tenant-Isolated Data Access
 *
 * All data is stored as subcollections under tenants/{tenantId}/:
 *   tenants/{tenantId}/calls/{callId}
 *   tenants/{tenantId}/appointments/{appointmentId}
 *   tenants/{tenantId}/complaints/{complaintId}
 *   tenants/{tenantId}/customers/{customerId}
 *   tenants/{tenantId}/activity_logs/{logId}
 *   tenants/{tenantId}/info_requests/{requestId}
 *   tenants/{tenantId}/documents/{docId}
 *
 * Usage:
 *   import { ScopedDb } from '@/lib/tenant/scoped-db';
 *   const db = new ScopedDb(ctx.tenantRef);
 *   const calls = await db.getCalls({ limitCount: 50 });
 */

import { FieldValue } from 'firebase-admin/firestore';

// =============================================
// Types
// =============================================

export interface QueryOptions {
    limitCount?: number;
    orderByField?: string;
    orderDirection?: 'asc' | 'desc';
}

export interface CallQueryOptions extends QueryOptions {
    customerId?: string;
    status?: string;
    dateFrom?: Date;
    dateTo?: Date;
}

export interface AppointmentQueryOptions extends QueryOptions {
    customerId?: string;
    status?: string;
    dateFrom?: Date;
    dateTo?: Date;
}

export interface ComplaintQueryOptions extends QueryOptions {
    customerId?: string;
    status?: string;
}

export interface InfoRequestQueryOptions extends QueryOptions {
    customerId?: string;
    status?: string;
}

// =============================================
// Scoped DB Class
// =============================================

export class ScopedDb {
    private tenantRef: FirebaseFirestore.DocumentReference;

    constructor(tenantRef: FirebaseFirestore.DocumentReference) {
        this.tenantRef = tenantRef;
    }

    // --- Helper ---

    private col(name: string) {
        return this.tenantRef.collection(name);
    }

    private now() {
        return FieldValue.serverTimestamp();
    }

    // =============================================
    // Call Logs
    // =============================================

    async getCalls(options?: CallQueryOptions) {
        let q: FirebaseFirestore.Query = this.col('calls');

        if (options?.customerId) q = q.where('customerId', '==', options.customerId);
        if (options?.status) q = q.where('status', '==', options.status);
        if (options?.dateFrom) q = q.where('createdAt', '>=', options.dateFrom);
        if (options?.dateTo) q = q.where('createdAt', '<=', options.dateTo);

        q = q.orderBy(options?.orderByField || 'createdAt', options?.orderDirection || 'desc');

        if (options?.limitCount) q = q.limit(options.limitCount);

        const snap = await q.get();
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    async addCall(data: Record<string, unknown>) {
        const ref = await this.col('calls').add({
            ...data,
            createdAt: this.now(),
        });
        return ref.id;
    }

    async updateCall(callId: string, data: Record<string, unknown>) {
        await this.col('calls').doc(callId).update({
            ...data,
            updatedAt: this.now(),
        });
    }

    // =============================================
    // Appointments
    // =============================================

    async getAppointments(options?: AppointmentQueryOptions) {
        let q: FirebaseFirestore.Query = this.col('appointments');

        if (options?.customerId) q = q.where('customerId', '==', options.customerId);
        if (options?.status) q = q.where('status', '==', options.status);
        if (options?.dateFrom) q = q.where('dateTime', '>=', options.dateFrom);
        if (options?.dateTo) q = q.where('dateTime', '<=', options.dateTo);

        q = q.orderBy(options?.orderByField || 'dateTime', options?.orderDirection || 'desc');

        if (options?.limitCount) q = q.limit(options.limitCount);

        const snap = await q.get();
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    async addAppointment(data: Record<string, unknown>) {
        const ref = await this.col('appointments').add({
            ...data,
            createdAt: this.now(),
        });
        return ref.id;
    }

    async updateAppointment(appointmentId: string, data: Record<string, unknown>) {
        await this.col('appointments').doc(appointmentId).update({
            ...data,
            updatedAt: this.now(),
        });
    }

    async deleteAppointment(appointmentId: string) {
        await this.col('appointments').doc(appointmentId).delete();
    }

    // =============================================
    // Complaints
    // =============================================

    async getComplaints(options?: ComplaintQueryOptions) {
        let q: FirebaseFirestore.Query = this.col('complaints');

        if (options?.customerId) q = q.where('customerId', '==', options.customerId);
        if (options?.status) q = q.where('status', '==', options.status);

        q = q.orderBy(options?.orderByField || 'createdAt', options?.orderDirection || 'desc');

        if (options?.limitCount) q = q.limit(options.limitCount);

        const snap = await q.get();
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    async addComplaint(data: Record<string, unknown>) {
        const ref = await this.col('complaints').add({
            ...data,
            createdAt: this.now(),
        });
        return ref.id;
    }

    async updateComplaint(complaintId: string, data: Record<string, unknown>) {
        await this.col('complaints').doc(complaintId).update({
            ...data,
            updatedAt: this.now(),
        });
    }

    // =============================================
    // Customers
    // =============================================

    async getCustomers(options?: QueryOptions) {
        let q: FirebaseFirestore.Query = this.col('customers');

        q = q.orderBy(options?.orderByField || 'createdAt', options?.orderDirection || 'desc');

        if (options?.limitCount) q = q.limit(options.limitCount);

        const snap = await q.get();
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    async getCustomer(customerId: string) {
        const snap = await this.col('customers').doc(customerId).get();
        if (!snap.exists) return null;
        return { id: snap.id, ...snap.data() };
    }

    async getCustomerByPhone(phone: string) {
        const snap = await this.col('customers')
            .where('phone', '==', phone)
            .limit(1)
            .get();
        if (snap.empty) return null;
        const doc = snap.docs[0];
        return { id: doc.id, ...doc.data() };
    }

    async addCustomer(data: Record<string, unknown>) {
        const ref = await this.col('customers').add({
            ...data,
            createdAt: this.now(),
        });
        return ref.id;
    }

    async updateCustomer(customerId: string, data: Record<string, unknown>) {
        await this.col('customers').doc(customerId).update({
            ...data,
            updatedAt: this.now(),
        });
    }

    // =============================================
    // Info Requests
    // =============================================

    async getInfoRequests(options?: InfoRequestQueryOptions) {
        let q: FirebaseFirestore.Query = this.col('info_requests');

        if (options?.customerId) q = q.where('customerId', '==', options.customerId);
        if (options?.status) q = q.where('status', '==', options.status);

        q = q.orderBy(options?.orderByField || 'createdAt', options?.orderDirection || 'desc');

        if (options?.limitCount) q = q.limit(options.limitCount);

        const snap = await q.get();
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    async addInfoRequest(data: Record<string, unknown>) {
        const ref = await this.col('info_requests').add({
            ...data,
            createdAt: this.now(),
        });
        return ref.id;
    }

    async updateInfoRequest(requestId: string, data: Record<string, unknown>) {
        await this.col('info_requests').doc(requestId).update({
            ...data,
            updatedAt: this.now(),
        });
    }

    // =============================================
    // Activity Logs
    // =============================================

    async getActivityLogs(limitCount: number = 20) {
        const snap = await this.col('activity_logs')
            .orderBy('createdAt', 'desc')
            .limit(limitCount)
            .get();
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    async addActivityLog(data: Record<string, unknown>) {
        const ref = await this.col('activity_logs').add({
            ...data,
            createdAt: this.now(),
        });
        return ref.id;
    }

    // =============================================
    // Documents (Knowledge Base / RAG)
    // =============================================

    async getDocuments(options?: QueryOptions) {
        let q: FirebaseFirestore.Query = this.col('documents');

        q = q.orderBy(options?.orderByField || 'createdAt', options?.orderDirection || 'desc');

        if (options?.limitCount) q = q.limit(options.limitCount);

        const snap = await q.get();
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    async addDocument(data: Record<string, unknown>) {
        const ref = await this.col('documents').add({
            ...data,
            createdAt: this.now(),
        });
        return ref.id;
    }

    async updateDocument(docId: string, data: Record<string, unknown>) {
        await this.col('documents').doc(docId).update({
            ...data,
            updatedAt: this.now(),
        });
    }

    async deleteDocument(docId: string) {
        await this.col('documents').doc(docId).delete();
    }

    // =============================================
    // Usage Metrics (for metering)
    // =============================================

    async recordUsage(type: string, data: Record<string, unknown>) {
        const ref = await this.col('usage').add({
            type,
            ...data,
            createdAt: this.now(),
        });
        return ref.id;
    }

    async getUsageSummary(dateFrom: Date, dateTo: Date) {
        const snap = await this.col('usage')
            .where('createdAt', '>=', dateFrom)
            .where('createdAt', '<=', dateTo)
            .get();
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
}
