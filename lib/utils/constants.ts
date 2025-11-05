// App Constants

export const APP_NAME = 'SmartFlow CRM';
export const APP_VERSION = '0.1.0';

// Status options
export const CALL_STATUSES = ['answered', 'missed', 'rejected'] as const;
export const APPOINTMENT_STATUSES = ['scheduled', 'confirmed', 'completed', 'cancelled'] as const;
export const COMPLAINT_STATUSES = ['open', 'investigating', 'resolved', 'closed'] as const;
export const COMPLAINT_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;

// SLA times (in hours)
export const SLA_TIMES = {
  complaint_response: 24,
  appointment_reminder_1: 24,
  appointment_reminder_2: 1,
};

// Default limits
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

