// Context API Direct Client
// Bypasses n8n — sends tool calls directly to Context API on Personaplex server
const CONTEXT_API_URL = process.env.PERSONAPLEX_CONTEXT_URL || process.env.CONTEXT_API_URL || 'http://localhost:8999';

export interface WebhookPayload {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

// Tool name → context type mapping
const TOOL_TYPE_MAP: Record<string, { type: string; priority: string }> = {
  'call-handler': { type: 'call_start', priority: 'high' },
  'appointment-flow': { type: 'appointment', priority: 'high' },
  'complaint-tracker': { type: 'complaint', priority: 'urgent' },
  'info-handler': { type: 'info_request', priority: 'normal' },
  'daily-report': { type: 'daily_report', priority: 'normal' },
};

// Kept for backward compatibility
export const N8N_WORKFLOW_IDS = {
  CALL_HANDLER: 'call-handler',
  APPOINTMENT_FLOW: 'appointment-flow',
  COMPLAINT_TRACKER: 'complaint-tracker',
  INFO_HANDLER: 'info-handler',
  DAILY_REPORT: 'daily-report',
} as const;

/**
 * Send tool call directly to Context API /webhook/context endpoint.
 */
export async function sendWebhook(
  toolName: string,
  payload: WebhookPayload
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  const mapping = TOOL_TYPE_MAP[toolName] || { type: toolName, priority: 'normal' };

  const contextPayload = {
    session_id: payload.sessionId,
    type: mapping.type,
    data: {
      ...payload.arguments,
      tenant_id: payload.tenantId,
      tool_name: toolName,
      timestamp: payload.timestamp,
    },
    priority: mapping.priority,
    source: 'voice_pipeline',
  };

  try {
    const url = `${CONTEXT_API_URL}/webhook/context`;
    console.log(`[ContextAPI] Sending ${mapping.type} → ${url}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(contextPayload),
    });

    if (!response.ok) {
      console.warn(`[ContextAPI] ${response.status}: ${response.statusText}`);
      return { success: false, status: response.status };
    }

    const result = await response.json();
    console.log(`[ContextAPI] ✅ ${mapping.type} saved (session=${payload.sessionId})`);
    return result;
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.warn(`[ContextAPI] Error (${toolName}):`, msg);
    return { success: false, error: msg };
  }
}

// Also log call_start event for call-handler
async function logEvent(payload: WebhookPayload) {
  try {
    await fetch(`${CONTEXT_API_URL}/webhook/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: payload.sessionId,
        event: 'call_start',
        customer_phone: payload.arguments?.customer_phone || '',
        customer_name: payload.arguments?.customer_name || '',
      }),
    });
  } catch {
    // non-critical
  }
}

/**
 * Main entry point — replaces triggerN8NWebhook.
 * Kept same function signature for backward compatibility.
 */
export async function triggerN8NWebhook(toolName: string, data: WebhookPayload) {
  const result = await sendWebhook(toolName, data);

  // For call-handler, also fire the event endpoint
  if (toolName === 'call-handler') {
    await logEvent(data);
  }

  return result;
}

// Backward-compatible named exports
export const triggerCallWorkflow = (data: WebhookPayload) => sendWebhook('call-handler', data);
export const triggerAppointmentWorkflow = (data: WebhookPayload) => sendWebhook('appointment-flow', data);
export const triggerComplaintWorkflow = (data: WebhookPayload) => sendWebhook('complaint-tracker', data);
export const triggerInfoWorkflow = (data: WebhookPayload) => sendWebhook('info-handler', data);
