import { test } from 'node:test';
import assert from 'node:assert';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { verifyWebhookHmac } from '../src/lib/webhooks/verify-hmac';
import { normalizeKenyanPhone } from '../src/lib/utils/phone';
import { buildAlertMessage } from '../src/lib/notifications/send-transaction-alert';
import { getReadableLabel } from '../src/lib/utils/labels';
import { POST } from '../src/app/webhooks/bingwaone/route';
import { POST as pesatrixPOST } from '../src/app/api/webhooks/pesatrix/route';

// Programmatically load .env for DB integration tests
try {
  const envPath = path.resolve(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf8');
    envConfig.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const parts = trimmed.split('=');
        const key = parts[0].trim();
        const val = parts.slice(1).join('=').trim();
        const cleanVal = val.replace(/^["']|["']$/g, '');
        if (key && !(key in process.env)) {
          process.env[key] = cleanVal;
        }
      }
    });
  }
} catch (e) {
  console.warn('Failed to load .env file programmatically', e);
}

// Make sure BINGWAONE_WEBHOOK_SECRET is set to secret123 for signature tests
process.env.BINGWAONE_WEBHOOK_SECRET = 'secret123';
process.env.PESATRIX_WEBHOOK_SECRET = 'test_secret_123';

const BZ_SECRET = 'test_bz_secret_value_123';
const PT_SECRET = 'test_pt_secret_value_456';

test('HMAC Signature Verification - BingwaOne Format', () => {
  const body = JSON.stringify({ event: 'payment.completed', amount: 500 });
  const signature = 'sha256=' + crypto.createHmac('sha256', BZ_SECRET).update(body).digest('hex');

  // Assert successful verification
  assert.strictEqual(verifyWebhookHmac(body, signature, BZ_SECRET, 'bingwaone'), true);

  // Assert failed verification on wrong secret
  assert.strictEqual(verifyWebhookHmac(body, signature, 'wrong_secret', 'bingwaone'), false);

  // Assert failed verification on malformed header
  assert.strictEqual(verifyWebhookHmac(body, signature.replace('sha256=', ''), BZ_SECRET, 'bingwaone'), false);
});

test('HMAC Signature Verification - Pesatrix Format', () => {
  const body = JSON.stringify({ event: 'activation', amount: 200 });
  const signature = crypto.createHmac('sha256', PT_SECRET).update(body).digest('hex');

  // Assert successful verification
  assert.strictEqual(verifyWebhookHmac(body, signature, PT_SECRET, 'pesatrix'), true);

  // Assert failed verification on modified signature
  assert.strictEqual(verifyWebhookHmac(body, signature + 'f', PT_SECRET, 'pesatrix'), false);
});

test('Kenyan Phone Normalization Rules', () => {
  // 10 digits starting with 0
  assert.strictEqual(normalizeKenyanPhone('0712345678'), '254712345678');
  assert.strictEqual(normalizeKenyanPhone('0112345678'), '254112345678');

  // 9 digits starting with 7 or 1
  assert.strictEqual(normalizeKenyanPhone('712345678'), '254712345678');
  assert.strictEqual(normalizeKenyanPhone('112345678'), '254112345678');

  // 12 digits starting with 254
  assert.strictEqual(normalizeKenyanPhone('254712345678'), '254712345678');
  assert.strictEqual(normalizeKenyanPhone('254112345678'), '254112345678');

  // With plus prefix
  assert.strictEqual(normalizeKenyanPhone('+254712345678'), '254712345678');

  // Failures: invalid lengths and country prefixes
  assert.throws(() => normalizeKenyanPhone('0812345678')); // invalid prefix
  assert.throws(() => normalizeKenyanPhone('071234567'));  // too short
  assert.throws(() => normalizeKenyanPhone('2547123456789')); // too long
});

test('Readable Labels Mappings', () => {
  assert.strictEqual(getReadableLabel('mini_site'), 'Mini Sites');
  assert.strictEqual(getReadableLabel('whatsapp_auto_post'), 'WhatsApp Auto Post');
  assert.strictEqual(getReadableLabel('account_activation'), 'Account Activations');
  assert.strictEqual(getReadableLabel('wallet_withdrawal'), 'Wallet Withdrawal');
  assert.strictEqual(getReadableLabel('some_custom_module_name'), 'Some Custom Module Name');
});

