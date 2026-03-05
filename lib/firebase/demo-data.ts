/**
 * Demo data for development/testing when Firebase is not available
 */

import { Timestamp } from 'firebase/firestore';
import type { Customer, Appointment, Complaint, CallLog, InfoRequest, ActivityLog } from './types';

/**
 * Create a mock Timestamp-like object for demo data.
 * Uses `as unknown as Timestamp` to satisfy the type system without `any`.
 */
function mockTimestamp(dateStr: string): Timestamp {
  return { toDate: () => new Date(dateStr) } as unknown as Timestamp;
}

// Demo customers
export const demoCustomers: Customer[] = [
    {
        id: 'demo-customer-1',
        name: 'Ahmet Yılmaz',
        phone: '+905551234567',
        email: 'ahmet@example.com',
        notes: 'VIP müşteri - öncelikli hizmet',
        createdAt: mockTimestamp('2024-01-15'),
    },
    {
        id: 'demo-customer-2',
        name: 'Ayşe Demir',
        phone: '+905559876543',
        email: 'ayse@example.com',
        notes: 'Düzenli randevu alıyor',
        createdAt: mockTimestamp('2024-02-20'),
    },
    {
        id: 'demo-customer-3',
        name: 'Mehmet Kaya',
        phone: '+905553334455',
        email: 'mehmet@example.com',
        notes: '',
        createdAt: mockTimestamp('2024-03-10'),
    },
    {
        id: 'demo-customer-4',
        name: 'Fatma Özkan',
        phone: '+905556667788',
        email: 'fatma@example.com',
        notes: 'Şikayet çözüldü, memnun',
        createdAt: mockTimestamp('2024-04-05'),
    },
    {
        id: 'demo-customer-5',
        name: 'Ali Çelik',
        phone: '+905552223344',
        email: 'ali@example.com',
        notes: 'Yeni müşteri',
        createdAt: mockTimestamp('2024-05-01'),
    },
];

// Demo appointments
export const demoAppointments: Appointment[] = [
    {
        id: 'demo-apt-1',
        customerId: 'demo-customer-1',
        dateTime: { toDate: () => new Date(Date.now() + 86400000) } as unknown as Timestamp, // Tomorrow
        durationMin: 30,
        status: 'scheduled',
        notes: 'İlk görüşme',
        createdAt: { toDate: () => new Date() } as unknown as Timestamp,
    },
    {
        id: 'demo-apt-2',
        customerId: 'demo-customer-2',
        dateTime: { toDate: () => new Date(Date.now() + 172800000) } as unknown as Timestamp, // 2 days
        durationMin: 45,
        status: 'scheduled',
        notes: 'Kontrol randevusu',
        createdAt: { toDate: () => new Date() } as unknown as Timestamp,
    },
    {
        id: 'demo-apt-3',
        customerId: 'demo-customer-3',
        dateTime: { toDate: () => new Date(Date.now() - 86400000) } as unknown as Timestamp, // Yesterday
        durationMin: 30,
        status: 'completed',
        notes: 'Başarılı görüşme',
        createdAt: { toDate: () => new Date() } as unknown as Timestamp,
    },
    {
        id: 'demo-apt-4',
        customerId: 'demo-customer-4',
        dateTime: { toDate: () => new Date(Date.now() - 172800000) } as unknown as Timestamp, // 2 days ago
        durationMin: 60,
        status: 'cancelled',
        notes: 'Müşteri iptal etti',
        createdAt: { toDate: () => new Date() } as unknown as Timestamp,
    },
];

// Demo complaints
export const demoComplaints: Complaint[] = [
    {
        id: 'demo-complaint-1',
        customerId: 'demo-customer-4',
        category: 'service',
        description: 'Randevu saatinde bekleme süresi çok uzundu',
        status: 'resolved',
        priority: 'medium',
        createdAt: mockTimestamp('2024-04-10'),
    },
    {
        id: 'demo-complaint-2',
        customerId: 'demo-customer-3',
        category: 'billing',
        description: 'Fatura tutarı yanlış hesaplanmış',
        status: 'investigating',
        priority: 'high',
        createdAt: mockTimestamp('2024-05-15'),
    },
    {
        id: 'demo-complaint-3',
        customerId: 'demo-customer-1',
        category: 'other',
        description: 'İletişim zorluğu yaşandı',
        status: 'open',
        priority: 'low',
        createdAt: { toDate: () => new Date() } as unknown as Timestamp,
    },
];

