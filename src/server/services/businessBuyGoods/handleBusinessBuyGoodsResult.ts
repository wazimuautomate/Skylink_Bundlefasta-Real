import { createClient } from '@supabase/supabase-js';
import { parseBusinessBuyGoodsResult } from './parseBusinessBuyGoodsResult';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export async function handleBusinessBuyGoodsResult(payload: any, clientIp: string) {
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
    .from('business_buy_goods_transactions')
    .select('*')
    .eq('conversation_id', conversationId)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (!trx) {
    console.warn(`[Webhook B2B] Transaction not found for ConversationID: ${conversationId}`);
    return { success: false, reason: 'Transaction not found' };
  }

  // Idempotency: Skip if already resolved
  if (trx.status === 'success' || trx.status === 'failed') {
    console.log(`[Webhook B2B] Transaction ${trx.id} already resolved as: ${trx.status}`);
    return { success: true, reason: 'Already resolved' };
  }

  const parsed = parseBusinessBuyGoodsResult(payload);
  const isSuccess = parsed.resultCode === '0';
  const finalStatus = isSuccess ? 'success' : 'failed';

  // 2. Perform DB Updates
  const { data: updatedTrx, error: updateError } = await supabase
    .from('business_buy_goods_transactions')
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

  // 3. Write Payout Audit Log
  await supabase.from('payout_audit_logs').insert({
    payout_id: trx.id,
    action: isSuccess ? 'callback_received_success' : 'callback_received_failure',
    actor: 'mpesa_webhook',
    metadata: { client_ip: clientIp, parsed_result: parsed }
  });

  // 4. Double-Entry Ledger Posting
  if (isSuccess && updatedTrx) {
    // Credit money going out from disbursements working account
    const { error: ledgerError } = await supabase.from('ledger_entries').insert([
      {
        transaction_id: updatedTrx.id,
        account_id: 'a3333333-3333-3333-3333-333333333333', // Disbursement Vault UUID
        entry_type: 'CREDIT',
        amount: updatedTrx.amount
      }
    ]);

    if (ledgerError) {
      console.error('[Webhook B2B Ledger Error] Failed to write ledger credits:', ledgerError);
    }
  }

  // 5. Trigger Platform Notification
  try {
    await supabase.from('notifications').insert({
      user_id: trx.created_by,
      title: isSuccess ? 'B2B Payout Successful' : 'B2B Payout Failed',
      message: isSuccess 
        ? `Merchant payment of KES ${trx.amount.toLocaleString()} to Till ${trx.receiver_till} was completed successfully.`
        : `Merchant payment of KES ${trx.amount.toLocaleString()} to Till ${trx.receiver_till} failed: ${parsed.resultDesc}`,
      read: false,
      created_at: new Date().toISOString()
    });
  } catch (notifErr) {
    console.error('[Webhook B2B] Notification insertion failure:', notifErr);
  }

  return { success: true, status: finalStatus };
}
