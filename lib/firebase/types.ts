// Firestore Timestamp can come from client SDK or Admin SDK
// Using `any` keeps both paths happy without coupling to a specific SDK
type FirestoreTimestamp = any;

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  notes?: string;
  createdAt: FirestoreTimestamp;
}

export interface CallLog {
  id: string;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  status: 'answered' | 'missed' | 'voicemail';
  direction?: 'inbound' | 'outbound';
  durationSec?: number;
  duration?: number;
  timestamp?: FirestoreTimestamp;
  createdAt: FirestoreTimestamp;
  intent?: string;
  notes?: string;
  transcript?: string;
  summary?: string;
  voiceSessionId?: string;
  aiPersona?: string;
  voiceMetrics?: Record<string, unknown>;
  recording?: {
    sid: string;
    url: string;
    mp3Url: string;
    wavUrl: string;
    duration: number;
    status: 'completed' | 'failed';
    completedAt?: FirestoreTimestamp;
  };
}

export interface Appointment {
  id: string;
  customerId: string;
  customerName?: string;
  dateTime: FirestoreTimestamp;
  durationMin?: number;
  status: 'scheduled' | 'completed' | 'cancelled';
  notes?: string;
  createdAt: FirestoreTimestamp;
}

export interface Complaint {
  id: string;
  customerId: string;
  customerName?: string;
  category?: string;
  description?: string;
  status: 'open' | 'investigating' | 'resolved' | 'closed';
  priority?: 'low' | 'medium' | 'high';
  notes?: string;
  createdAt: FirestoreTimestamp;
  resolvedAt?: FirestoreTimestamp;
}

export interface InfoRequest {
  id: string;
  customerId?: string;
  status?: string;
  createdAt: FirestoreTimestamp;
  [key: string]: unknown;
}

export interface ActivityLog {
  id: string;
  type?: string;
  desc?: string;
  description?: string;
  relatedId?: string;
  createdAt: FirestoreTimestamp;
  [key: string]: unknown;
}
