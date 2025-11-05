// n8n Webhook Client
const N8N_BASE_URL = process.env.N8N_WEBHOOK_URL || 'http://localhost:5678/webhook';

export interface WebhookPayload {
  [key: string]: any;
}

// n8n Workflow IDs for webhook paths
export const N8N_WORKFLOW_IDS = {
  CALL_HANDLER: 'call-handler',
  APPOINTMENT_FLOW: 'appointment-flow',
  COMPLAINT_TRACKER: 'complaint-tracker',
  INFO_HANDLER: 'info-handler',
  DAILY_REPORT: 'daily-report',
} as const;

export async function sendWebhook(
  workflowPath: string,
  payload: WebhookPayload
): Promise<any> {
  try {
    const url = `${N8N_BASE_URL}/${workflowPath}`;
    console.log(`Triggering n8n webhook: ${url}`);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.warn(`n8n webhook returned ${response.status}: ${response.statusText}`);
      // Don't throw error - n8n might not be running in dev mode
      return { success: false, status: response.status };
    }

    return await response.json();
  } catch (error: any) {
    console.warn(`n8n webhook error (${workflowPath}):`, error.message);
    // Don't throw error - n8n might not be running in dev mode
    return { success: false, error: error.message };
  }
}

// Generic trigger function
export async function triggerN8NWebhook(workflowId: string, data: any) {
  return await sendWebhook(workflowId, data);
}

// Specific webhook functions (for backward compatibility)
export async function triggerCallWorkflow(data: any) {
  return await sendWebhook(N8N_WORKFLOW_IDS.CALL_HANDLER, data);
}

export async function triggerAppointmentWorkflow(data: any) {
  return await sendWebhook(N8N_WORKFLOW_IDS.APPOINTMENT_FLOW, data);
}

export async function triggerComplaintWorkflow(data: any) {
  return await sendWebhook(N8N_WORKFLOW_IDS.COMPLAINT_TRACKER, data);
}

export async function triggerInfoWorkflow(data: any) {
  return await sendWebhook(N8N_WORKFLOW_IDS.INFO_HANDLER, data);
}


