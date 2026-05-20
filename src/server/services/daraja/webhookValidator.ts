import { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Validates the webhook verification token passed as a query parameter or header.
 * Promotes security against unauthorized callback injections.
 */
export function validateWebhookToken(req: Request): boolean {
  const token = req.query.token || req.headers['x-mpesa-token'];
  const expectedToken = process.env.MPESA_CALLBACK_TOKEN || 'skylink-default-secure-callback-token';
  
  if (!token) {
    console.warn('[Webhook Access Denied] Missing callback verification token.');
    return false;
  }

  if (token !== expectedToken) {
    console.warn('[Webhook Access Denied] Invalid callback verification token.');
    return false;
  }

  return true;
}

/**
 * Checks if a webhook callback has already been processed for the transaction
 * to enforce idempotency and avoid duplicate ledger balance updates.
 */
export async function checkIdempotency(checkoutRequestId: string, eventType: string): Promise<boolean> {
  if (!checkoutRequestId) return false;

  try {
    const { data: events, error } = await supabase
      .from('transaction_events')
      .select('id')
      .eq('event_type', eventType)
      .eq('payload->Body->stkCallback->>CheckoutRequestID', checkoutRequestId);

    if (error) throw error;
    return events && events.length > 0;
  } catch (err) {
    console.error('[Idempotency Checker] Failed to verify event:', err);
    return false;
  }
}

/**
 * Records the raw, unmodified Safaricom payload into the database event logger.
 */
export async function logRawPayload(transactionId: string | null, eventType: string, payload: any, source: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('transaction_events')
      .insert({
        transaction_id: transactionId,
        event_type: eventType,
        source: source,
        payload: payload
      });

    if (error) throw error;
    console.log(`[Event Logger] Successfully saved raw event payload for: ${eventType}`);
  } catch (err) {
    console.error('[Event Logger] Failed to insert raw callback payload:', err);
  }
}
