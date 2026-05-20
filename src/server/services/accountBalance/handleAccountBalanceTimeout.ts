import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export async function handleAccountBalanceTimeout(payload: any, clientIp: string) {
  const result = payload?.Result;
  if (!result) {
    throw new Error('Invalid timeout payload: Missing Result object');
  }

  const conversationId = result.ConversationID;
  if (!conversationId) {
    throw new Error('Invalid timeout payload: Missing ConversationID');
  }

  // 1. Fetch query record
  const { data: queryRecord, error: queryError } = await supabase
    .from('account_balance_queries')
    .select('*')
    .eq('conversation_id', conversationId)
    .maybeSingle();

  if (queryError) throw queryError;
  if (!queryRecord) {
    console.warn(`[AccountBalance Timeout] No query record found for ConversationID: ${conversationId}`);
    return { success: false, reason: 'Query record not found' };
  }

  if (queryRecord.status === 'completed' || queryRecord.status === 'failed' || queryRecord.status === 'timeout') {
    return { success: true, reason: 'Already resolved' };
  }

  // 2. Update to timeout
  const { error: updateError } = await supabase
    .from('account_balance_queries')
    .update({
      status: 'timeout',
      raw_result: payload,
      updated_at: new Date().toISOString()
    })
    .eq('id', queryRecord.id);

  if (updateError) throw updateError;

  // 3. Audit log
  await supabase.from('audit_logs').insert({
    action: 'ACCOUNT_BALANCE_TIMEOUT_RECEIVED',
    entity_type: 'account_balance_queries',
    entity_id: queryRecord.id,
    new_values: { conversationId, clientIp }
  });

  // 4. Send dashboard notification
  const alertMsg = `Safaricom account balance synchronization request timed out. Please try again.`;
  try {
    await supabase.from('notifications').insert({
      channel: 'dashboard',
      recipient: queryRecord.created_by || 'admin',
      message: alertMsg,
      status: 'sent',
      created_at: new Date().toISOString()
    });
  } catch (notifErr) {
    console.error('[AccountBalance Timeout] Notification failed:', notifErr);
  }

  return { success: true, status: 'timeout' };
}
