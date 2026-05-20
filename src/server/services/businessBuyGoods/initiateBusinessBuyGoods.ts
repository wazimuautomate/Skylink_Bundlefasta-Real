import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { resolveConfig, getAccessToken } from '../daraja/darajaClient';
import { validateBusinessBuyGoods } from './validateBusinessBuyGoods';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

let sandboxCertCache: Buffer | null = null;

/**
 * Dynamically retrieves the Safaricom public certificate and encrypts the initiator password.
 */
async function encryptInitiatorPassword(password: string, env: 'sandbox' | 'production'): Promise<string> {
  let certBuffer: Buffer;
  
  if (env === 'sandbox') {
    if (sandboxCertCache) {
      certBuffer = sandboxCertCache;
    } else {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000); // 4s timeout
        const certRes = await fetch('https://developer.safaricom.co.ke/sites/default/files/cert/cert_sandbox/cert.cer', { signal: controller.signal });
        clearTimeout(timeoutId);
        if (certRes.ok) {
          const ab = await certRes.arrayBuffer();
          certBuffer = Buffer.from(ab);
          sandboxCertCache = certBuffer; // Cache it
        } else {
          throw new Error(`HTTP status ${certRes.status}`);
        }
      } catch (fetchErr) {
        console.warn('[Daraja Encrypt] Failed to fetch sandbox certificate from Safaricom. Falling back to env MPESA_SECURITY_CREDENTIAL.', fetchErr);
        // Fallback: If we can't fetch it, we assume the user already stored the encrypted credential in MPESA_SECURITY_CREDENTIAL
        return process.env.MPESA_SECURITY_CREDENTIAL || 'credential';
      }
    }
  } else {
    // Production
    const prodCertPem = process.env.MPESA_PUBLIC_CERTIFICATE_PEM;
    if (!prodCertPem) {
      console.warn('[Daraja Encrypt] MPESA_PUBLIC_CERTIFICATE_PEM env is missing. Falling back to MPESA_SECURITY_CREDENTIAL.');
      return process.env.MPESA_SECURITY_CREDENTIAL || 'credential';
    }
    certBuffer = Buffer.from(prodCertPem, 'utf-8');
  }

  try {
    // Safaricom certificate encryption using RSA PKCS#1 v1.5 padding
    const publicKey = crypto.createPublicKey({
      key: certBuffer,
      format: certBuffer.toString().includes('-----BEGIN') ? 'pem' : 'der',
      type: 'spki'
    });
    
    const encrypted = crypto.publicEncrypt(
      {
        key: publicKey,
        padding: crypto.constants.RSA_PKCS1_PADDING
      },
      Buffer.from(password)
    );
    return encrypted.toString('base64');
  } catch (err: any) {
    console.error('[Daraja Encrypt] Encryption failed:', err);
    throw new Error(`Initiator password encryption failed: ${err.message}`);
  }
}

export interface InitiatePayoutParams {
  receiverTill: string;
  amount: number;
  accountReference: string;
  remarks: string;
  occasion?: string;
  requesterPhone?: string;
  confirmationPassword?: string;
  userId?: string;
  parentTransactionId?: string; // Links retries
}