test('Unified Message Templates Generation', () => {
  const incomingParams = {
    transaction_id: 'tx_uuid_123',
    source_system: 'bingwaone',
    direction: 'IN' as const,
    transaction_type: 'payment.completed',
    amount: 1250,
    phone_number: '254712345678',
    mpesa_receipt: 'TFA8765432',
    module: 'mini_site'
  };

  const smsIncoming = buildAlertMessage(incomingParams, 'sms');
  assert.match(smsIncoming, /SKYLINK PAYBILL/);
  assert.match(smsIncoming, /Received KES 1,250\.00/);
  assert.match(smsIncoming, /Source: BingwaOne/);
  assert.match(smsIncoming, /Module: Mini Sites/);
  assert.match(smsIncoming, /Phone: 254712345678/);
  assert.match(smsIncoming, /Receipt: TFA8765432/);

  const waIncoming = buildAlertMessage(incomingParams, 'whatsapp');
  assert.match(waIncoming, /\*SKYLINK PAYBILL ALERT\*/);
  assert.match(waIncoming, /Money received: \*KES 1,250\.00\*/);
});

// ==========================================
// BINGWAONE WEBHOOK RECEIVER ROUTE TESTS
// ==========================================

test('Route Handler - Reject Missing Headers', async () => {
  const req = new Request('http://localhost/webhooks/bingwaone', {
    method: 'POST',
    body: '{"test":true}'
  });

  const res = await POST(req);
  assert.strictEqual(res.status, 400);
  const data = await res.json();
  assert.strictEqual(data.success, false);
  assert.match(data.error, /Missing required headers/);
});

test('Route Handler - Reject Invalid Signature Format', async () => {
  const req = new Request('http://localhost/webhooks/bingwaone', {
    method: 'POST',
    headers: {
      'X-BingwaOne-Event': 'payment:test-event-123:completed',
      'X-BingwaOne-Signature': 'invalid_format_without_sha256_prefix'
    },
    body: '{"test":true}'
  });

  const res = await POST(req);
  assert.strictEqual(res.status, 400);
  const data = await res.json();
  assert.strictEqual(data.success, false);
  assert.match(data.error, /Invalid signature format/);
});

test('Route Handler - Reject Invalid Signature', async () => {
  const req = new Request('http://localhost/webhooks/bingwaone', {
    method: 'POST',
    headers: {
      'X-BingwaOne-Event': 'payment:test-event-123:completed',
      'X-BingwaOne-Signature': 'sha256=5bb8d15d65f577cf4147f2618059ff94eb2245b79646b95bcf078328eb92040d' // changed last char
    },
    body: '{"test":true}'
  });

  const res = await POST(req);
  assert.strictEqual(res.status, 401);
  const data = await res.json();
  assert.strictEqual(data.success, false);
  assert.match(data.error, /Invalid webhook signature/);
});

test('Route Handler - Reject Malformed JSON', async () => {
  const body = '{"test":true, malformed';
  const signature = 'sha256=' + crypto.createHmac('sha256', 'secret123').update(body).digest('hex');

  const req = new Request('http://localhost/webhooks/bingwaone', {
    method: 'POST',
    headers: {
      'X-BingwaOne-Event': 'payment:test-event-123:completed',
      'X-BingwaOne-Signature': signature
    },
    body: body
  });

  const res = await POST(req);
  assert.strictEqual(res.status, 400);
  const data = await res.json();
  assert.strictEqual(data.success, false);
  assert.match(data.error, /Invalid JSON payload/);
});