// Demo call logs
export const demoCallLogs: CallLog[] = [
    {
        id: 'demo-call-1',
        customerId: 'demo-customer-1',
        customerPhone: '+905551234567',
        direction: 'inbound',
        status: 'answered',
        duration: 180,
        durationSec: 180,
        notes: 'Randevu talebi alındı',
        createdAt: { toDate: () => new Date(Date.now() - 3600000) } as unknown as Timestamp,
    },
    {
        id: 'demo-call-2',
        customerId: 'demo-customer-2',
        customerPhone: '+905559876543',
        direction: 'outbound',
        status: 'answered',
        duration: 120,
        durationSec: 120,
        notes: 'Randevu hatırlatması yapıldı',
        createdAt: { toDate: () => new Date(Date.now() - 7200000) } as unknown as Timestamp,
    },
    {
        id: 'demo-call-3',
        customerId: 'demo-customer-3',
        customerPhone: '+905553334455',
        direction: 'inbound',
        status: 'missed',
        duration: 0,
        durationSec: 0,
        notes: 'Cevapsız arama',
        createdAt: { toDate: () => new Date(Date.now() - 10800000) } as unknown as Timestamp,
    },
    {
        id: 'demo-call-4',
        customerId: 'demo-customer-5',
        customerPhone: '+905552223344',
        direction: 'inbound',
        status: 'answered',
        duration: 300,
        durationSec: 300,
        notes: 'Bilgi talebi',
        createdAt: { toDate: () => new Date(Date.now() - 14400000) } as unknown as Timestamp,
    },
];

// Demo info requests
export const demoInfoRequests: InfoRequest[] = [
    {
        id: 'demo-info-1',
        customerId: 'demo-customer-5',
        topic: 'Fiyat bilgisi',
        details: 'Hizmet fiyatları hakkında bilgi istedi',
        status: 'pending',
        createdAt: { toDate: () => new Date() } as unknown as Timestamp,
    },
    {
        id: 'demo-info-2',
        customerId: 'demo-customer-2',
        topic: 'Çalışma saatleri',
        details: 'Hafta sonu çalışma saatlerini sordu',
        status: 'answered',
        createdAt: { toDate: () => new Date(Date.now() - 86400000) } as unknown as Timestamp,
    },
];

// Demo activity logs
export const demoActivityLogs: ActivityLog[] = [
    {
        id: 'demo-activity-1',
        type: 'call',
        relatedId: 'demo-call-1',
        description: 'Ahmet Yılmaz aramayı cevapladı',
        createdAt: { toDate: () => new Date(Date.now() - 3600000) } as unknown as Timestamp,
    },
    {
        id: 'demo-activity-2',
        type: 'appointment',
        relatedId: 'demo-apt-1',
        description: 'Yeni randevu oluşturuldu',
        createdAt: { toDate: () => new Date(Date.now() - 7200000) } as unknown as Timestamp,
    },
    {
        id: 'demo-activity-3',
        type: 'complaint',
        relatedId: 'demo-complaint-1',
        description: 'Şikayet çözüldü olarak işaretlendi',
        createdAt: { toDate: () => new Date(Date.now() - 10800000) } as unknown as Timestamp,
    },
    {
        id: 'demo-activity-4',
        type: 'system',
        relatedId: 'demo-customer-5',
        description: 'Yeni müşteri kaydı oluşturuldu',
        createdAt: { toDate: () => new Date(Date.now() - 14400000) } as unknown as Timestamp,
    },
];

// In-memory store for demo mode CRUD operations
let _customers = [...demoCustomers];
let _appointments = [...demoAppointments];
let _complaints = [...demoComplaints];
let _callLogs = [...demoCallLogs];
let _infoRequests = [...demoInfoRequests];
let _activityLogs = [...demoActivityLogs];