export async function initiateBusinessBuyGoods(params: InitiatePayoutParams) {
  const {
    receiverTill,
    amount,
    accountReference,
    remarks,
    occasion = '',
    requesterPhone = '',
    confirmationPassword,
    userId,
    parentTransactionId
  } = params;

  // 1. Generate unique internal reference UUID
  const internalReference = crypto.randomUUID();

  // 2. Validate input and safety checks (limits, daily limit, cooldown)
  const validation = await validateBusinessBuyGoods({
    amount,
    receiverTill,
    confirmationPassword
  });

  if (!validation.valid) {
    throw new Error(validation.error || 'Validation failed');
  }

  // 3. Resolve configs and create queued row
  const config = await resolveConfig();
  const initiatorName = process.env.MPESA_INITIATOR_NAME || config.initiatorName || 'api_user';
  const senderShortcode = config.b2bShortCode || config.shortCode || '174379';

  // Determine retry count
  let retryCount = 0;
  if (parentTransactionId) {
    const { data: parent } = await supabase
      .from('business_buy_goods_transactions')
      .select('retry_count')
      .eq('id', parentTransactionId)
      .maybeSingle();
    retryCount = (parent?.retry_count || 0) + 1;
  }

  const { data: trx, error: insertError } = await supabase
    .from('business_buy_goods_transactions')
    .insert({
      internal_reference: internalReference,
      parent_transaction_id: parentTransactionId || null,
      initiator_name: initiatorName,
      sender_shortcode: senderShortcode,
      receiver_till: receiverTill,
      sender_identifier_type: '4',
      receiver_identifier_type: '2', // Till Number
      requester_phone: requesterPhone || null,
      account_reference: accountReference,
      remarks: remarks,
      occasion: occasion || null,
      amount: amount,
      currency: 'KES',
      status: 'queued',
      created_by: userId || null,
      retry_count: retryCount
    })
    .select()
    .single();

  if (insertError) {
    console.error('[B2B Payout] Insert error:', insertError);
    throw new Error(`Failed to create transaction record: ${insertError.message}`);
  }

  // Audit payout creation
  await supabase.from('payout_audit_logs').insert({
    payout_id: trx.id,
    action: 'payout_created',
    actor: initiatorName,
    metadata: { internal_reference: internalReference, amount, receiverTill, parent_transaction_id: parentTransactionId || null }
  });

  // 4. Submit to Daraja B2B API
  try {
    // Transition status to submitted
    await supabase
      .from('business_buy_goods_transactions')
      .update({ status: 'submitted', raw_request: { timestamp: new Date().toISOString() } })
      .eq('id', trx.id);

    await supabase.from('payout_audit_logs').insert({
      payout_id: trx.id,
      action: 'payout_submitted',
      actor: initiatorName
    });

    // Encrypt initiator password dynamically
    const initiatorPassword = process.env.MPESA_INITIATOR_PASSWORD || '';
    const securityCredential = initiatorPassword 
      ? await encryptInitiatorPassword(initiatorPassword, config.env)
      : config.securityCredential || 'credential';

    const token = await getAccessToken(config);
    const url = 'https://api.safaricom.co.ke/mpesa/b2b/v1/paymentrequest';

    const b2bResultUrl = process.env.MPESA_B2B_RESULT_URL || config.callbackUrl;
    const b2bTimeoutUrl = process.env.MPESA_B2B_TIMEOUT_URL || config.callbackUrl;

    const payload = {
      Initiator: initiatorName,
      SecurityCredential: securityCredential,
      CommandID: 'BusinessBuyGoods',
      SenderIdentifierType: '4',
      RecieverIdentifierType: '2',
      Amount: amount,
      PartyA: senderShortcode,
      PartyB: receiverTill,
      AccountReference: accountReference,
      Remarks: remarks,
      QueueTimeOutURL: b2bTimeoutUrl,
      ResultURL: b2bResultUrl
    };

    const apiStart = Date.now();
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const responseText = await response.text();
    let responseJson: any = null;
    try {
      responseJson = JSON.parse(responseText);
    } catch {}

    const apiDuration = Date.now() - apiStart;
    const isOk = response.ok && responseJson?.ResponseCode === '0';
    const nextStatus = isOk ? 'processing' : 'failed';

    const { data: updatedTrx, error: updateError } = await supabase
      .from('business_buy_goods_transactions')
      .update({
        status: nextStatus,
        conversation_id: responseJson?.ConversationID || null,
        originator_conversation_id: responseJson?.OriginatorConversationID || null,
        result_code: responseJson?.ResponseCode || response.status.toString(),
        result_description: responseJson?.ResponseDescription || responseText || 'No response details',
        raw_response: {
          statusCode: response.status,
          body: responseJson || responseText,
          durationMs: apiDuration
        }
      })
      .eq('id', trx.id)
      .select()
      .single();

    if (updateError) throw updateError;

    // Log submitted/failed result
    await supabase.from('payout_audit_logs').insert({
      payout_id: trx.id,
      action: isOk ? 'payout_submitted_success' : 'payout_failed',
      actor: initiatorName,
      metadata: { response: responseJson || responseText }
    });

    return updatedTrx;

  } catch (err: any) {
    console.error('[B2B API Submission Error]', err);

    const { data: failedTrx } = await supabase
      .from('business_buy_goods_transactions')
      .update({
        status: 'failed',
        result_description: err.message || 'Immediate API Submission Failure',
        raw_response: { error: err.message }
      })
      .eq('id', trx.id)
      .select()
      .single();

    await supabase.from('payout_audit_logs').insert({
      payout_id: trx.id,
      action: 'payout_failed',
      actor: initiatorName,
      metadata: { error: err.message }
    });

    return failedTrx || trx;
  }
}
