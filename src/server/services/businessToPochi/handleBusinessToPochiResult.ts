import { createClient } from '@supabase/supabase-js';
import { parseBusinessToPochiResult } from './parseBusinessToPochiResult';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export async function handleBusinessToPochiResult(payload: any, clientIp: string) {
  const result = payload?.Result;
  if (!result) {
    throw new Error('Invalid payload: Missing Result object');
  }

  const conversationId = result.ConversationID;
  if (!conversationId) {
    throw new Error('Invalid payload: Missing ConversationID');
  }

  // 1. Load transaction
  const { data: trx, error: fetchError } = await supabase
    .from('business_to_pochi_transactions')
    .select('*')
    .eq('conversation_id', conversationId)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (!trx) {
    console.warn(`[Webhook Pochi] Transaction not found for ConversationID: ${conversationId}`);
    return { success: false, reason: 'Transaction not found' };
  }

  // Idempotency: Skip if already resolved
  if (trx.status === 'success' || trx.status === 'failed') {
    console.log(`[Webhook Pochi] Transaction ${trx.id} already resolved as: ${trx.status}`);
    return { success: true, reason: 'Already resolved' };
  }

  const parsed = parseBusinessToPochiResult(payload);
  const isSuccess = parsed.resultCode === '0';
  const finalStatus = isSuccess ? 'success' : 'failed';

  // 2. Perform DB Updates
  const { data: updatedTrx, error: updateError } = await supabase
    .from('business_to_pochi_transactions')
    .update({
      status: finalStatus,
      transaction_id: parsed.transactionId || trx.transaction_id,
      result_code: parsed.resultCode,
      result_description: parsed.resultDesc,
      receiver_party_name: parsed.receiverPartyName || null,
      debit_account_balance: parsed.debitAccountBalance || null,
      debit_party_balance: parsed.debitPartyBalance || null,
      initiator_balance: parsed.initiatorBalance || null,
      transaction_completed_at: parsed.transactionCompletedAt 
        ? parsed.transactionCompletedAt.toISOString() 
        : new Date().toISOString(),
      raw_result: payload,
      updated_at: new Date().toISOString()
    })
    .eq('id', trx.id)
    .select()
    .single();

  if (updateError) throw updateError;

  // 3. Write Pochi Payout Audit Log
  await supabase.from('pochi_audit_logs').insert({
    pochi_transaction_id: trx.id,
    action: isSuccess ? 'callback_received_success' : 'callback_received_failure',
    actor: 'mpesa_webhook',
    metadata: { client_ip: clientIp, parsed_result: parsed }
  });

  // 4. Double-Entry Ledger Posting
  if (isSuccess && updatedTrx) {
    try {
      // Step A: Insert a record into main transactions table first to satisfy foreign key constraint in ledger_entries
      const { error: txInsertErr } = await supabase
        .from('transactions')
        .insert({
          id: updatedTrx.id,
          transaction_type: 'disbursement',
          direction: 'outbound',
          provider: 'mpesa',
          external_transaction_id: parsed.transactionId,
          reference: updatedTrx.account_reference || 'POCHI_PAYOUT',
          phone_number: updatedTrx.receiver_phone,
          amount: updatedTrx.amount,
          status: 'completed',
          occurred_at: parsed.transactionCompletedAt 
            ? parsed.transactionCompletedAt.toISOString() 
            : new Date().toISOString()
        });

      if (txInsertErr) {
        console.error('[Webhook Pochi Transactions Insert Error] Failed to write mirroring transaction:', txInsertErr);
      }

      // Step B: Write ledger entries
      const { error: ledgerError } = await supabase.from('ledger_entries').insert([
        {
          transaction_id: updatedTrx.id,
          account_id: 'a3333333-3333-3333-3333-333333333333', // B2C Disbursement Vault (CREDIT - asset decrease)
          entry_type: 'CREDIT',
          amount: updatedTrx.amount
        }
      ]);

      if (ledgerError) {
        console.error('[Webhook Pochi Ledger Error] Failed to write ledger credits:', ledgerError);
      } else {
        // Step C: Update account balance in database atomically
        await supabase.rpc('decrement_account_balance', { 
          account_uuid: 'a3333333-3333-3333-3333-333333333333', 
          amount_val: updatedTrx.amount 
        });
      }
    } catch (ledgerExc) {
      console.error('[Webhook Pochi Ledger Exception]', ledgerExc);
    }
  }

  // 5. Trigger Platform Notification
  try {
    await supabase.from('notifications').insert({
      user_id: trx.created_by,
      title: isSuccess ? 'Pochi Payout Successful' : 'Pochi Payout Failed',
      message: isSuccess 
        ? `Pochi payment of KES ${trx.amount.toLocaleString()} to Phone ${trx.receiver_phone} was completed successfully.`
        : `Pochi payment of KES ${trx.amount.toLocaleString()} to Phone ${trx.receiver_phone} failed: ${parsed.resultDesc}`,
      read: false,
      created_at: new Date().toISOString()
    });
  } catch (notifErr) {
    console.error('[Webhook Pochi] Notification insertion failure:', notifErr);
  }

  return { success: true, status: finalStatus };
}
