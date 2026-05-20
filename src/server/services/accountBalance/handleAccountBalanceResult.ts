import { createClient } from '@supabase/supabase-js';
import { parseAccountBalanceResult } from './parseAccountBalanceResult';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export async function handleAccountBalanceResult(payload: any, clientIp: string) {
  const result = payload?.Result;
  if (!result) {
    throw new Error('Invalid payload: Missing Result object');
  }

  const conversationId = result.ConversationID;
  if (!conversationId) {
    throw new Error('Invalid payload: Missing ConversationID');
  }

  // 1. Fetch the query record
  const { data: queryRecord, error: queryError } = await supabase
    .from('account_balance_queries')
    .select('*')
    .eq('conversation_id', conversationId)
    .maybeSingle();

  if (queryError) throw queryError;
  if (!queryRecord) {
    console.warn(`[AccountBalance Webhook] No query record found for ConversationID: ${conversationId}`);
    return { success: false, reason: 'Query record not found' };
  }

  // Idempotency: Skip if query is already resolved
  if (queryRecord.status === 'completed' || queryRecord.status === 'failed') {
    console.log(`[AccountBalance Webhook] Query ${queryRecord.id} already resolved as: ${queryRecord.status}`);
    return { success: true, reason: 'Already resolved' };
  }

  const parsed = parseAccountBalanceResult(payload);
  const isOk = parsed.resultCode === '0';
  const queryFinalStatus = isOk ? 'completed' : 'failed';

  // 2. Update the query record with the result
  const { error: updateQueryError } = await supabase
    .from('account_balance_queries')
    .update({
      status: queryFinalStatus,
      raw_result: payload,
      updated_at: new Date().toISOString()
    })
    .eq('id', queryRecord.id);

  if (updateQueryError) throw updateQueryError;

  // 3. Log Audit event
  await supabase.from('audit_logs').insert({
    action: 'ACCOUNT_BALANCE_CALLBACK_PROCESSED',
    entity_type: 'account_balance_queries',
    entity_id: queryRecord.id,
    new_values: {
      resultCode: parsed.resultCode,
      resultDesc: parsed.resultDesc,
      clientIp
    }
  });

  let alertMessage = `Account balance sync completed. Result: ${parsed.resultDesc || 'Unknown'}`;

  // 4. Update the ledger balances in 'accounts' table if successful
  if (isOk && parsed.accountBalances) {
    const { workingAvailable, workingCurrent, utilityAvailable, utilityCurrent } = parsed.accountBalances;
    const updates = [];

    // Map Working Account to Paybill Collection Main
    if (workingCurrent !== undefined || workingAvailable !== undefined) {
      const workingUpdate = await supabase
        .from('accounts')
        .update({
          current_balance: workingCurrent !== undefined ? workingCurrent : undefined,
          available_balance: workingAvailable !== undefined ? workingAvailable : undefined
        })
        .eq('id', 'a1111111-1111-1111-1111-111111111111');
      
      if (workingUpdate.error) {
        console.error('[AccountBalance Webhook] Working Account update error:', workingUpdate.error);
      } else {
        updates.push('Working Account (Paybill Collection Main)');
      }
    }

    // Map Utility Account to Disbursements Vault
    if (utilityCurrent !== undefined || utilityAvailable !== undefined) {
      const utilityUpdate = await supabase
        .from('accounts')
        .update({
          current_balance: utilityCurrent !== undefined ? utilityCurrent : undefined,
          available_balance: utilityAvailable !== undefined ? utilityAvailable : undefined
        })
        .eq('id', 'a3333333-3333-3333-3333-333333333333');

      if (utilityUpdate.error) {
        console.error('[AccountBalance Webhook] Utility Account update error:', utilityUpdate.error);
      } else {
        updates.push('Utility Account (Disbursements Vault)');
      }
    }

    if (updates.length > 0) {
      alertMessage = `Safaricom balance synchronization successful: Updated ${updates.join(' and ')}.`;
      
      // Log balance sync audit event
      await supabase.from('audit_logs').insert({
        action: 'ACCOUNT_BALANCE_SYNCHRONIZED',
        entity_type: 'account_balance_queries',
        entity_id: queryRecord.id,
        new_values: parsed.accountBalances
      });
    }
  } else {
    alertMessage = `Safaricom balance synchronization failed: ${parsed.resultDesc}`;
  }

  // 5. Trigger platform notification
  try {
    await supabase.from('notifications').insert({
      channel: 'dashboard',
      recipient: queryRecord.created_by || 'admin',
      message: alertMessage,
      status: 'sent',
      created_at: new Date().toISOString()
    });
  } catch (notifErr) {
    console.error('[AccountBalance webhook] Notification insert failed:', notifErr);
  }

  return { success: true, status: queryFinalStatus };
}