test('Route Handler - Accept and Process Test Webhook', async () => {
  const uniqueEventKey = 'payment:test-event-' + crypto.randomUUID() + ':completed';
  const body = JSON.stringify({ test: true });
  const signature = 'sha256=' + crypto.createHmac('sha256', 'secret123').update(body).digest('hex');

  const req = new Request('http://localhost/webhooks/bingwaone', {
    method: 'POST',
    headers: {
      'X-BingwaOne-Event': uniqueEventKey,
      'X-BingwaOne-Signature': signature
    },
    body: body
  });

  const res = await POST(req);
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.success, true);
  assert.strictEqual(data.status, 'processed');
  assert.strictEqual(data.event_key, uniqueEventKey);

  // Send the same test webhook again to test duplicate response
  const reqDuplicate = new Request('http://localhost/webhooks/bingwaone', {
    method: 'POST',
    headers: {
      'X-BingwaOne-Event': uniqueEventKey,
      'X-BingwaOne-Signature': signature
    },
    body: body
  });

  const resDuplicate = await POST(reqDuplicate);
  assert.strictEqual(resDuplicate.status, 200);
  const dataDuplicate = await resDuplicate.json();
  assert.strictEqual(dataDuplicate.success, true);
  assert.strictEqual(dataDuplicate.status, 'duplicate');
  assert.strictEqual(dataDuplicate.event_key, uniqueEventKey);

  // Send same event key with changed body to test idempotency conflict
  const changedBody = JSON.stringify({ test: true, extra: 1 });
  const changedSignature = 'sha256=' + crypto.createHmac('sha256', 'secret123').update(changedBody).digest('hex');

  const reqConflict = new Request('http://localhost/webhooks/bingwaone', {
    method: 'POST',
    headers: {
      'X-BingwaOne-Event': uniqueEventKey,
      'X-BingwaOne-Signature': changedSignature
    },
    body: changedBody
  });

  const resConflict = await POST(reqConflict);
  assert.strictEqual(resConflict.status, 409);
  const dataConflict = await resConflict.json();
  assert.strictEqual(dataConflict.success, false);
  assert.match(dataConflict.error, /Idempotency conflict/);
});

test('Route Handler - Accept and Process Real Payment Webhook', async () => {
  const uniquePaymentId = crypto.randomUUID();
  const uniqueEventKey = `payment:${uniquePaymentId}:completed`;
  const mpesaReceipt = 'TFA' + Math.floor(1000000 + Math.random() * 9000000);
  
  const body = JSON.stringify({
    schema_version: 1,
    event: 'payment.completed',
    source_system: 'bingwaone',
    occurred_at: new Date().toISOString(),
    payment: {
      id: uniquePaymentId,
      type: 'subscription',
      module: 'mini_site',
      amount: 1500,
      currency: 'KES',
      payer_phone: '0712345678',
      recipient_phone: null,
      receipt: mpesaReceipt,
      provider: 'mpesa',
      paybill_id: 'skylink_bundlefasta',
      account_reference: 'Mini Site Premium',
      service_source: 'mini_site_subscription',
      initiated_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      metadata: { custom_tag: 'test-run' }
    },
    agent: {
      id: crypto.randomUUID(),
      name: 'Test Agent',
      business_name: 'Test Shop',
      username: 'testshop'
    }
  });

  const signature = 'sha256=' + crypto.createHmac('sha256', 'secret123').update(body).digest('hex');

  const req = new Request('http://localhost/webhooks/bingwaone', {
    method: 'POST',
    headers: {
      'X-BingwaOne-Event': uniqueEventKey,
      'X-BingwaOne-Signature': signature
    },
    body: body
  });

  const res = await POST(req);
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.success, true);
  assert.strictEqual(data.status, 'processed');
  assert.strictEqual(data.event_key, uniqueEventKey);

  // Sending again should be duplicate
  const reqDuplicate = new Request('http://localhost/webhooks/bingwaone', {
    method: 'POST',
    headers: {
      'X-BingwaOne-Event': uniqueEventKey,
      'X-BingwaOne-Signature': signature
    },
    body: body
  });

  const resDuplicate = await POST(reqDuplicate);
  assert.strictEqual(resDuplicate.status, 200);
  const dataDuplicate = await resDuplicate.json();
  assert.strictEqual(dataDuplicate.success, true);
  assert.strictEqual(dataDuplicate.status, 'duplicate');
});

