const { initDatabase, dbPrepareGet, dbPrepareAll, dbRun, saveDatabase } = require('../config/database');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const { generateTranscript, generateCallSummary } = require('../utils/transcript');
const { generateSentimentScore } = require('../utils/sentiment');
const aiService = require('../services/ai.service');

async function seed() {
  const db = await initDatabase();
  console.log('🌱 Seeding database...\n');

  // Clear existing data (order matters for FK)
  dbRun('DELETE FROM conversation_memory');
  dbRun('DELETE FROM handoff_queue');
  dbRun('DELETE FROM refresh_tokens');
  dbRun('DELETE FROM call_logs');
  dbRun('DELETE FROM calls');
  dbRun('DELETE FROM phone_numbers');
  dbRun('DELETE FROM queues');
  dbRun('DELETE FROM usage_metrics');
  dbRun('DELETE FROM tenant_pricing');
  dbRun('DELETE FROM tenant_branding');
  dbRun('DELETE FROM tenant_settings');
  dbRun('DELETE FROM users');
  dbRun('DELETE FROM tenants');


  // ═══════════════════════════════════════════
  // TENANT 1: Atlas Support
  // ═══════════════════════════════════════════
  console.log('📦 Creating tenant: Atlas Support');
  dbRun(
    `INSERT INTO tenants (id, name, industry, timezone, language, business_hours_start, business_hours_end, business_days)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ['atlas_support', 'Atlas Support', 'E-commerce Support', 'Europe/Istanbul', 'Turkish', '09:00', '18:00', 'Mon,Tue,Wed,Thu,Fri']
  );

  // Atlas AI Settings
  dbRun(
    `INSERT INTO tenant_settings (tenant_id, company_name, tone, language, forbidden_topics, escalation_rules, monthly_max_tokens, monthly_max_minutes, data_retention_days)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['atlas_support', 'Atlas Support', 'friendly', 'tr',
      'competitor pricing,internal margins,employee salaries',
      'If customer requests supervisor or issue unresolved after 2 attempts, escalate immediately.',
      100000, 1000, 365]
  );

  // Atlas Branding
  dbRun(
    `INSERT INTO tenant_branding (tenant_id, logo_url, primary_color, secondary_color, company_name)
     VALUES (?, ?, ?, ?, ?)`,
    ['atlas_support', '/assets/atlas-logo.svg', '#7c5cfc', '#00d4aa', 'Atlas Support']
  );

  // Atlas Pricing
  dbRun(
    `INSERT INTO tenant_pricing (tenant_id, price_per_minute, price_per_ai_token, currency) VALUES (?, ?, ?, ?)`,
    ['atlas_support', 0.02, 0.00001, 'USD']
  );

  // Atlas Telephony (disabled by default — configure with real Twilio creds)
  dbRun(
    `INSERT INTO tenant_telephony (id, tenant_id, provider, account_sid, auth_token_encrypted, phone_number, enabled)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['tel_atlas', 'atlas_support', 'twilio', 'AC_DEMO_SID', '', '+15551234567', 0]
  );

  // Atlas Agents
  const atlasAgents = [
    { id: 'atlas_agent_1', name: 'Ayşe Kaya', email: 'ayse@atlas.com', role: 'agent', level: 1 },
    { id: 'atlas_agent_2', name: 'Mehmet Demir', email: 'mehmet@atlas.com', role: 'agent', level: 1 },
    { id: 'atlas_agent_3', name: 'Zeynep Arslan', email: 'zeynep@atlas.com', role: 'supervisor', level: 2 },
    { id: 'atlas_admin', name: 'Admin Atlas', email: 'admin@atlas.com', role: 'admin', level: 3 }
  ];

  const passwordHash = bcrypt.hashSync('password123', 10);
  atlasAgents.forEach(a => {
    dbRun(
      'INSERT INTO users (id, tenant_id, name, email, password_hash, role, level) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [a.id, 'atlas_support', a.name, a.email, passwordHash, a.role, a.level]
    );
  });
  console.log(`   ✅ ${atlasAgents.length} agents created`);

  // Atlas Queues
  const atlasQueues = [
    { id: 'atlas_q_sales', name: 'Sales', description: 'Satış departmanı', priority: 2 },
    { id: 'atlas_q_tech', name: 'Technical Support', description: 'Teknik destek', priority: 1 },
    { id: 'atlas_q_billing', name: 'Billing', description: 'Fatura departmanı', priority: 1 }
  ];

  atlasQueues.forEach(q => {
    dbRun(
      'INSERT INTO queues (id, tenant_id, name, description, priority) VALUES (?, ?, ?, ?, ?)',
      [q.id, 'atlas_support', q.name, q.description, q.priority]
    );
  });
  console.log(`   ✅ ${atlasQueues.length} queues created`);

  // Atlas Phone Numbers
  const atlasNumbers = [
    { id: uuid(), number: '+90 850 111 0001', queue_id: 'atlas_q_sales', label: 'Sales' },
    { id: uuid(), number: '+90 850 111 0002', queue_id: 'atlas_q_tech', label: 'Technical' },
    { id: uuid(), number: '+90 850 111 0003', queue_id: 'atlas_q_billing', label: 'Billing' }
  ];

  atlasNumbers.forEach(n => {
    dbRun(
      'INSERT INTO phone_numbers (id, tenant_id, number, queue_id, label) VALUES (?, ?, ?, ?, ?)',
      [n.id, 'atlas_support', n.number, n.queue_id, n.label]
    );
  });
  console.log(`   ✅ ${atlasNumbers.length} phone numbers created`);

  // ═══════════════════════════════════════════
  // TENANT 2: Nova Logistics
  // ═══════════════════════════════════════════
  console.log('\n📦 Creating tenant: Nova Logistics');
  dbRun(
    `INSERT INTO tenants (id, name, industry, timezone, language, business_hours_start, business_hours_end, business_days)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ['nova_logistics', 'Nova Logistics', 'Logistics & Shipping', 'Europe/Istanbul', 'Turkish', '08:00', '20:00', 'Mon,Tue,Wed,Thu,Fri,Sat']
  );

  // Nova AI Settings
  dbRun(
    `INSERT INTO tenant_settings (tenant_id, company_name, tone, language, forbidden_topics, escalation_rules, monthly_max_tokens, monthly_max_minutes, data_retention_days)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['nova_logistics', 'Nova Logistics', 'formal', 'en',
      'insurance claims process,driver personal info',
      'If shipment lost or damaged beyond repair, escalate to claims department supervisor.',
      50000, 500, 180]
  );

  // Nova Branding
  dbRun(
    `INSERT INTO tenant_branding (tenant_id, logo_url, primary_color, secondary_color, company_name)
     VALUES (?, ?, ?, ?, ?)`,
    ['nova_logistics', '/assets/nova-logo.svg', '#ff6b35', '#2ec4b6', 'Nova Logistics']
  );

  // Nova Pricing
  dbRun(
    `INSERT INTO tenant_pricing (tenant_id, price_per_minute, price_per_ai_token, currency) VALUES (?, ?, ?, ?)`,
    ['nova_logistics', 0.03, 0.000015, 'EUR']
  );

  // Nova Telephony (disabled by default)
  dbRun(
    `INSERT INTO tenant_telephony (id, tenant_id, provider, account_sid, auth_token_encrypted, phone_number, enabled)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['tel_nova', 'nova_logistics', 'twilio', 'AC_DEMO_SID', '', '+15559876543', 0]
  );

  const novaAgents = [
    { id: 'nova_agent_1', name: 'Kerem Yıldırım', email: 'kerem@nova.com', role: 'agent', level: 1 },
    { id: 'nova_agent_2', name: 'Selin Çelik', email: 'selin@nova.com', role: 'agent', level: 1 },
    { id: 'nova_agent_3', name: 'Barış Koç', email: 'baris@nova.com', role: 'supervisor', level: 2 },
    { id: 'nova_admin', name: 'Admin Nova', email: 'admin@nova.com', role: 'admin', level: 3 }
  ];

  novaAgents.forEach(a => {
    dbRun(
      'INSERT INTO users (id, tenant_id, name, email, password_hash, role, level) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [a.id, 'nova_logistics', a.name, a.email, passwordHash, a.role, a.level]
    );
  });
  console.log(`   ✅ ${novaAgents.length} agents created`);

  const novaQueues = [
    { id: 'nova_q_tracking', name: 'Shipment Tracking', description: 'Kargo takibi', priority: 2 },
    { id: 'nova_q_claims', name: 'Claims', description: 'Hasar talepleri', priority: 1 },
    { id: 'nova_q_general', name: 'General Inquiry', description: 'Genel bilgi', priority: 0 }
  ];

  novaQueues.forEach(q => {
    dbRun(
      'INSERT INTO queues (id, tenant_id, name, description, priority) VALUES (?, ?, ?, ?, ?)',
      [q.id, 'nova_logistics', q.name, q.description, q.priority]
    );
  });
  console.log(`   ✅ ${novaQueues.length} queues created`);

  const novaNumbers = [
    { id: uuid(), number: '+90 850 222 0001', queue_id: 'nova_q_tracking', label: 'Tracking' },
    { id: uuid(), number: '+90 850 222 0002', queue_id: 'nova_q_claims', label: 'Claims' },
    { id: uuid(), number: '+90 850 222 0003', queue_id: 'nova_q_general', label: 'General' }
  ];

  novaNumbers.forEach(n => {
    dbRun(
      'INSERT INTO phone_numbers (id, tenant_id, number, queue_id, label) VALUES (?, ?, ?, ?, ?)',
      [n.id, 'nova_logistics', n.number, n.queue_id, n.label]
    );
  });
  console.log(`   ✅ ${novaNumbers.length} phone numbers created`);

  // ═══════════════════════════════════════════
  // MOCK CALLS GENERATION + AI ENRICHMENT
  // ═══════════════════════════════════════════
  console.log('\n📞 Generating mock calls...');

  const statuses = ['completed', 'completed', 'completed', 'completed', 'abandoned', 'missed'];
  const resolutions = ['resolved', 'resolved', 'resolved', 'follow_up', 'escalated', 'unresolved'];

  function generateCalls(tenantId, agents, queues, inboundCount, outboundCount) {
    const tenant = dbPrepareGet('SELECT * FROM tenants WHERE id = ?', [tenantId]);
    const settings = dbPrepareGet('SELECT * FROM tenant_settings WHERE tenant_id = ?', [tenantId]);

    for (let i = 0; i < inboundCount; i++) {
      const callId = uuid();
      const agent = agents[Math.floor(Math.random() * (agents.length - 1))];
      const queue = queues[Math.floor(Math.random() * queues.length)];
      const status = statuses[Math.floor(Math.random() * statuses.length)];
      const resolution = status === 'completed' ? resolutions[Math.floor(Math.random() * resolutions.length)] : null;
      const duration = status === 'completed' ? Math.floor(Math.random() * 900) + 60 : Math.floor(Math.random() * 30);

      const daysAgo = Math.floor(Math.random() * 30);
      const hour = 9 + Math.floor(Math.random() * 9);
      const minute = Math.floor(Math.random() * 60);
      const d = new Date();
      d.setDate(d.getDate() - daysAgo);
      d.setHours(hour, minute, 0, 0);
      if (d.getDay() === 0) d.setDate(d.getDate() + 1);
      if (d.getDay() === 6) d.setDate(d.getDate() + 2);

      const startedAt = d.toISOString();
      const endedAt = new Date(d.getTime() + duration * 1000).toISOString();
      const callerNumber = `+90 5${Math.floor(Math.random() * 100).toString().padStart(2, '0')} ${Math.floor(Math.random() * 10000000).toString().padStart(7, '0')}`;
      const transcript = status === 'completed' ? generateTranscript('inbound', queue.name, agent.name, tenant.name) : null;
      const sentimentScore = status === 'completed' ? generateSentimentScore() : null;
      const summary = status === 'completed' ? generateCallSummary(queue.name, resolution) : null;
      const recordingUrl = status === 'completed' ? `https://recordings.callcenter.io/${tenantId}/${callId}.wav` : null;

      // AI enrichment for completed calls
      let intent = null, aiSummary = null, aiNextAction = null;
      if (status === 'completed' && transcript) {
        const analysis = aiService.analyzeTranscript(transcript, settings);
        intent = analysis.intent;
        aiSummary = analysis.summary;
        aiNextAction = analysis.next_action;
      }

      dbRun(
        `INSERT INTO calls (id, tenant_id, call_type, caller_number, callee_number, agent_id, queue_id,
          duration, status, recording_url, transcript_text, sentiment_score, resolution_status,
          ivr_selection, call_summary, intent, ai_summary, ai_next_action, started_at, ended_at)
        VALUES (?, ?, 'inbound', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [callId, tenantId, callerNumber, null, agent.id, queue.id,
          duration, status, recordingUrl, transcript, sentimentScore, resolution,
          queue.name, summary, intent, aiSummary, aiNextAction, startedAt, endedAt]
      );

      dbRun('INSERT INTO call_logs (id, call_id, tenant_id, event_type, timestamp) VALUES (?, ?, ?, ?, ?)',
        [uuid(), callId, tenantId, 'call_initiated', startedAt]);
      if (status === 'completed') {
        dbRun('INSERT INTO call_logs (id, call_id, tenant_id, event_type, timestamp) VALUES (?, ?, ?, ?, ?)',
          [uuid(), callId, tenantId, 'agent_connected', startedAt]);
        dbRun('INSERT INTO call_logs (id, call_id, tenant_id, event_type, timestamp) VALUES (?, ?, ?, ?, ?)',
          [uuid(), callId, tenantId, 'call_completed', endedAt]);
      }
    }

    for (let i = 0; i < outboundCount; i++) {
      const callId = uuid();
      const agent = agents[Math.floor(Math.random() * (agents.length - 1))];
      const queue = queues[Math.floor(Math.random() * queues.length)];
      const duration = Math.floor(Math.random() * 600) + 60;

      const daysAgo = Math.floor(Math.random() * 30);
      const hour = 9 + Math.floor(Math.random() * 9);
      const minute = Math.floor(Math.random() * 60);
      const d = new Date();
      d.setDate(d.getDate() - daysAgo);
      d.setHours(hour, minute, 0, 0);
      if (d.getDay() === 0) d.setDate(d.getDate() + 1);
      if (d.getDay() === 6) d.setDate(d.getDate() + 2);

      const startedAt = d.toISOString();
      const endedAt = new Date(d.getTime() + duration * 1000).toISOString();
      const calleeNumber = `+90 5${Math.floor(Math.random() * 100).toString().padStart(2, '0')} ${Math.floor(Math.random() * 10000000).toString().padStart(7, '0')}`;
      const resolution = resolutions[Math.floor(Math.random() * resolutions.length)];
      const transcript = generateTranscript('outbound', null, agent.name, tenant.name);
      const sentiment = generateSentimentScore();
      const summary = generateCallSummary(queue.name, resolution);
      const recordingUrl = `https://recordings.callcenter.io/${tenantId}/${callId}.wav`;

      // AI enrichment
      const analysis = aiService.analyzeTranscript(transcript, settings);

      dbRun(
        `INSERT INTO calls (id, tenant_id, call_type, caller_number, callee_number, agent_id, queue_id,
          duration, status, recording_url, transcript_text, sentiment_score, resolution_status,
          call_summary, intent, ai_summary, ai_next_action, started_at, ended_at)
        VALUES (?, ?, 'outbound', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [callId, tenantId, agent.name, calleeNumber, agent.id, queue.id,
          duration, 'completed', recordingUrl, transcript, sentiment, resolution,
          summary, analysis.intent, analysis.summary, analysis.next_action, startedAt, endedAt]
      );

      dbRun('INSERT INTO call_logs (id, call_id, tenant_id, event_type, timestamp) VALUES (?, ?, ?, ?, ?)',
        [uuid(), callId, tenantId, 'outbound_initiated', startedAt]);
      dbRun('INSERT INTO call_logs (id, call_id, tenant_id, event_type, timestamp) VALUES (?, ?, ?, ?, ?)',
        [uuid(), callId, tenantId, 'call_completed', endedAt]);
    }
  }

  generateCalls('atlas_support', atlasAgents, atlasQueues, 200, 80);
  console.log('   ✅ Atlas Support: 200 inbound + 80 outbound calls');

  generateCalls('nova_logistics', novaAgents, novaQueues, 120, 50);
  console.log('   ✅ Nova Logistics: 120 inbound + 50 outbound calls');

  // Save to disk
  saveDatabase();

  const atlasCalls = dbPrepareGet('SELECT COUNT(*) as c FROM calls WHERE tenant_id = ?', ['atlas_support']).c;
  const novaCalls = dbPrepareGet('SELECT COUNT(*) as c FROM calls WHERE tenant_id = ?', ['nova_logistics']).c;
  const aiEnriched = dbPrepareGet('SELECT COUNT(*) as c FROM calls WHERE intent IS NOT NULL').c;
  console.log(`\n📊 Final counts:`);
  console.log(`   Atlas Support: ${atlasCalls} calls`);
  console.log(`   Nova Logistics: ${novaCalls} calls`);
  console.log(`   🤖 AI-enriched: ${aiEnriched} calls`);
  console.log('\n✅ Seed complete!\n');
}

if (require.main === module) {
  seed().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}

module.exports = { seed };
