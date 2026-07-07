import crypto from 'crypto';
import { createAdminClient } from '../supabase/server';
import { resolveSourceId } from '../repositories/transactions';
import { logSystemAudit } from '../repositories/audit';
import { triggerNotificationFlow } from '../notifications/send-transaction-alert';
import { triggerSettlementRule } from '../repositories/b2b';

export interface WebhookReconciliationParams {
  source_system: 'bingwaone' | 'bingwazone' | 'pesatrix';
  event_key: string;
  event_type: string;
  schema_version: number | null;
  raw_payload_string: string;
  raw_payload: any;
  occurred_at: string | null;
  // Transaction details for enrichment/creation
  tx_direction: 'IN' | 'OUT';
  tx_type: string;
  payment_type: string;
  product_stream: string;
  module: string;
  service_source: string;
  amount: number;
  payer_phone?: string | null;
  recipient_phone?: string | null;
  counterparty_phone?: string | null;
  receipt?: string | null;
  external_reference_id?: string | null;
  external_user_id?: string | null;
  external_agent_id?: string | null;
  agent_name?: string | null;
  agent_business_name?: string | null;
  agent_username?: string | null;
  initiated_at?: string | null;
  completed_at?: string | null;
  metadata?: any;
}

export interface IngestionResult {
  received: boolean;
  duplicate: boolean;
  conflict?: boolean;
  error?: string;
  status: 'processed' | 'duplicate' | 'idempotency_conflict' | 'error';
  transactionId?: string;
}

/**
 * Service to process incoming webhooks from BingwaOne/Pesatrix,
 * reconcile them with Safaricom transactions, and dispatch alerts.
 */
