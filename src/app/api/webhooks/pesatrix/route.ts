import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { reconcileWebhookTransaction } from '@/lib/services/reconciliation';
import { normalizeKenyanPhone } from '@/lib/utils/phone';
import { logSystemAudit } from '@/lib/repositories/audit';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const signature = req.headers.get('X-Pesatrix-Signature');
    const eventHeader = req.headers.get('X-Pesatrix-Event');

    // Reject missing signature or event header
    if (!signature || !eventHeader) {
      await logSystemAudit('WEBHOOK_SIGNATURE_REJECTED', {
        source_system: 'pesatrix',
        reason: 'Missing signature or event header'
      });
      return NextResponse.json(
        { success: false, error: 'Missing required headers' },
        { status: 401 }
      );
    }

    // Require signature to be exactly a 64-character hexadecimal SHA-256 digest
    if (!/^[a-fA-F0-9]{64}$/.test(signature)) {
      await logSystemAudit('WEBHOOK_SIGNATURE_REJECTED', {
        source_system: 'pesatrix',
        reason: 'Invalid signature format (not a 64-character hex)'
      });
      return NextResponse.json(
        { success: false, error: 'Invalid Pesatrix webhook signature' },
        { status: 403 }
      );
    }

    // Read raw body exactly once
    let rawBody: string;
    try {
      rawBody = await req.text();
    } catch (err: any) {
      return NextResponse.json(
        { success: false, error: 'Failed to read request body' },
        { status: 400 }
      );
    }

    // Require PESATRIX_WEBHOOK_SECRET
    const secret = process.env.PESATRIX_WEBHOOK_SECRET;
    if (!secret) {
      console.error('[Pesatrix Webhook] PESATRIX_WEBHOOK_SECRET is not configured');
      return NextResponse.json(
        { success: false, error: 'Internal Server Error' },
        { status: 500 }
      );
    }

    // Compute expected signature
    const computedSignature = crypto
      .createHmac('sha256', secret)
      .update(rawBody, 'utf8')
      .digest('hex');

    // Timing safe comparison using Buffers
    const providedBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(computedSignature, 'hex');

    if (providedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(providedBuffer, expectedBuffer)) {
      await logSystemAudit('WEBHOOK_SIGNATURE_REJECTED', {
        source_system: 'pesatrix',
        reason: 'HMAC signature verification failed'
      });
      return NextResponse.json(
        { success: false, error: 'Invalid Pesatrix webhook signature' },
        { status: 403 }
      );
    }

    // Parse JSON only after signature verification is valid
    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch (parseErr) {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON payload' },
        { status: 400 }
      );
    }

    // Payload validation
    if (!payload || typeof payload !== 'object') {
      return NextResponse.json(
        { success: false, error: 'Invalid Pesatrix webhook payload' },
        { status: 400 }
      );
    }

    const { event, transaction_id, amount, phone, platform, timestamp, reference_id, user_id } = payload;

    // Reject unsupported event types
    if (event !== 'activation' && event !== 'withdrawal') {
      return NextResponse.json(
        { success: false, error: 'Invalid Pesatrix webhook payload' },
        { status: 400 }
      );
    }

    // Reject mismatch between event header and body
    if (eventHeader !== event) {
      return NextResponse.json(
        { success: false, error: 'Invalid Pesatrix webhook payload' },
        { status: 400 }
      );
    }

    // Platform must equal pesatrix
    if (typeof platform !== 'string' || platform.toLowerCase() !== 'pesatrix') {
      return NextResponse.json(
        { success: false, error: 'Invalid Pesatrix webhook payload' },
        { status: 400 }
      );
    }

    // Amount must be a positive number
    if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
      return NextResponse.json(
        { success: false, error: 'Invalid Pesatrix webhook payload' },
        { status: 400 }
      );
    }

    // reference_id and user_id are internal Pesatrix ids and must be present.
    // transaction_id is the M-Pesa receipt (activation) or B2C id (withdrawal) and
    // may legitimately be an empty string when the provider did not return one, so
    // it only has to be a string here.
    if (
      typeof transaction_id !== 'string' ||
      typeof reference_id !== 'string' || reference_id.trim() === '' ||
      typeof user_id !== 'string' || user_id.trim() === ''
    ) {
      return NextResponse.json(
        { success: false, error: 'Invalid Pesatrix webhook payload' },
        { status: 400 }
      );
    }

    // Store the provider reference only when present; never persist an empty string.
    const normalizedReceipt = transaction_id.trim() === '' ? null : transaction_id.trim();

    // Phone number must be normalized
    if (typeof phone !== 'string' || phone.trim() === '') {
      return NextResponse.json(
        { success: false, error: 'Invalid Pesatrix webhook payload' },
        { status: 400 }
      );
    }

    let normalizedPhone: string;
    try {
      normalizedPhone = normalizeKenyanPhone(phone);
    } catch (phoneErr) {
      return NextResponse.json(
        { success: false, error: 'Invalid Pesatrix webhook payload' },
        { status: 400 }
      );
    }

    // Valid ISO timestamp check
    if (typeof timestamp !== 'string' || isNaN(Date.parse(timestamp))) {
      return NextResponse.json(
        { success: false, error: 'Invalid Pesatrix webhook payload' },
        { status: 400 }
      );
    }

    // Generate deterministic event key: pesatrix:<event>:<reference_id>.
    // reference_id is the stable internal id (activation_payments.id / withdrawal
    // request id). transaction_id may be empty and several parallel B2C-result
    // routes can fire for the same withdrawal, so we dedupe on reference_id per the
    // Pesatrix sender contract.
    const eventKey = `pesatrix:${event}:${reference_id}`;

    // Call reconciliation database driver
    const result = await reconcileWebhookTransaction({
      source_system: 'pesatrix',
      event_key: eventKey,
      event_type: event,
      schema_version: null,
      raw_payload_string: rawBody,
      raw_payload: payload,
      occurred_at: timestamp,
      tx_direction: event === 'activation' ? 'IN' : 'OUT',
      tx_type: event === 'activation' ? 'activation' : 'withdrawal',
      payment_type: event === 'activation' ? 'activation' : 'withdrawal',
      product_stream: event === 'activation' ? 'activation' : 'withdrawal',
      module: event === 'activation' ? 'account_activation' : 'wallet',
      service_source: event === 'activation' ? 'pesatrix_activation' : 'pesatrix_wallet_withdrawal',
      amount: Number(amount),
      payer_phone: event === 'activation' ? normalizedPhone : null,
      recipient_phone: event === 'withdrawal' ? normalizedPhone : null,
      receipt: normalizedReceipt,
      external_reference_id: reference_id,
      external_user_id: user_id,
      completed_at: timestamp,
      metadata: {
        timestamp,
        user_id
      }
    });

    if (result.status === 'idempotency_conflict') {
      return NextResponse.json(
        { success: false, error: result.error || 'Idempotency conflict' },
        { status: 409 }
      );
    }

    if (result.status === 'error') {
      return NextResponse.json(
        { success: false, error: result.error || 'Database processing failure' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      status: result.duplicate ? 'duplicate' : 'processed',
      provider: 'pesatrix',
      event,
      event_key: eventKey
    });

  } catch (err: any) {
    console.error('[Pesatrix Webhook Route Error]:', err);
    return NextResponse.json(
      { success: false, error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
