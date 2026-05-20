import { createClient } from '@supabase/supabase-js';
import { resolveConfig } from '../daraja/darajaClient';
import { DarajaService } from '../daraja/darajaService';
import { encryptInitiatorPassword } from '../b2cTopup/initiateB2CTopup';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export interface InitiateTransactionStatusParams {
  transactionId: string; // The Safaricom Receipt Number to query
  queryType: 'C2B' | 'B2C' | 'B2B' | 'REVERSAL';
  userId?: string;
  remarks?: string;
  occasion?: string;
}

export async function initiateTransactionStatus(params: InitiateTransactionStatusParams) {
  const { transactionId, queryType, userId, remarks = 'Manual Status Query', occasion = 'StatusCheck' } = params;

  if (!transactionId) {
    throw new Error('Transaction ID (Safaricom Receipt Number) is required.');
  }

  // 1. Resolve configuration
  const config = await resolveConfig();
  const initiatorName = process.env.MPESA_INITIATOR_NAME || config.initiatorName || 'api_user';
  const initiatorPassword = process.env.MPESA_INITIATOR_PASSWORD || '';
  const securityCredential = initiatorPassword
    ? await encryptInitiatorPassword(initiatorPassword, config.env)
    : config.securityCredential || 'credential';

  // Determine shortcode based on query type or default
  // For B2C or B2B payouts, the PartyA is usually our shortcode.
  const partyA = config.shortCode || '174379';

  // 2. Insert queued/pending query record
  const { data: queryRecord, error: insertError } = await supabase
    .from('transaction_status_queries')
    .insert({
      transaction_id: transactionId,
      query_type: queryType,
      originator_conversation_id: 'pending',
      conversation_id: 'pending',
      status: 'pending',
      created_by: userId || null,
      raw_request: {
        Initiator: initiatorName,
        TransactionID: transactionId,
        PartyA: partyA,
        IdentifierType: '4',
        Remarks: remarks,
        Occasion: occasion,
        queryType
      }
    })
    .select()
    .single();

  if (insertError) {
    console.error('[TransactionStatus] Database insert error:', insertError);
    throw new Error(`Failed to create transaction status query record: ${insertError.message}`);
  }

  // 3. Log audit event for status query creation
  await supabase.from('audit_logs').insert({
    user_id: userId || null,
    action: 'TRANSACTION_STATUS_QUERY_INITIATED',
    entity_type: 'transaction_status_queries',
    entity_id: queryRecord.id,
    new_values: { transaction_id: transactionId, query_type: queryType }
  });

  // 4. Submit to Safaricom Daraja API
  try {
    const callbackToken = process.env.MPESA_CALLBACK_TOKEN || 'skylink-default-secure-callback-token';
    const baseUrl = process.env.MPESA_CALLBACK_URL || '';
    
    // Ensure clean slash handling for URL construction
    const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    const resultUrl = `${cleanBaseUrl}/api/webhooks/transaction-status/result?token=${callbackToken}`;
    const timeoutUrl = `${cleanBaseUrl}/api/webhooks/transaction-status/timeout?token=${callbackToken}`;

    const response = await DarajaService.queryTransactionStatus({
      Initiator: initiatorName,
      SecurityCredential: securityCredential,
      TransactionID: transactionId,
      PartyA: partyA,
      IdentifierType: '4',
      ResultURL: resultUrl,
      QueueTimeOutURL: timeoutUrl,
      Remarks: remarks,
      Occasion: occasion
    });

    const isOk = response.ResponseCode === '0';
    const nextStatus = isOk ? 'processing' : 'failed';

    const { data: updatedRecord, error: updateError } = await supabase
      .from('transaction_status_queries')
      .update({
        status: nextStatus,
        conversation_id: response.ConversationID || 'failed',
        originator_conversation_id: response.OriginatorConversationID || 'failed',
        raw_response: response,
        updated_at: new Date().toISOString()
      })
      .eq('id', queryRecord.id)
      .select()
      .single();

    if (updateError) throw updateError;

    return updatedRecord;

  } catch (err: any) {
    console.error('[TransactionStatus API Error]', err);

    const { data: failedRecord } = await supabase
      .from('transaction_status_queries')
      .update({
        status: 'failed',
        conversation_id: 'error',
        originator_conversation_id: 'error',
        raw_response: { error: err.message || 'Immediate API Submission Failure' },
        updated_at: new Date().toISOString()
      })
      .eq('id', queryRecord.id)
      .select()
      .single();

    return failedRecord || queryRecord;
  }
}