export async function reconcileWebhookTransaction(
  params: WebhookReconciliationParams
): Promise<IngestionResult> {
  const adminSupabase = createAdminClient();
  const sourceUpper = params.source_system.toUpperCase();

  // 1. Log receipt audit entry
  await logSystemAudit(`${sourceUpper}_WEBHOOK_RECEIVED`, {
    event_key: params.event_key,
    event_type: params.event_type,
    receipt: params.receipt,
    external_reference_id: params.external_reference_id
  });

  // 2. Compute payload hash
  const payloadHash = crypto
    .createHash('sha256')
    .update(params.raw_payload_string)
    .digest('hex');

  // 3. Resolve Product Source ID via TypeScript helper (database table connection)
  let resolvedSourceId: string | null = null;
  const resolveRef = params.receipt || params.module || params.payment_type;
  if (resolveRef) {
    try {
      resolvedSourceId = await resolveSourceId(resolveRef);
    } catch (e) {
      console.warn(`[Reconciliation] Failed resolving source ID for: ${resolveRef}`, e);
    }
  }

  try {
    // 4. Call PG database function atomically via RPC
    const { data, error } = await adminSupabase.rpc('reconcile_webhook_event', {
      p_source_system: params.source_system,
      p_event_key: params.event_key,
      p_event_type: params.event_type,
      p_schema_version: params.schema_version,
      p_payload_hash: payloadHash,
      p_occurred_at: params.occurred_at,
      p_raw_payload: params.raw_payload,
      p_tx_direction: params.tx_direction,
      p_tx_type: params.tx_type,
      p_payment_type: params.payment_type,
      p_product_stream: params.product_stream,
      p_module: params.module,
      p_service_source: params.service_source,
      p_amount: params.amount,
      p_payer_phone: params.payer_phone || null,
      p_recipient_phone: params.recipient_phone || null,
      p_counterparty_phone: params.counterparty_phone || null,
      p_receipt: params.receipt || null,
      p_external_reference_id: params.external_reference_id || null,
      p_external_user_id: params.external_user_id || null,
      p_external_agent_id: params.external_agent_id || null,
      p_agent_name: params.agent_name || null,
      p_agent_business_name: params.agent_business_name || null,
      p_agent_username: params.agent_username || null,
      p_initiated_at: params.initiated_at || null,
      p_completed_at: params.completed_at || null,
      p_metadata: params.metadata || {},
      p_source_id: resolvedSourceId
    });

    if (error) {
      console.error(`[Reconciliation] RPC execution failed:`, error);
      throw error;
    }

    const rpcResult = data as {
      status: 'processed' | 'duplicate' | 'idempotency_conflict' | 'error';
      transaction_id?: string;
      was_reconciled?: boolean;
      is_conflict?: boolean;
      error_msg?: string;
    };

    if (rpcResult.status === 'error') {
      throw new Error(rpcResult.error_msg || 'Unknown database exception');
    }

    // 5. Handle Results and Trigger Audit Logs & Side Effects
    if (rpcResult.status === 'duplicate') {
      await logSystemAudit(`${sourceUpper}_WEBHOOK_DUPLICATE`, {
        event_key: params.event_key,
        transaction_id: rpcResult.transaction_id
      });

      return {
        received: true,
        duplicate: true,
        status: 'duplicate',
        transactionId: rpcResult.transaction_id
      };
    }

    if (rpcResult.status === 'idempotency_conflict') {
      await logSystemAudit('WEBHOOK_IDEMPOTENCY_CONFLICT', {
        source_system: params.source_system,
        event_key: params.event_key,
        reason: rpcResult.error_msg
      });

      return {
        received: false,
        duplicate: false,
        conflict: true,
        status: 'idempotency_conflict',
        error: rpcResult.error_msg
      };
    }

    // Processing was successful
    await logSystemAudit(`${sourceUpper}_WEBHOOK_PROCESSED`, {
      event_key: params.event_key,
      transaction_id: rpcResult.transaction_id,
      was_reconciled: rpcResult.was_reconciled,
      is_conflict: rpcResult.is_conflict
    });

    if (rpcResult.was_reconciled) {
      if (rpcResult.is_conflict) {
        await logSystemAudit('TRANSACTION_RECONCILIATION_CONFLICT', {
          transaction_id: rpcResult.transaction_id,
          source_system: params.source_system,
          receipt: params.receipt
        });
      } else {
        await logSystemAudit('TRANSACTION_ATTRIBUTION_UPDATED', {
          transaction_id: rpcResult.transaction_id,
          source_system: params.source_system,
          receipt: params.receipt
        });
      }
    } else {
      await logSystemAudit('TRANSACTION_RECONCILED', {
        transaction_id: rpcResult.transaction_id,
        source_system: params.source_system,
        status: 'app_only'
      });
    }

    // 6. Run settlement split rules for incoming money (e.g. a Pesatrix activation
    //    triggering a fixed B2B transfer to the admin's till). Awaited so it runs to
    //    completion in the serverless request, but guarded so a settlement failure
    //    never affects the webhook acknowledgement.
    if (rpcResult.transaction_id && params.tx_direction === 'IN') {
      try {
        await triggerSettlementRule(
          rpcResult.transaction_id,
          params.external_reference_id || params.receipt || null,
          params.amount,
          {
            direction: 'IN',
            sourceSystem: params.source_system,
            module: params.module,
          }
        );
      } catch (settleErr) {
        console.error('[Reconciliation] Settlement rule engine failed:', settleErr);
      }
    }

    // 7. Asynchronously trigger the alert notifications flow
    if (rpcResult.transaction_id) {
      triggerNotificationFlow({
        transaction_id: rpcResult.transaction_id,
        source_system: params.source_system,
        direction: params.tx_direction,
        transaction_type: params.tx_type,
        amount: params.amount,
        account_reference: params.receipt || params.external_reference_id || params.module,
        phone_number: params.payer_phone || params.recipient_phone || null,
        mpesa_receipt: params.receipt || null,
        module: params.module
      }).catch(err => {
        console.error('[Reconciliation] Failed running notification dispatcher flow:', err);
      });
    }

    return {
      received: true,
      duplicate: false,
      status: 'processed',
      transactionId: rpcResult.transaction_id
    };
  } catch (err: any) {
    console.error(`[Reconciliation] Fatal error during webhook processing:`, err);
    
    await logSystemAudit('WEBHOOK_VALIDATION_FAILED', {
      source_system: params.source_system,
      event_key: params.event_key,
      error: err.message || 'Fatal Ingestion Error'
    });

    return {
      received: false,
      duplicate: false,
      status: 'error',
      error: err.message || 'Fatal Ingestion Error'
    };
  }
}
