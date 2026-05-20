import { createClient } from '@supabase/supabase-js';
import { resolveConfig, getAccessToken } from '../daraja/darajaClient';
import { getTimestamp, generatePassword } from '../daraja/darajaService';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export interface STKQueryParams {
  checkoutRequestId: string;
  userId?: string;
}

export interface STKQueryResult {
  success: boolean;
  resultCode: string;
  resultDesc: string;
  merchantRequestId?: string;
  checkoutRequestId?: string;
  resolved: boolean;       // true if we reconciled a pending transaction
  transactionId?: string;  // internal DB row ID of the matched transaction
  rawResponse?: any;
  error?: string;
}

/**
 * Production-grade STK Push Query (M-Pesa Express Query).
 *
 * Calls POST /mpesa/stkpushquery/v1/query to check the status of a pending
 * STK Push request. If the result is conclusive (ResultCode 0 = success,
 * non-zero = failed/cancelled), the internal `transactions` record is reconciled
 * and an audit entry is written.
 *
 * This is the authoritative fallback for STK callbacks that never arrived.
 */
export async function querySTKStatus(params: STKQueryParams): Promise<STKQueryResult> {
  const { checkoutRequestId, userId } = params;

  if (!checkoutRequestId || checkoutRequestId.trim() === '') {
    return { success: false, resultCode: 'ERR_MISSING', resultDesc: 'checkoutRequestId is required.', resolved: false };
  }

  const config = await resolveConfig();

  try {
    const token = await getAccessToken(config);
    const timestamp = getTimestamp();
    const password = generatePassword(config.shortCode, config.passkey, timestamp);

    const url = 'https://api.safaricom.co.ke/mpesa/stkpushquery/v1/query';

    const payload = {
      BusinessShortCode: config.shortCode,
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId
    };

    console.log(`[STK Query] Querying CheckoutRequestID: ${checkoutRequestId}`);

    const apiStart = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    const apiDuration = Date.now() - apiStart;
    const responseText = await response.text();
    let responseJson: any = null;
    try {
      responseJson = JSON.parse(responseText);
    } catch {}

    console.log(`[STK Query] Response (${apiDuration}ms):`, responseJson || responseText);

    const responseCode = responseJson?.ResponseCode?.toString();
    const resultCode = responseJson?.ResultCode?.toString();
    const resultDesc = responseJson?.ResultDesc || responseJson?.ResponseDescription || 'No description.';

    // Log the query to audit_logs
    await supabase.from('audit_logs').insert({
      action: 'STK_QUERY_DISPATCHED',
      entity_type: 'integration',
      new_values: {
        checkoutRequestId,
        responseCode,
        resultCode,
        resultDesc,
        durationMs: apiDuration,
        requested_by: userId || 'unknown'
      }
    }).catch(() => {});

    // If Daraja rejected the query itself (HTTP error or non-0 ResponseCode)
    if (!response.ok || (responseCode && responseCode !== '0')) {
      return {
        success: false,
        resultCode: responseCode || response.status.toString(),
        resultDesc,
        resolved: false,
        rawResponse: responseJson || responseText,
        error: resultDesc
      };
    }

    // Attempt to find and reconcile the matching transaction
    let transactionDbId: string | undefined;
    let reconciled = false;

    const { data: trx } = await supabase
      .from('transactions')
      .select('id, status')
      .eq('checkout_request_id', checkoutRequestId)
      .maybeSingle();

    if (trx) {
      transactionDbId = trx.id;

      // Only reconcile if still pending — don't overwrite already-resolved transactions
      if (trx.status === 'pending') {
        const isPaymentSuccess = resultCode === '0';
        const newStatus = isPaymentSuccess ? 'completed' : 'failed';

        const { error: updateErr } = await supabase
          .from('transactions')
          .update({
            status: newStatus,
            result_code: resultCode,
            result_desc: resultDesc,
            external_transaction_id: responseJson?.TransactionDate || null,
            occurred_at: new Date().toISOString()
          })
          .eq('id', trx.id);

        if (!updateErr) {
          reconciled = true;
          console.log(`[STK Query] Reconciled transaction ${trx.id} → ${newStatus}`);

          // Post audit log for reconciliation
          await supabase.from('audit_logs').insert({
            action: isPaymentSuccess ? 'STK_QUERY_RECONCILED_SUCCESS' : 'STK_QUERY_RECONCILED_FAILED',
            entity_type: 'transaction',
            entity_id: trx.id,
            new_values: { resultCode, resultDesc, checkoutRequestId, requested_by: userId || 'unknown' }
          }).catch(() => {});

          // Send notification to user if we resolved it
          if (trx) {
            await supabase.from('notifications').insert({
              user_id: userId || null,
              title: isPaymentSuccess ? 'STK Payment Confirmed' : 'STK Payment Failed',
              message: isPaymentSuccess
                ? `M-Pesa Express payment was confirmed via manual query (CheckoutRequestID: ${checkoutRequestId}).`
                : `M-Pesa Express payment failed or was cancelled: ${resultDesc}`,
              read: false,
              created_at: new Date().toISOString()
            }).catch(() => {});
          }
        } else {
          console.error('[STK Query] Reconciliation DB update failed:', updateErr);
        }
      }
    } else {
      console.warn(`[STK Query] No matching transaction found for CheckoutRequestID: ${checkoutRequestId}`);
    }

    return {
      success: true,
      resultCode: resultCode || '0',
      resultDesc,
      merchantRequestId: responseJson?.MerchantRequestID,
      checkoutRequestId: responseJson?.CheckoutRequestID || checkoutRequestId,
      resolved: reconciled,
      transactionId: transactionDbId,
      rawResponse: responseJson || responseText
    };

  } catch (err: any) {
    console.error('[STK Query] Exception:', err);

    await supabase.from('audit_logs').insert({
      action: 'STK_QUERY_ERROR',
      entity_type: 'integration',
      new_values: { error: err.message, checkoutRequestId, requested_by: userId || 'unknown' }
    }).catch(() => {});

    return {
      success: false,
      resultCode: 'ERR_EXCEPTION',
      resultDesc: err.message || 'Unexpected query error.',
      resolved: false,
      error: err.message
    };
  }
}