test('Route Handler - Accept and Process Wallet Withdrawal Webhook', async () => {
  const uniqueWithdrawalId = crypto.randomUUID();
  const uniqueEventKey = `wallet-withdrawal:${uniqueWithdrawalId}:completed`;
  const providerRef = 'WDL' + Math.floor(1000000 + Math.random() * 9000000);
  
  const body = JSON.stringify({
    schema_version: 1,
    event: 'wallet.withdrawal.completed',
    source_system: 'bingwaone',
    occurred_at: new Date().toISOString(),
    withdrawal: {
      id: uniqueWithdrawalId,
      amount: 2500,
      currency: 'KES',
      destination: '0712345678',
      provider_reference: providerRef,
      transaction_id: providerRef,
      service_source: 'wallet_withdrawal',
      completed_at: new Date().toISOString(),
      metadata: { wdl_tag: 'test-run' }
    },
    agent: {
      id: crypto.randomUUID(),
      name: 'Test Agent',
      business_name: 'Test Shop',
      username: 'testshop'
    }
  });

  const signature = 'sha256=' + crypto.createHmac('sha256', 'secret123').update(body).digest('hex');

  const req = new Request('http://localhost/webhooks/bingwaone', {
    method: 'POST',
    headers: {
      'X-BingwaOne-Event': uniqueEventKey,
      'X-BingwaOne-Signature': signature
    },
    body: body
  });

  const res = await POST(req);
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.success, true);
  assert.strictEqual(data.status, 'processed');
  assert.strictEqual(data.event_key, uniqueEventKey);

  // Sending again should be duplicate
  const reqDuplicate = new Request('http://localhost/webhooks/bingwaone', {
    method: 'POST',
    headers: {
      'X-BingwaOne-Event': uniqueEventKey,
      'X-BingwaOne-Signature': signature
    },
    body: body
  });

  const resDuplicate = await POST(reqDuplicate);
  assert.strictEqual(resDuplicate.status, 200);
  const dataDuplicate = await resDuplicate.json();
  assert.strictEqual(dataDuplicate.success, true);
  assert.strictEqual(dataDuplicate.status, 'duplicate');
});

test('Route Handler - Wallet Withdrawal using real sender fields (destination_phone + conversation_id)', async () => {
  // BingwaOne actually sends destination_phone (not destination) and only
  // conversation_id as the provider reference (no provider_reference/transaction_id).
  const uniqueWithdrawalId = crypto.randomUUID();
  const uniqueEventKey = `wallet-withdrawal:${uniqueWithdrawalId}:completed`;

  const body = JSON.stringify({
    schema_version: 1,
    event: 'wallet.withdrawal.completed',
    source_system: 'bingwazone',
    occurred_at: new Date().toISOString(),
    withdrawal: {
      id: uniqueWithdrawalId,
      amount: 750,
      currency: 'KES',
      destination_phone: '0712345678',
      conversation_id: 'AG_' + Math.floor(1000000 + Math.random() * 9000000),
      service_source: 'agent_wallet'
    },
    agent: { id: crypto.randomUUID(), name: 'Agent', business_name: 'Shop', username: 'shop' }
  });

  const signature = 'sha256=' + crypto.createHmac('sha256', 'secret123').update(body).digest('hex');

  const req = new Request('http://localhost/webhooks/bingwaone', {
    method: 'POST',
    headers: {
      'X-BingwaZone-Event': uniqueEventKey,
      'X-BingwaZone-Signature': signature
    },
    body
  });

  const res = await POST(req);
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.success, true);
  assert.strictEqual(data.status, 'processed');
  assert.strictEqual(data.event_key, uniqueEventKey);
});

test('Route Handler - Accept and Process Bonga Payout Webhook', async () => {
  const uniquePaymentId = crypto.randomUUID();
  const uniqueEventKey = `bonga-payout:${uniquePaymentId}:completed`;

  const body = JSON.stringify({
    schema_version: 1,
    event: 'bonga.payout.completed',
    source_system: 'bingwazone',
    occurred_at: new Date().toISOString(),
    transfer: {
      amount: 250,
      currency: 'KES',
      destination_phone: '0712345678',
      conversation_id: 'BG_' + Math.floor(1000000 + Math.random() * 9000000),
      service_source: 'bonga_sell',
      metadata: { bonga_tag: 'test-run' }
    },
    agent: { id: crypto.randomUUID(), name: 'Agent', business_name: 'Shop', username: 'shop' }
  });

  const signature = 'sha256=' + crypto.createHmac('sha256', 'secret123').update(body).digest('hex');

  const req = new Request('http://localhost/webhooks/bingwaone', {
    method: 'POST',
    headers: {
      'X-BingwaZone-Event': uniqueEventKey,
      'X-BingwaZone-Signature': signature
    },
    body
  });

  const res = await POST(req);
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.success, true);
  assert.strictEqual(data.status, 'processed');
  assert.strictEqual(data.event_key, uniqueEventKey);

  // Re-send should be treated as a duplicate (idempotent on event_key)
  const reqDuplicate = new Request('http://localhost/webhooks/bingwaone', {
    method: 'POST',
    headers: {
      'X-BingwaZone-Event': uniqueEventKey,
      'X-BingwaZone-Signature': signature
    },
    body
  });

  const resDuplicate = await POST(reqDuplicate);
  assert.strictEqual(resDuplicate.status, 200);
  const dataDuplicate = await resDuplicate.json();
  assert.strictEqual(dataDuplicate.success, true);
  assert.strictEqual(dataDuplicate.status, 'duplicate');
});