// Generate unique ID
function generateId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Demo CRUD operations
export const demoDb = {
    // Customers
    getCustomers: () => [..._customers],
    getCustomer: (id: string) => _customers.find(c => c.id === id) || null,
    addCustomer: (data: Omit<Customer, 'id' | 'createdAt'>) => {
        const newCustomer: Customer = {
            ...data,
            id: generateId('customer'),
            createdAt: { toDate: () => new Date() } as unknown as Timestamp,
        };
        _customers.unshift(newCustomer);
        return { id: newCustomer.id };
    },
    updateCustomer: (id: string, data: Partial<Customer>) => {
        const index = _customers.findIndex(c => c.id === id);
        if (index !== -1) {
            _customers[index] = { ..._customers[index], ...data };
        }
    },

    // Appointments
    getAppointments: () => [..._appointments],
    addAppointment: (data: Omit<Appointment, 'id' | 'createdAt'>) => {
        const newApt: Appointment = {
            ...data,
            id: generateId('apt'),
            createdAt: { toDate: () => new Date() } as unknown as Timestamp,
        };
        _appointments.unshift(newApt);
        return { id: newApt.id };
    },
    updateAppointment: (id: string, data: Partial<Appointment>) => {
        const index = _appointments.findIndex(a => a.id === id);
        if (index !== -1) {
            _appointments[index] = { ..._appointments[index], ...data };
        }
    },
    deleteAppointment: (id: string) => {
        _appointments = _appointments.filter(a => a.id !== id);
    },

    // Complaints
    getComplaints: () => [..._complaints],
    addComplaint: (data: Omit<Complaint, 'id' | 'createdAt'>) => {
        const newComplaint: Complaint = {
            ...data,
            id: generateId('complaint'),
            createdAt: { toDate: () => new Date() } as unknown as Timestamp,
        };
        _complaints.unshift(newComplaint);
        return { id: newComplaint.id };
    },
    updateComplaint: (id: string, data: Partial<Complaint>) => {
        const index = _complaints.findIndex(c => c.id === id);
        if (index !== -1) {
            _complaints[index] = { ..._complaints[index], ...data };
        }
    },

    // Call Logs
    getCallLogs: () => [..._callLogs],
    addCallLog: (data: Omit<CallLog, 'id' | 'createdAt'>) => {
        const newCall: CallLog = {
            ...data,
            id: generateId('call'),
            createdAt: { toDate: () => new Date() } as unknown as Timestamp,
        };
        _callLogs.unshift(newCall);
        return { id: newCall.id };
    },

    // Info Requests
    getInfoRequests: () => [..._infoRequests],
    addInfoRequest: (data: Omit<InfoRequest, 'id' | 'createdAt'>) => {
        const newReq: InfoRequest = {
            ...data,
            id: generateId('info'),
            createdAt: { toDate: () => new Date() } as unknown as Timestamp,
        };
        _infoRequests.unshift(newReq);
        return { id: newReq.id };
    },
    updateInfoRequest: (id: string, data: Partial<InfoRequest>) => {
        const index = _infoRequests.findIndex(r => r.id === id);
        if (index !== -1) {
            _infoRequests[index] = { ..._infoRequests[index], ...data };
        }
    },

    // Activity Logs
    getActivityLogs: (limit?: number) => {
        const logs = [..._activityLogs];
        return limit ? logs.slice(0, limit) : logs;
    },
    addActivityLog: (data: Omit<ActivityLog, 'id' | 'createdAt'>) => {
        const newLog: ActivityLog = {
            ...data,
            id: generateId('activity'),
            createdAt: { toDate: () => new Date() } as unknown as Timestamp,
        };
        _activityLogs.unshift(newLog);
        return { id: newLog.id };
    },

    // Get customer map for batch loading
    getCustomerMap: (): Record<string, Customer> => {
        const map: Record<string, Customer> = {};
        _customers.forEach(c => { map[c.id] = c; });
        return map;
    },
};

// Check if we're in demo mode
export function isDemoMode(): boolean {
    return true; // Always demo mode until Firebase auth is set up
}
