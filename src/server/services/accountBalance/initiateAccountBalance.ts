import { createClient } from '@supabase/supabase-js';
import { resolveConfig } from '../daraja/darajaClient';
import { DarajaService } from '../daraja/darajaService';
import { encryptInitiatorPassword } from '../b2cTopup/initiateB2CTopup';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export interface InitiateAccountBalanceParams {
  userId?: string;
  remarks?: string;
}

export async function initiateAccountBalance(params: InitiateAccountBalanceParams) {
  const { userId, remarks = 'Sync Account Balance' } = params;

  // 1. Resolve configuration
  const config = await resolveConfig();
  const initiatorName = process.env.MPESA_INITIATOR_NAME || config.initiatorName || 'api_user';
  const initiatorPassword = process.env.MPESA_INITIATOR_PASSWORD || '';
  const securityCredential = initiatorPassword
    ? await encryptInitiatorPassword(initiatorPassword, config.env)
    : config.securityCredential || 'credential';

  // The PartyA is our shortcode whose balance we are querying
  const partyA = config.shortCode || '174379';

  // 2. Insert queued/pending query record
  const { data: queryRecord, error: insertError } = await supabase
    .from('account_balance_queries')
    .insert({
      originator_conversation_id: 'pending',
      conversation_id: 'pending',
      status: 'pending',
      created_by: userId || null,
      raw_request: {
        Initiator: initiatorName,
        PartyA: partyA,
        Remarks: remarks,
        CommandID: 'AccountBalance',
        IdentifierType: '4'
      }
    })
    .select()
    .single();

  if (insertError) {
    console.error('[AccountBalance] Database insert error:', insertError);
    throw new Error(`Failed to create account balance query record: ${insertError.message}`);
  }

  // 3. Log audit event for status query creation
  await supabase.from('audit_logs').insert({
    user_id: userId || null,
    action: 'ACCOUNT_BALANCE_QUERY_INITIATED',
    entity_type: 'account_balance_queries',
    entity_id: queryRecord.id,
    new_values: { shortcode: partyA }
  });

  // 4. Submit to Safaricom Daraja API
  try {
    const callbackToken = process.env.MPESA_CALLBACK_TOKEN || 'skylink-default-secure-callback-token';
    const baseUrl = process.env.MPESA_CALLBACK_URL || '';
    
    // Ensure clean slash handling for URL construction
    const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    const resultUrl = `${cleanBaseUrl}/api/webhooks/account-balance/result?token=${callbackToken}`;
    const timeoutUrl = `${cleanBaseUrl}/api/webhooks/account-balance/timeout?token=${callbackToken}`;

    const response = await DarajaService.queryAccountBalance({
      Initiator: initiatorName,
      SecurityCredential: securityCredential,
      PartyA: partyA,
      ResultURL: resultUrl,
      QueueTimeOutURL: timeoutUrl,
      Remarks: remarks
    });

    const isOk = response.ResponseCode === '0';
    const nextStatus = isOk ? 'processing' : 'failed';

    const { data: updatedRecord, error: updateError } = await supabase
      .from('account_balance_queries')
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
    console.error('[AccountBalance API Error]', err);

    const { data: failedRecord } = await supabase
      .from('account_balance_queries')
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
