import { Timestamp } from 'firebase/firestore';

export interface CallLog {
  id: string;
  customerPhone: string;
  customerName?: string;
  customerId?: string;
  duration: number; // Duration in seconds
  durationSec?: number; // Alias for duration (for backward compatibility)
  status: 'answered' | 'missed' | 'rejected';
  intent?: string;
  summary?: string;
  transcript?: string; // Call transcript
  notes?: string; // Call notes
  direction?: 'inbound' | 'outbound'; // Call direction
  timestamp?: Timestamp; // Alternative to createdAt (for compatibility)
  createdAt: Timestamp; // Primary timestamp field
  // Personaplex Voice AI fields
  voiceSessionId?: string;      // Personaplex session ID
  aiPersona?: string;           // AI persona used (default, support, sales)
  audioRecordingUrl?: string;   // Firebase Storage recording URL
  voiceMetrics?: {
    latency: number;            // Average response latency (ms)
    turnCount: number;          // Number of conversation turns
    interruptionCount?: number; // Number of interruptions handled
  };
}

export interface Appointment {
  id: string;
  customerId: string;
  customerName?: string;
  customerPhone?: string;
  dateTime: Timestamp;
  durationMin?: number;
  service?: string;
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled';
  notes?: string;
  googleCalendarId?: string;
  googleCalendarEventId?: string; // Alias for googleCalendarId
  createdAt: Timestamp;
}

export interface Complaint {
  id: string;
  customerId: string;
  customerName?: string;
  customerPhone?: string;
  category: string;
  description: string;
  status: 'open' | 'investigating' | 'resolved' | 'closed';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  assignedTo?: string;
  resolution?: string;
  notes?: string; // Complaint notes
  slaDeadline?: Timestamp;
  createdAt: Timestamp;
  resolvedAt?: Timestamp;
}

export interface InfoRequest {
  id: string;
  customerId?: string;
  customerPhone?: string;
  topic?: string; // Alias for question
  question?: string;
  details?: string; // Alternative to question
  answer?: string;
  category?: string;
  assignedTo?: string;
  status: 'pending' | 'answered' | 'closed';
  createdAt: Timestamp;
}

export interface ActivityLog {
  id: string;
  type: 'call' | 'appointment' | 'complaint' | 'info' | 'system';
  description: string; // Primary field
  desc?: string; // Alias for description (for backward compatibility)
  relatedId?: string;
  metadata?: Record<string, unknown>;
  createdAt: Timestamp;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  notes?: string;
  tags?: string[];
  createdAt: Timestamp;
  lastContact?: Timestamp;
}

export interface Document {
  id: string;
  title: string;
  content: string;
  category?: string;
  tags?: string[];
  embedding?: number[];
  createdAt: Timestamp;
}