// ==========================================
// PESATRIX WEBHOOK RECEIVER ROUTE TESTS
// ==========================================

test('Pesatrix Route Handler - Reject Missing Headers', async () => {
  const req = new Request('http://localhost/api/webhooks/pesatrix', {
    method: 'POST',
    body: '{"test":true}'
  });

  const res = await pesatrixPOST(req);
  assert.strictEqual(res.status, 401);
  const data = await res.json();
  assert.strictEqual(data.success, false);
  assert.match(data.error, /Missing required headers/);
});

test('Pesatrix Route Handler - Reject Invalid Signature Format', async () => {
  const req = new Request('http://localhost/api/webhooks/pesatrix', {
    method: 'POST',
    headers: {
      'X-Pesatrix-Event': 'activation',
      'X-Pesatrix-Signature': 'invalid_format'
    },
    body: '{"test":true}'
  });

  const res = await pesatrixPOST(req);
  assert.strictEqual(res.status, 403);
  const data = await res.json();
  assert.strictEqual(data.success, false);
  assert.match(data.error, /Invalid Pesatrix webhook signature/);
});

test('Pesatrix Route Handler - Reject Invalid Signature', async () => {
  const body = JSON.stringify({ event: 'activation' });
  const req = new Request('http://localhost/api/webhooks/pesatrix', {
    method: 'POST',
    headers: {
      'X-Pesatrix-Event': 'activation',
      'X-Pesatrix-Signature': 'a'.repeat(64)
    },
    body
  });

  const res = await pesatrixPOST(req);
  assert.strictEqual(res.status, 403);
  const data = await res.json();
  assert.strictEqual(data.success, false);
  assert.match(data.error, /Invalid Pesatrix webhook signature/);
});

test('Pesatrix Route Handler - Reject Malformed JSON', async () => {
  process.env.PESATRIX_WEBHOOK_SECRET = 'test_secret_123';
  const body = '{"test":true, malformed';
  const signature = crypto.createHmac('sha256', 'test_secret_123').update(body).digest('hex');

  const req = new Request('http://localhost/api/webhooks/pesatrix', {
    method: 'POST',
    headers: {
      'X-Pesatrix-Event': 'activation',
      'X-Pesatrix-Signature': signature
    },
    body
  });

  const res = await pesatrixPOST(req);
  assert.strictEqual(res.status, 400);
  const data = await res.json();
  assert.strictEqual(data.success, false);
  assert.match(data.error, /Invalid JSON payload/);
});

test('Pesatrix Route Handler - Reject Header Event Mismatch', async () => {
  process.env.PESATRIX_WEBHOOK_SECRET = 'test_secret_123';
  const body = JSON.stringify({
    event: 'activation',
    transaction_id: 'TX123456789',
    amount: 1500.00,
    phone: '254712345678',
    platform: 'pesatrix',
    timestamp: '2026-06-14T17:48:28Z',
    reference_id: 'REF-98765',
    user_id: 'usr_abcd1234'
  });
  const signature = crypto.createHmac('sha256', 'test_secret_123').update(body).digest('hex');

  const req = new Request('http://localhost/api/webhooks/pesatrix', {
    method: 'POST',
    headers: {
      'X-Pesatrix-Event': 'withdrawal',
      'X-Pesatrix-Signature': signature
    },
    body
  });

  const res = await pesatrixPOST(req);
  assert.strictEqual(res.status, 400);
  const data = await res.json();
  assert.strictEqual(data.success, false);
  assert.match(data.error, /Invalid Pesatrix webhook payload/);
});

test('Pesatrix Route Handler - Reject Invalid Amount', async () => {
  process.env.PESATRIX_WEBHOOK_SECRET = 'test_secret_123';
  const body = JSON.stringify({
    event: 'activation',
    transaction_id: 'TX123456789',
    amount: -100.00,
    phone: '254712345678',
    platform: 'pesatrix',
    timestamp: '2026-06-14T17:48:28Z',
    reference_id: 'REF-98765',
    user_id: 'usr_abcd1234'
  });
  const signature = crypto.createHmac('sha256', 'test_secret_123').update(body).digest('hex');

  const req = new Request('http://localhost/api/webhooks/pesatrix', {
    method: 'POST',
    headers: {
      'X-Pesatrix-Event': 'activation',
      'X-Pesatrix-Signature': signature
    },
    body
  });

  const res = await pesatrixPOST(req);
  assert.strictEqual(res.status, 400);
  const data = await res.json();
  assert.strictEqual(data.success, false);
  assert.match(data.error, /Invalid Pesatrix webhook payload/);
});

