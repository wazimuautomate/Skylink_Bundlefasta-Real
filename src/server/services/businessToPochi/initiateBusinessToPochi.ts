import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { resolveConfig, callDaraja } from '../daraja/darajaClient';
import { validateBusinessToPochi } from './validateBusinessToPochi';
import { B2CResponse } from '../daraja/types';

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
        console.warn('[Daraja Pochi Encrypt] Failed to fetch sandbox certificate from Safaricom. Falling back to env MPESA_SECURITY_CREDENTIAL.', fetchErr);
        return process.env.MPESA_SECURITY_CREDENTIAL || 'credential';
      }
    }
  } else {
    // Production
    const prodCertPem = process.env.MPESA_PUBLIC_CERTIFICATE_PEM;
    if (!prodCertPem) {
      console.warn('[Daraja Pochi Encrypt] MPESA_PUBLIC_CERTIFICATE_PEM env is missing. Falling back to MPESA_SECURITY_CREDENTIAL.');
      return process.env.MPESA_SECURITY_CREDENTIAL || 'credential';
    }
    certBuffer = Buffer.from(prodCertPem, 'utf-8');
  }

  try {
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
    console.error('[Daraja Pochi Encrypt] Encryption failed:', err);
    throw new Error(`Initiator password encryption failed: ${err.message}`);
  }
}

export interface InitiatePochiParams {
  receiverPhone: string;
  amount: number;
  accountReference: string;
  remarks: string;
  occasion?: string;
  requesterPhone?: string;
  confirmationPassword?: string;
  userId?: string;
  parentTransactionId?: string; // Links retries
}

export async function initiateBusinessToPochi(params: InitiatePochiParams) {
  const {
    receiverPhone,
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
  const validation = await validateBusinessToPochi({
    amount,
    receiverPhone,
    confirmationPassword
  });

  if (!validation.valid || !validation.formattedPhone) {
    throw new Error(validation.error || 'Validation failed');
  }

  const normalizedReceiverPhone = validation.formattedPhone;

  // 3. Resolve configs and create queued row
  const config = await resolveConfig();
  const initiatorName = process.env.MPESA_INITIATOR_NAME || config.initiatorName || 'api_user';
  const senderShortcode = config.b2cShortCode || config.shortCode || '174379';

  // Determine retry count
  let retryCount = 0;
  if (parentTransactionId) {
    const { data: parent } = await supabase
      .from('business_to_pochi_transactions')
      .select('retry_count')
      .eq('id', parentTransactionId)
      .maybeSingle();
    retryCount = (parent?.retry_count || 0) + 1;
  }

  const { data: trx, error: insertError } = await supabase
    .from('business_to_pochi_transactions')
    .insert({
      internal_reference: internalReference,
      parent_transaction_id: parentTransactionId || null,
      initiator_name: initiatorName,
      sender_shortcode: senderShortcode,
      receiver_phone: normalizedReceiverPhone,
      sender_identifier_type: '4',
      receiver_identifier_type: '1', // MSISDN (Mobile Number)
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
    console.error('[Pochi Payout] Insert error:', insertError);
    throw new Error(`Failed to create transaction record: ${insertError.message}`);
  }

  // Audit payout creation
  await supabase.from('pochi_audit_logs').insert({
    pochi_transaction_id: trx.id,
    action: 'payout_created',
    actor: initiatorName,
    metadata: { internal_reference: internalReference, amount, receiverPhone: normalizedReceiverPhone, parent_transaction_id: parentTransactionId || null }
  });

  // 4. Submit to Daraja B2C API
  try {
    // Transition status to submitted
    await supabase
      .from('business_to_pochi_transactions')
      .update({ status: 'submitted', raw_request: { timestamp: new Date().toISOString() } })
      .eq('id', trx.id);

    await supabase.from('pochi_audit_logs').insert({
      pochi_transaction_id: trx.id,
      action: 'payout_submitted',
      actor: initiatorName
    });

    // Encrypt initiator password dynamically
    const initiatorPassword = process.env.MPESA_INITIATOR_PASSWORD || '';
    const securityCredential = initiatorPassword 
      ? await encryptInitiatorPassword(initiatorPassword, config.env)
      : config.securityCredential || 'credential';

    const url = 'https://api.safaricom.co.ke/mpesa/b2c/v1/paymentrequest';

    const resultUrl = process.env.MPESA_POCHI_RESULT_URL || config.callbackUrl;
    const timeoutUrl = process.env.MPESA_POCHI_TIMEOUT_URL || config.callbackUrl;

    const payload = {
      InitiatorName: initiatorName,
      SecurityCredential: securityCredential,
      CommandID: 'BusinessPayment',
      SenderIdentifierType: '4',
      RecieverIdentifierType: '1', // MSISDN
      Amount: amount,
      PartyA: senderShortcode,
      PartyB: normalizedReceiverPhone,
      Remarks: remarks,
      QueueTimeOutURL: timeoutUrl,
      ResultURL: resultUrl,
      Occasion: occasion || undefined
    };

    const apiStart = Date.now();
    const responseJson = await callDaraja<B2CResponse>(url, payload, config);
    const apiDuration = Date.now() - apiStart;

    const isOk = responseJson?.ResponseCode === '0';
    const nextStatus = isOk ? 'processing' : 'failed';

    const { data: updatedTrx, error: updateError } = await supabase
      .from('business_to_pochi_transactions')
      .update({
        status: nextStatus,
        conversation_id: responseJson?.ConversationID || null,
        originator_conversation_id: responseJson?.OriginatorConversationID || null,
        result_code: responseJson?.ResponseCode || null,
        result_description: responseJson?.ResponseDescription || 'No response details',
        raw_response: {
          statusCode: 200,
          body: responseJson,
          durationMs: apiDuration
        }
      })
      .eq('id', trx.id)
      .select()
      .single();

    if (updateError) throw updateError;

    // Log submitted/failed result
    await supabase.from('pochi_audit_logs').insert({
      pochi_transaction_id: trx.id,
      action: isOk ? 'payout_submitted_success' : 'payout_failed',
      actor: initiatorName,
      metadata: { response: responseJson }
    });

    return updatedTrx;

  } catch (err: any) {
    console.error('[Pochi API Submission Error]', err);

    const { data: failedTrx } = await supabase
      .from('business_to_pochi_transactions')
      .update({
        status: 'failed',
        result_description: err.message || 'Immediate API Submission Failure',
        raw_response: { error: err.message }
      })
      .eq('id', trx.id)
      .select()
      .single();

    await supabase.from('pochi_audit_logs').insert({
      pochi_transaction_id: trx.id,
      action: 'payout_failed',
      actor: initiatorName,
      metadata: { error: err.message }
    });

    return failedTrx || trx;
  }
}
