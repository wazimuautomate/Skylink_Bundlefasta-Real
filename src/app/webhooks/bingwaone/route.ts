import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase/server';
import { logSystemAudit } from '@/lib/repositories/audit';
import { normalizeKenyanPhone } from '@/lib/utils/phone';
import { triggerNotificationFlow } from '@/lib/notifications/send-transaction-alert';
import { resolveSourceId } from '@/lib/repositories/transactions';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const receivedAt = new Date().toISOString();
  
  // 1. Read headers and validate
  const signatureHeader = req.headers.get('X-BingwaOne-Signature') || req.headers.get('X-BingwaZone-Signature');
  const eventHeader = req.headers.get('X-BingwaOne-Event') || req.headers.get('X-BingwaZone-Event');

  if (!signatureHeader || !eventHeader) {
    return NextResponse.json(
      { success: false, error: 'Missing required headers' },
      { status: 400 }
    );
  }

  // Require signature format: sha256=<64-character hexadecimal value>
  if (!/^sha256=[a-fA-F0-9]{64}$/.test(signatureHeader)) {
    return NextResponse.json(
      { success: false, error: 'Invalid signature format' },
      { status: 400 }
    );
  }

  // 2. Read request body once
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: 'Failed to read request body' },
      { status: 400 }
    );
  }

  // Enforce reasonable request-body size protection (Limit to 1MB)
  if (rawBody.length > 1024 * 1024) {
    return NextResponse.json(
      { success: false, error: 'Payload too large' },
      { status: 413 }
    );
  }

  // 3. Verify signature using timingSafeEqual
  const secret = process.env.BINGWAONE_WEBHOOK_SECRET || process.env.BINGWAZONE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[BingwaOne Webhook] BINGWAONE_WEBHOOK_SECRET is not configured');
    return NextResponse.json(
      { success: false, error: 'Internal Server Error' },
      { status: 500 }
    );
  }

  const providedHex = signatureHeader.slice(7);
  const providedBuffer = Buffer.from(providedHex, 'hex');

  const computedHex = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
  const computedBuffer = Buffer.from(computedHex, 'hex');

  // Correctly validate Buffer lengths before calling timingSafeEqual
  if (providedBuffer.length !== computedBuffer.length || !crypto.timingSafeEqual(providedBuffer, computedBuffer)) {
    await logSystemAudit('WEBHOOK_SIGNATURE_REJECTED', {
      source_system: 'bingwaone',
      reason: 'HMAC signature verification failed'
    });
    return NextResponse.json(
      { success: false, error: 'Invalid webhook signature' },
      { status: 401 }
    );
  }

  // 4. Parse raw body after successful signature verification
  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch (err) {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON payload' },
      { status: 400 }
    );
  }

  // Calculate payload hash to detect changed payload for same event key
  const payloadHash = crypto.createHash('sha256').update(rawBody).digest('hex');

  // 5. Initialize Supabase Admin client
  const supabase = createAdminClient();

  // 6. Handle Test Webhook payloads (do not create transaction)
  if (payload.test === true) {
    try {
      // Check for duplicate test event key
      const { data: existingEvent, error: selectErr } = await supabase
        .from('webhook_events')
        .select('*')
        .eq('event_key', eventHeader)
        .maybeSingle();

      if (selectErr) throw selectErr;

      if (existingEvent) {
        if (existingEvent.payload_hash !== payloadHash) {
          await logSystemAudit('WEBHOOK_IDEMPOTENCY_CONFLICT', {
            source_system: 'bingwaone',
            event_key: eventHeader,
            reason: 'Idempotency conflict for test payload'
          });
          return NextResponse.json(
            { success: false, error: 'Idempotency conflict' },
            { status: 409 }
          );
        }
        return NextResponse.json({
          success: true,
          status: 'duplicate',
          event_key: eventHeader
        });
      }

      // Store test webhook event
      const { error: insertErr } = await supabase
        .from('webhook_events')
        .insert({
          event_key: eventHeader,
          provider: 'bingwaone',
          source_system: 'bingwaone',
          event_type: payload.event || 'test',
          payload: payload,
          raw_payload: payload,
          signature: signatureHeader,
          payload_hash: payloadHash,
          processing_status: 'processed',
          received_at: receivedAt,
          processed_at: new Date().toISOString()
        });

      if (insertErr) throw insertErr;

      await logSystemAudit('BINGWAONE_WEBHOOK_PROCESSED', {
        event_key: eventHeader,
        is_test: true
      });

      return NextResponse.json({
        success: true,
        status: 'processed',
        event_key: eventHeader
      });
    } catch (dbErr: any) {
      console.error('[BingwaOne Webhook] Database error for test event:', dbErr);
      return NextResponse.json(
        { success: false, error: 'Database processing failed' },
        { status: 500 }
      );
    }
  }

  // 7. Validate real payload structure
  const eventType = payload.event;
  if (
    eventType !== 'payment.completed' &&
    eventType !== 'wallet.withdrawal.completed' &&
    eventType !== 'bonga.payout.completed'
  ) {
    return NextResponse.json(
      { success: false, error: 'Unsupported event type' },
      { status: 400 }
    );
  }

  // Validate header event category matches payload event
  const eventParts = eventHeader.split(':');
  if (eventParts.length !== 3) {
    return NextResponse.json(
      { success: false, error: 'Invalid event header format' },
      { status: 400 }
    );
  }

  const [headerCategory, headerId, headerAction] = eventParts;
  if (headerAction !== 'completed') {
    return NextResponse.json(
      { success: false, error: 'Unsupported event action' },
      { status: 400 }
    );
  }

  if (headerCategory === 'payment' && eventType !== 'payment.completed') {
    return NextResponse.json(
      { success: false, error: 'Header category and payload event type mismatch' },
      { status: 400 }
    );
  }

  if (headerCategory === 'wallet-withdrawal' && eventType !== 'wallet.withdrawal.completed') {
    return NextResponse.json(
      { success: false, error: 'Header category and payload event type mismatch' },
      { status: 400 }
    );
  }

  if (headerCategory === 'bonga-payout' && eventType !== 'bonga.payout.completed') {
    return NextResponse.json(
      { success: false, error: 'Header category and payload event type mismatch' },
      { status: 400 }
    );
  }

  // Event ID validation
  if (headerCategory === 'payment') {
    const payment = payload.payment;
    if (!payment || !payment.id || !payment.amount || payment.amount <= 0) {
      return NextResponse.json(
        { success: false, error: 'Invalid payment details' },
        { status: 400 }
      );
    }
    if (payment.id !== headerId) {
      return NextResponse.json(
        { success: false, error: 'Header ID and payment ID mismatch' },
        { status: 400 }
      );
    }
  } else if (headerCategory === 'wallet-withdrawal') {
    const withdrawal = payload.withdrawal;
    if (!withdrawal || !withdrawal.id || !withdrawal.amount || withdrawal.amount <= 0) {
      return NextResponse.json(
        { success: false, error: 'Invalid withdrawal details' },
        { status: 400 }
      );
    }
    if (withdrawal.id !== headerId) {
      return NextResponse.json(
        { success: false, error: 'Header ID and withdrawal ID mismatch' },
        { status: 400 }
      );
    }
  } else {
    // bonga-payout: the transfer object has no id of its own (the payout id is in
    // the event header), so there is nothing to cross-check beyond the amount.
    const transfer = payload.transfer;
    if (!transfer || !transfer.amount || transfer.amount <= 0) {
      return NextResponse.json(
        { success: false, error: 'Invalid transfer details' },
        { status: 400 }
      );
    }
  }

  // 8. DB Processing with Idempotency
  let dbEvent: any = null;
  try {
    // Audit receipt
    await logSystemAudit('BINGWAONE_WEBHOOK_RECEIVED', {
      event_key: eventHeader,
      event_type: eventType
    });

    // Check if event already exists
    const { data: existingEvent, error: selectErr } = await supabase
      .from('webhook_events')
      .select('*')
      .eq('event_key', eventHeader)
      .maybeSingle();

    if (selectErr) throw selectErr;

    if (existingEvent) {
      if (existingEvent.payload_hash !== payloadHash) {
        await logSystemAudit('WEBHOOK_IDEMPOTENCY_CONFLICT', {
          source_system: 'bingwaone',
          event_key: eventHeader,
          reason: 'Idempotency conflict: Event key exists with a different payload hash.'
        });
        return NextResponse.json(
          { success: false, error: 'Idempotency conflict' },
          { status: 409 }
        );
      }

      if (existingEvent.processing_status === 'processed') {
        await logSystemAudit('BINGWAONE_WEBHOOK_DUPLICATE', {
          event_key: eventHeader,
          transaction_id: existingEvent.transaction_id
        });
        return NextResponse.json({
          success: true,
          status: 'duplicate',
          event_key: eventHeader
        });
      }

      // If existing event was failed or received, we use it to retry
      dbEvent = existingEvent;
    } else {
      // Insert new event with received status
      const { data: newEvent, error: insertErr } = await supabase
        .from('webhook_events')
        .insert({
          event_key: eventHeader,
          provider: 'bingwaone',
          source_system: 'bingwaone',
          event_type: eventType,
          payload: payload,
          raw_payload: payload,
          signature: signatureHeader,
          payload_hash: payloadHash,
          processing_status: 'received',
          received_at: receivedAt
        })
        .select()
        .single();

      if (insertErr) throw insertErr;
      dbEvent = newEvent;
    }
  } catch (err: any) {
    console.error('[BingwaOne Webhook] Ingestion setup failure:', err);
    return NextResponse.json(
      { success: false, error: 'Database processing failed' },
      { status: 500 }
    );
  }

  // 9. Process/Insert the Transaction
  try {
    let txId: string;
    let isReconciled = false;
    let isConflict = false;

    // Notification / audit context, populated per event branch below so the
    // downstream audit + notification code does not have to re-derive it from a
    // shape that differs across payment/withdrawal/transfer payloads.
    let notifyDirection: 'IN' | 'OUT' = 'IN';
    let notifyType = 'subscription';
    let notifyAmount = 0;
    let notifyAccountRef = 'Subscription';
    let notifyPhone: string | null = null;
    let notifyModule = 'mini_site';
    let notifyReceipt: string | null = null;

    if (eventType === 'payment.completed') {
      const payment = payload.payment;
      // Normalize phones
      let normalizedPayerPhone = null;
      let normalizedRecipientPhone = null;
      if (payment.payer_phone) {
        normalizedPayerPhone = normalizeKenyanPhone(payment.payer_phone);
      }
      if (payment.recipient_phone) {
        normalizedRecipientPhone = normalizeKenyanPhone(payment.recipient_phone);
      }

      const receipt = payment.receipt ? String(payment.receipt).trim().toUpperCase() : null;

      notifyDirection = 'IN';
      notifyType = payment.type || 'subscription';
      notifyAmount = Number(payment.amount);
      notifyAccountRef = payment.account_reference || 'Subscription';
      notifyPhone = normalizedPayerPhone || normalizedRecipientPhone;
      notifyModule = payment.module || 'mini_site';
      notifyReceipt = receipt;

      // Try to match an existing Safaricom transaction
      let matchedTx: any = null;
      if (receipt) {
        const { data } = await supabase
          .from('transactions')
          .select('*')
          .or(`receipt.eq.${receipt},mpesa_receipt.eq.${receipt}`)
          .eq('direction', 'IN')
          .eq('amount', Number(payment.amount))
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        matchedTx = data;
      }

      // Resolve Product Source ID
      let resolvedSourceId: string | null = null;
      const resolveRef = receipt || payment.module || payment.type;
      if (resolveRef) {
        try {
          resolvedSourceId = await resolveSourceId(resolveRef);
        } catch (e) {
          console.warn(`[BingwaOne Webhook] Failed resolving source ID for: ${resolveRef}`, e);
        }
      }

      if (matchedTx) {
        isReconciled = true;
        // Check attribution conflict
        if (matchedTx.source_system && matchedTx.source_system !== 'unknown' && matchedTx.source_system !== 'bingwaone' && matchedTx.source_system !== 'bingwazone') {
          isConflict = true;
          // Mark reconciliation conflict
          await supabase
            .from('transactions')
            .update({
              reconciliation_status: 'conflict',
              updated_at: new Date().toISOString()
            })
            .eq('id', matchedTx.id);

          await supabase
            .from('webhook_events')
            .update({
              processing_status: 'reconciliation_conflict',
              reconciliation_status: 'conflict',
              transaction_id: matchedTx.id,
              processed_at: new Date().toISOString()
            })
            .eq('id', dbEvent.id);
        } else {
          // Enrich existing transaction
          await supabase
            .from('transactions')
            .update({
              source_system: 'bingwaone',
              payment_type: matchedTx.payment_type || payment.type || 'subscription',
              product_stream: matchedTx.product_stream || payment.module || 'mini_site',
              module: matchedTx.module || payment.module || 'mini_site',
              service_source: matchedTx.service_source || payment.service_source || 'mini_site_subscription',
              payer_phone: matchedTx.payer_phone || normalizedPayerPhone,
              recipient_phone: matchedTx.recipient_phone || normalizedRecipientPhone,
              receipt: matchedTx.receipt || receipt,
              external_reference_id: matchedTx.external_reference_id || payment.id,
              external_agent_id: matchedTx.external_agent_id || payload.agent?.id || null,
              agent_name: matchedTx.agent_name || payload.agent?.name || null,
              agent_business_name: matchedTx.agent_business_name || payload.agent?.business_name || null,
              agent_username: matchedTx.agent_username || payload.agent?.username || null,
              occurred_at: matchedTx.occurred_at || payload.occurred_at || null,
              initiated_at: matchedTx.initiated_at || payment.initiated_at || null,
              completed_at: matchedTx.completed_at || payment.completed_at || null,
              raw_payload: { ...(matchedTx.raw_payload || {}), ...payment.metadata },
              reconciliation_status: 'matched',
              source_id: matchedTx.source_id || resolvedSourceId,
              updated_at: new Date().toISOString()
            })
            .eq('id', matchedTx.id);

          await supabase
            .from('webhook_events')
            .update({
              processing_status: 'processed',
              reconciliation_status: 'matched',
              transaction_id: matchedTx.id,
              processed_at: new Date().toISOString()
            })
            .eq('id', dbEvent.id);
        }
        txId = matchedTx.id;
      } else {
        // Create new transaction
        const { data: newTx, error: txErr } = await supabase
          .from('transactions')
          .insert({
            direction: 'IN',
            transaction_type: 'C2B',
            amount: Number(payment.amount),
            status: 'SUCCESS',
            mpesa_receipt: receipt,
            receipt: receipt,
            source_system: 'bingwaone',
            provider: 'mpesa',
            origin: 'bingwaone_webhook',
            payment_type: payment.type || 'subscription',
            product_stream: payment.module || 'mini_site',
            module: payment.module || 'mini_site',
            service_source: payment.service_source || 'mini_site_subscription',
            payer_phone: normalizedPayerPhone,
            recipient_phone: normalizedRecipientPhone,
            external_reference_id: payment.id,
            external_agent_id: payload.agent?.id || null,
            agent_name: payload.agent?.name || null,
            agent_business_name: payload.agent?.business_name || null,
            agent_username: payload.agent?.username || null,
            occurred_at: payload.occurred_at || null,
            initiated_at: payment.initiated_at || null,
            completed_at: payment.completed_at || null,
            raw_payload: payment.metadata || {},
            reconciliation_status: 'app_only',
            phone_number: normalizedPayerPhone || normalizedRecipientPhone,
            account_reference: payment.account_reference || receipt || payment.id,
            description: 'bingwaone webhook event processed',
            source_id: resolvedSourceId,
            currency: payment.currency || 'KES',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .select()
          .single();

        if (txErr) throw txErr;
        txId = newTx.id;

        await supabase
          .from('webhook_events')
          .update({
            processing_status: 'processed',
            reconciliation_status: 'app_only',
            transaction_id: txId,
            processed_at: new Date().toISOString()
          })
          .eq('id', dbEvent.id);
      }
    } else if (eventType === 'wallet.withdrawal.completed') {
      // wallet.withdrawal.completed
      const withdrawal = payload.withdrawal;
      let normalizedPhone = null;
      // Sender field is destination_phone; keep `destination` as a legacy fallback.
      const destinationPhone = withdrawal.destination_phone || withdrawal.destination;
      if (destinationPhone) {
        normalizedPhone = normalizeKenyanPhone(destinationPhone);
      }

      // conversation_id is the only provider reference on wallet withdrawals.
      const receipt = withdrawal.provider_reference || withdrawal.transaction_id || withdrawal.conversation_id || null;

      // Try to match an existing Safaricom transaction (outgoing payout)
      let matchedTx: any = null;
      if (receipt) {
        const { data } = await supabase
          .from('transactions')
          .select('*')
          .or(`receipt.eq.${receipt},mpesa_receipt.eq.${receipt}`)
          .eq('direction', 'OUT')
          .eq('amount', Number(withdrawal.amount))
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        matchedTx = data;
      }

      if (matchedTx) {
        isReconciled = true;
        // Check attribution conflict
        if (matchedTx.source_system && matchedTx.source_system !== 'unknown' && matchedTx.source_system !== 'bingwaone' && matchedTx.source_system !== 'bingwazone') {
          isConflict = true;
          await supabase
            .from('transactions')
            .update({
              reconciliation_status: 'conflict',
              updated_at: new Date().toISOString()
            })
            .eq('id', matchedTx.id);

          await supabase
            .from('webhook_events')
            .update({
              processing_status: 'reconciliation_conflict',
              reconciliation_status: 'conflict',
              transaction_id: matchedTx.id,
              processed_at: new Date().toISOString()
            })
            .eq('id', dbEvent.id);
        } else {
          // Enrich existing transaction
          await supabase
            .from('transactions')
            .update({
              source_system: 'bingwaone',
              payment_type: matchedTx.payment_type || 'wallet_withdrawal',
              product_stream: matchedTx.product_stream || 'wallet',
              module: matchedTx.module || 'wallet',
              service_source: matchedTx.service_source || withdrawal.service_source || 'wallet_withdrawal',
              recipient_phone: matchedTx.recipient_phone || normalizedPhone,
              receipt: matchedTx.receipt || receipt,
              external_reference_id: matchedTx.external_reference_id || withdrawal.id,
              external_agent_id: matchedTx.external_agent_id || payload.agent?.id || null,
              agent_name: matchedTx.agent_name || payload.agent?.name || null,
              agent_business_name: matchedTx.agent_business_name || payload.agent?.business_name || null,
              agent_username: matchedTx.agent_username || payload.agent?.username || null,
              occurred_at: matchedTx.occurred_at || payload.occurred_at || null,
              completed_at: matchedTx.completed_at || withdrawal.completed_at || null,
              raw_payload: { ...(matchedTx.raw_payload || {}), ...withdrawal.metadata },
              reconciliation_status: 'matched',
              updated_at: new Date().toISOString()
            })
            .eq('id', matchedTx.id);

          await supabase
            .from('webhook_events')
            .update({
              processing_status: 'processed',
              reconciliation_status: 'matched',
              transaction_id: matchedTx.id,
              processed_at: new Date().toISOString()
            })
            .eq('id', dbEvent.id);
        }
        txId = matchedTx.id;
      } else {
        // Create new transaction
        const { data: newTx, error: txErr } = await supabase
          .from('transactions')
          .insert({
            direction: 'OUT',
            transaction_type: 'wallet_withdrawal',
            amount: Number(withdrawal.amount),
            status: 'SUCCESS',
            mpesa_receipt: receipt,
            receipt: receipt,
            source_system: 'bingwaone',
            provider: 'mpesa',
            origin: 'bingwaone_webhook',
            payment_type: 'wallet_withdrawal',
            product_stream: 'wallet',
            module: 'wallet',
            service_source: withdrawal.service_source || 'wallet_withdrawal',
            recipient_phone: normalizedPhone,
            external_reference_id: withdrawal.id,
            external_agent_id: payload.agent?.id || null,
            agent_name: payload.agent?.name || null,
            agent_business_name: payload.agent?.business_name || null,
            agent_username: payload.agent?.username || null,
            occurred_at: payload.occurred_at || null,
            completed_at: withdrawal.completed_at || null,
            raw_payload: withdrawal.metadata || {},
            reconciliation_status: 'app_only',
            phone_number: normalizedPhone,
            account_reference: 'Wallet Withdrawal',
            description: 'bingwaone webhook event processed',
            currency: withdrawal.currency || 'KES',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .select()
          .single();

        if (txErr) throw txErr;
        txId = newTx.id;

        await supabase
          .from('webhook_events')
          .update({
            processing_status: 'processed',
            reconciliation_status: 'app_only',
            transaction_id: txId,
            processed_at: new Date().toISOString()
          })
          .eq('id', dbEvent.id);
      }

      notifyDirection = 'OUT';
      notifyType = 'wallet_withdrawal';
      notifyAmount = Number(withdrawal.amount);
      notifyAccountRef = 'Wallet Withdrawal';
      notifyPhone = normalizedPhone;
      notifyModule = 'wallet';
      notifyReceipt = receipt;
    } else {
      // bonga.payout.completed — outgoing Bonga-points sell payout to an agent.
      const transfer = payload.transfer;
      let normalizedPhone = null;
      if (transfer.destination_phone) {
        normalizedPhone = normalizeKenyanPhone(transfer.destination_phone);
      }

      // The transfer object carries no id of its own; the payout id is in the
      // event header, and conversation_id is the only provider reference.
      const receipt = transfer.conversation_id || null;

      // Try to match an existing Safaricom transaction (outgoing payout)
      let matchedTx: any = null;
      if (receipt) {
        const { data } = await supabase
          .from('transactions')
          .select('*')
          .or(`receipt.eq.${receipt},mpesa_receipt.eq.${receipt}`)
          .eq('direction', 'OUT')
          .eq('amount', Number(transfer.amount))
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        matchedTx = data;
      }

      if (matchedTx) {
        isReconciled = true;
        if (matchedTx.source_system && matchedTx.source_system !== 'unknown' && matchedTx.source_system !== 'bingwaone' && matchedTx.source_system !== 'bingwazone') {
          isConflict = true;
          await supabase
            .from('transactions')
            .update({
              reconciliation_status: 'conflict',
              updated_at: new Date().toISOString()
            })
            .eq('id', matchedTx.id);

          await supabase
            .from('webhook_events')
            .update({
              processing_status: 'reconciliation_conflict',
              reconciliation_status: 'conflict',
              transaction_id: matchedTx.id,
              processed_at: new Date().toISOString()
            })
            .eq('id', dbEvent.id);
        } else {
          await supabase
            .from('transactions')
            .update({
              source_system: 'bingwaone',
              payment_type: matchedTx.payment_type || 'bonga_payout',
              product_stream: matchedTx.product_stream || 'bonga',
              module: matchedTx.module || 'bonga',
              service_source: matchedTx.service_source || transfer.service_source || 'bonga_sell',
              recipient_phone: matchedTx.recipient_phone || normalizedPhone,
              receipt: matchedTx.receipt || receipt,
              external_reference_id: matchedTx.external_reference_id || headerId,
              external_agent_id: matchedTx.external_agent_id || payload.agent?.id || null,
              agent_name: matchedTx.agent_name || payload.agent?.name || null,
              agent_business_name: matchedTx.agent_business_name || payload.agent?.business_name || null,
              agent_username: matchedTx.agent_username || payload.agent?.username || null,
              occurred_at: matchedTx.occurred_at || payload.occurred_at || null,
              completed_at: matchedTx.completed_at || payload.occurred_at || null,
              raw_payload: { ...(matchedTx.raw_payload || {}), ...transfer.metadata },
              reconciliation_status: 'matched',
              updated_at: new Date().toISOString()
            })
            .eq('id', matchedTx.id);

          await supabase
            .from('webhook_events')
            .update({
              processing_status: 'processed',
              reconciliation_status: 'matched',
              transaction_id: matchedTx.id,
              processed_at: new Date().toISOString()
            })
            .eq('id', dbEvent.id);
        }
        txId = matchedTx.id;
      } else {
        const { data: newTx, error: txErr } = await supabase
          .from('transactions')
          .insert({
            direction: 'OUT',
            transaction_type: 'bonga_payout',
            amount: Number(transfer.amount),
            status: 'SUCCESS',
            mpesa_receipt: receipt,
            receipt: receipt,
            source_system: 'bingwaone',
            provider: 'mpesa',
            origin: 'bingwaone_webhook',
            payment_type: 'bonga_payout',
            product_stream: 'bonga',
            module: 'bonga',
            service_source: transfer.service_source || 'bonga_sell',
            recipient_phone: normalizedPhone,
            external_reference_id: headerId,
            external_agent_id: payload.agent?.id || null,
            agent_name: payload.agent?.name || null,
            agent_business_name: payload.agent?.business_name || null,
            agent_username: payload.agent?.username || null,
            occurred_at: payload.occurred_at || null,
            completed_at: payload.occurred_at || null,
            raw_payload: transfer.metadata || {},
            reconciliation_status: 'app_only',
            phone_number: normalizedPhone,
            account_reference: 'Bonga Payout',
            description: 'bingwaone webhook event processed',
            currency: transfer.currency || 'KES',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .select()
          .single();

        if (txErr) throw txErr;
        txId = newTx.id;

        await supabase
          .from('webhook_events')
          .update({
            processing_status: 'processed',
            reconciliation_status: 'app_only',
            transaction_id: txId,
            processed_at: new Date().toISOString()
          })
          .eq('id', dbEvent.id);
      }

      notifyDirection = 'OUT';
      notifyType = 'bonga_payout';
      notifyAmount = Number(transfer.amount);
      notifyAccountRef = 'Bonga Payout';
      notifyPhone = normalizedPhone;
      notifyModule = 'bonga';
      notifyReceipt = receipt;
    }

    // 10. Write Audit log
    await logSystemAudit('BINGWAONE_WEBHOOK_PROCESSED', {
      event_key: eventHeader,
      transaction_id: txId,
      was_reconciled: isReconciled,
      is_conflict: isConflict
    });

    if (isReconciled) {
      if (isConflict) {
        await logSystemAudit('TRANSACTION_RECONCILIATION_CONFLICT', {
          transaction_id: txId,
          source_system: 'bingwaone',
          receipt: notifyReceipt
        });
      } else {
        await logSystemAudit('TRANSACTION_ATTRIBUTION_UPDATED', {
          transaction_id: txId,
          source_system: 'bingwaone',
          receipt: notifyReceipt
        });
      }
    } else {
      await logSystemAudit('TRANSACTION_RECONCILED', {
        transaction_id: txId,
        source_system: 'bingwaone',
        status: 'app_only'
      });
    }

    // 11. Queue notification (unified template support)
    try {
      triggerNotificationFlow({
        transaction_id: txId,
        source_system: 'bingwaone', // Maintain unified SMS template compatibility
        direction: notifyDirection,
        transaction_type: notifyType,
        amount: notifyAmount,
        account_reference: notifyAccountRef,
        phone_number: notifyPhone,
        mpesa_receipt: notifyReceipt || null,
        module: notifyModule
      }).catch(err => {
        console.error('[BingwaOne Webhook] Failed running notification flow:', err);
      });
    } catch (notifErr) {
      console.error('[BingwaOne Webhook] Notification dispatch error:', notifErr);
    }

    // 12. Return success
    return NextResponse.json({
      success: true,
      status: 'processed',
      event_key: eventHeader
    });

  } catch (err: any) {
    console.error('[BingwaOne Webhook] Processing failed:', err);
    try {
      await supabase
        .from('webhook_events')
        .update({
          processing_status: 'processing_failed',
          processing_error: err.message || 'Processing Error',
          updated_at: new Date().toISOString()
        })
        .eq('id', dbEvent.id);

      await logSystemAudit('WEBHOOK_VALIDATION_FAILED', {
        source_system: 'bingwaone',
        event_key: eventHeader,
        error: err.message || 'Processing Error'
      });
    } catch (innerErr) {
      console.error('[BingwaOne Webhook] Failed updating error status:', innerErr);
    }

    return NextResponse.json(
      { success: false, error: 'Database processing failed' },
      { status: 500 }
    );
  }
}
