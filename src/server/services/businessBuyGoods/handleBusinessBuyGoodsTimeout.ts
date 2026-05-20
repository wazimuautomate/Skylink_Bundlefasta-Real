import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export async function handleBusinessBuyGoodsTimeout(payload: any, clientIp: string) {
  const conversationId = payload?.ConversationID || payload?.Result?.ConversationID;

  if (!conversationId) {
    throw new Error('Invalid webhook timeout payload: Missing ConversationID');
  }

  // 1. Load transaction
  const { data: trx, error: fetchError } = await supabase
    .from('business_buy_goods_transactions')
    .select('*')
    .eq('conversation_id', conversationId)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (!trx) {
    console.warn(`[Timeout B2B] Transaction not found for ConversationID: ${conversationId}`);
    return { success: false, reason: 'Transaction not found' };
  }

  // 2. Perform updates
  // If transaction is already resolved, don't change status but set timeout_received = true
  const isAlreadyResolved = trx.status === 'success' || trx.status === 'failed';
  const newStatus = isAlreadyResolved ? trx.status : 'timeout';

  const { error: updateError } = await supabase
    .from('business_buy_goods_transactions')
    .update({
      status: newStatus,
      timeout_received: true,
      raw_result: payload,
      updated_at: new Date().toISOString()
    })
    .eq('id', trx.id);

  if (updateError) throw updateError;

  // 3. Write Payout Audit Log
  await supabase.from('payout_audit_logs').insert({
    payout_id: trx.id,
    action: 'timeout_received',
    actor: 'mpesa_webhook',
    metadata: { client_ip: clientIp, payload }
  });

  // 4. Trigger Platform Alert
  try {
    await supabase.from('notifications').insert({
      user_id: trx.created_by,
      title: 'B2B Payout Timeout',
      message: `Merchant payment of KES ${trx.amount.toLocaleString()} to Till ${trx.receiver_till} timed out. Review transaction status manually.`,
      read: false,
      created_at: new Date().toISOString()
    });
  } catch (notifErr) {
    console.error('[Timeout B2B] Notification insertion failure:', notifErr);
  }

  return { success: true };
}