test('Pesatrix Route Handler - Reject Invalid Phone Number', async () => {
  process.env.PESATRIX_WEBHOOK_SECRET = 'test_secret_123';
  const body = JSON.stringify({
    event: 'activation',
    transaction_id: 'TX123456789',
    amount: 1500.00,
    phone: 'invalid-phone',
    platform: 'pesatrix',
    timestamp: '2026-06-14T17:48:28Z',
    reference_id: 'REF-98765',
    user_id: 'usr_abcd1234'
  });
  const signature = crypto.createHmac('sha256', 'test_secret_123').update(body).digest('hex');

  const req = new Request('http://localhost/api/webhooks/pesatrix', {
    method: 'POST',
    headers: {
      'X-Pesatrix-Event': 'activation',
      'X-Pesatrix-Signature': signature
    },
    body
  });

  const res = await pesatrixPOST(req);
  assert.strictEqual(res.status, 400);
  const data = await res.json();
  assert.strictEqual(data.success, false);
  assert.match(data.error, /Invalid Pesatrix webhook payload/);
});

test('Pesatrix Route Handler - Ingestion and Duplicate Handling', async () => {
  const originalSecret = process.env.PESATRIX_WEBHOOK_SECRET;
  const originalBwUrl = process.env.PAYBILL_DASHBOARD_WEBHOOK_URL;
  const originalBwSecret = process.env.PAYBILL_DASHBOARD_WEBHOOK_SECRET;
  
  try {
    const testSecret = 'test_secret_value_123';
    process.env.PESATRIX_WEBHOOK_SECRET = testSecret;
    process.env.PAYBILL_DASHBOARD_WEBHOOK_URL = 'http://localhost/api/mock-endpoint';
    process.env.PAYBILL_DASHBOARD_WEBHOOK_SECRET = testSecret;

    const txId = 'TX_TEST_' + Math.floor(100000 + Math.random() * 900000);
    // reference_id is the idempotency key, so it must be unique per run.
    const refId = 'REF_TEST_' + Math.floor(100000 + Math.random() * 900000);
    const body = JSON.stringify({
      event: 'activation',
      transaction_id: txId,
      amount: 1500.00,
      phone: '254712345678',
      platform: 'pesatrix',
      timestamp: new Date().toISOString(),
      reference_id: refId,
      user_id: 'usr_test_abcd'
    });

    const signature = crypto.createHmac('sha256', testSecret).update(body).digest('hex');

    const req = new Request('http://localhost/api/webhooks/pesatrix', {
      method: 'POST',
      headers: {
        'X-Pesatrix-Event': 'activation',
        'X-Pesatrix-Signature': signature
      },
      body
    });

    const res = await pesatrixPOST(req);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.status, 'processed');
    assert.strictEqual(data.event, 'activation');
    assert.strictEqual(data.event_key, `pesatrix:activation:${refId}`);

    // Re-send to verify duplicate handling
    const reqDuplicate = new Request('http://localhost/api/webhooks/pesatrix', {
      method: 'POST',
      headers: {
        'X-Pesatrix-Event': 'activation',
        'X-Pesatrix-Signature': signature
      },
      body
    });

    const resDuplicate = await pesatrixPOST(reqDuplicate);
    assert.strictEqual(resDuplicate.status, 200);
    const dataDuplicate = await resDuplicate.json();
    assert.strictEqual(dataDuplicate.success, true);
    assert.strictEqual(dataDuplicate.status, 'duplicate');
    assert.strictEqual(dataDuplicate.event_key, `pesatrix:activation:${refId}`);

  } finally {
    process.env.PESATRIX_WEBHOOK_SECRET = originalSecret;
    process.env.PAYBILL_DASHBOARD_WEBHOOK_URL = originalBwUrl;
    process.env.PAYBILL_DASHBOARD_WEBHOOK_SECRET = originalBwSecret;
  }
});

