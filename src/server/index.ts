import express from 'express';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { DarajaService } from './services/daraja/darajaService';
import { resolveConfig, getAccessToken } from './services/daraja/darajaClient';
import { validateWebhookToken, checkIdempotency, logRawPayload } from './services/daraja/webhookValidator';
import { initiateBusinessBuyGoods } from './services/businessBuyGoods/initiateBusinessBuyGoods';
import { handleBusinessBuyGoodsResult } from './services/businessBuyGoods/handleBusinessBuyGoodsResult';
import { handleBusinessBuyGoodsTimeout } from './services/businessBuyGoods/handleBusinessBuyGoodsTimeout';
import { initiateB2CTopup } from './services/b2cTopup/initiateB2CTopup';
import { handleB2CTopupResult } from './services/b2cTopup/handleB2CTopupResult';
import { handleB2CTopupTimeout } from './services/b2cTopup/handleB2CTopupTimeout';
import { reconcileB2CTopup } from './services/b2cTopup/reconcileB2CTopup';
import { initiateTransactionStatus } from './services/transactionStatus/initiateTransactionStatus';
import { handleTransactionStatusResult } from './services/transactionStatus/handleTransactionStatusResult';
import { handleTransactionStatusTimeout } from './services/transactionStatus/handleTransactionStatusTimeout';
import { initiateAccountBalance } from './services/accountBalance/initiateAccountBalance';
import { handleAccountBalanceResult } from './services/accountBalance/handleAccountBalanceResult';
import { handleAccountBalanceTimeout } from './services/accountBalance/handleAccountBalanceTimeout';
import { initiateReversal } from './services/reversal/initiateReversal';
import { handleReversalResult } from './services/reversal/handleReversalResult';
import { handleReversalTimeout } from './services/reversal/handleReversalTimeout';
import { initiateBusinessToPochi } from './services/businessToPochi/initiateBusinessToPochi';
import { handleBusinessToPochiResult } from './services/businessToPochi/handleBusinessToPochiResult';
import { handleBusinessToPochiTimeout } from './services/businessToPochi/handleBusinessToPochiTimeout';

dotenv.config();

const app = express();

// Custom CORS Middleware
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

app.use(express.json());

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

/**
 * Daraja Connection Test Endpoint
 * POST /api/mpesa/test-connection
 */
app.post('/api/mpesa/test-connection', async (req, res) => {
  const { action, payload } = req.body;
  const start = Date.now();
  try {
    const config = await resolveConfig();
    let result: any = null;

    if (action === 'oauth') {
      const token = await getAccessToken(config);
      result = {
        access_token: token.substring(0, 8) + '...' + token.substring(token.length - 8),
        expires_in: 3599
      };
    } else if (action === 'stkpush') {
      const phone = payload?.phone || '254708374149';
      const amount = Number(payload?.amount) || 10;
      const ref = payload?.reference || 'TEST-' + Math.floor(Math.random() * 10000);
      result = await DarajaService.initiateSTKPush(phone, amount, ref, 'Test STK Push');
    } else if (action === 'balance') {
      result = await DarajaService.queryAccountBalance({
        Initiator: config.initiatorName || 'api_user',
        SecurityCredential: config.securityCredential || 'credential',
        PartyA: config.shortCode || '174379',
        ResultURL: config.callbackUrl,
        QueueTimeOutURL: config.callbackUrl,
        Remarks: 'Test Account Balance'
      });
    } else if (action === 'status') {
      const transactionId = payload?.transactionId || 'OHT1234567';
      result = await DarajaService.queryTransactionStatus({
        Initiator: config.initiatorName || 'api_user',
        SecurityCredential: config.securityCredential || 'credential',
        TransactionID: transactionId,
        PartyA: config.shortCode || '174379',
        IdentifierType: '4',
        ResultURL: config.callbackUrl,
        QueueTimeOutURL: config.callbackUrl,
        Remarks: 'Test Transaction Status'
      });
    } else if (action === 'b2c') {
      const phone = payload?.phone || '254708374149';
      const amount = Number(payload?.amount) || 10;
      result = await DarajaService.requestB2C({
        CommandID: 'BusinessPayment',
        Amount: amount,
        PartyB: phone,
        Remarks: 'Test B2C',
        QueueTimeOutURL: config.callbackUrl,
        ResultURL: config.callbackUrl
      });
    } else if (action === 'reversal') {
      const transactionId = payload?.transactionId || 'OHT1234567';
      const amount = Number(payload?.amount) || 10;
      result = await DarajaService.requestReversal({
        Initiator: config.initiatorName || 'api_user',
        SecurityCredential: config.securityCredential || 'credential',
        TransactionID: transactionId,
        Amount: amount,
        ReceiverParty: config.shortCode || '174379',
        RecieverIdentifierType: '4',
        ResultURL: config.callbackUrl,
        QueueTimeOutURL: config.callbackUrl,
        Remarks: 'Test Reversal'
      });
    } else if (action === 'b2b_buy_goods') {
      const till = payload?.till || '174379';
      const amount = Number(payload?.amount) || 10;
      result = await initiateBusinessBuyGoods({
        receiverTill: till,
        amount,
        accountReference: payload?.reference || 'TEST-B2B',
        remarks: payload?.remarks || 'Test B2B Buy Goods Payout',
        confirmationPassword: payload?.password,
        userId: payload?.userId
      });
    } else {
      return res.status(400).json({ error: 'Unknown test action' });
    }

    const latency = Date.now() - start;
    return res.json({
      success: true,
      action,
      environment: config.env,
      timestamp: new Date().toISOString(),
      latency,
      payload: result
    });
  } catch (err: any) {
    const latency = Date.now() - start;
    console.error(`[Test Connection Error] Action: ${action}`, err);
    return res.status(500).json({
      success: false,
      action,
      environment: 'sandbox',
      timestamp: new Date().toISOString(),
      latency,
      error: err.message
    });
  }
});

/**
 * 7. STK PUSH (Initiation Request)
 * POST /api/mpesa/stkpush
 */
app.post('/api/mpesa/stkpush', async (req, res) => {
  const { phone, amount, reference, description, paymentLinkId } = req.body;

  if (!phone || !amount || !reference) {
    return res.status(400).json({ error: 'Missing phone, amount, or reference parameter.' });
  }

  try {
    // 1. Dispatch STK Push to Safaricom Daraja API
    const mpesaResponse = await DarajaService.initiateSTKPush(
      phone,
      Number(amount),
      reference,
      description || 'STK Push Collection'
    );

    const { MerchantRequestID, CheckoutRequestID, ResponseCode, ResponseDescription, CustomerMessage } = mpesaResponse;

    // 2. Log pending transaction in database
    const { data: trx, error: txError } = await supabase
      .from('transactions')
      .insert({
        transaction_type: 'STK_PUSH',
        direction: 'incoming',
        provider: 'mpesa',
        amount: Number(amount),
        reference: reference,
        account_reference: reference,
        phone_number: phone,
        status: 'pending',
        checkout_request_id: CheckoutRequestID,
        merchant_request_id: MerchantRequestID,
        result_code: ResponseCode,
        result_desc: ResponseDescription,
        payment_link_id: paymentLinkId || null,
        occurred_at: new Date().toISOString()
      })
      .select()
      .single();

    if (txError) throw txError;

    // 3. Save raw Daraja API response event
    await logRawPayload(trx.id, 'STK_PUSH_INITIATED', mpesaResponse, 'mpesa_api');

    return res.json({
      ResponseCode,
      ResponseDescription,
      MerchantRequestID,
      CheckoutRequestID,
      CustomerMessage
    });

  } catch (err: any) {
    console.error('[STK Push Request Error]', err);
    
    // Log API failure to audit logs
    try {
      await supabase.from('audit_logs').insert({
        action: 'STK_PUSH_API_FAILURE',
        entity_type: 'integration',
        new_values: { error: err.message, payload: req.body }
      });
    } catch {}

    return res.status(500).json({ error: err.message });
  }
});

/**
 * 8. STK PUSH QUERY (Status Check)
 * POST /api/mpesa/stkpush/query
 */
app.post('/api/mpesa/stkpush/query', async (req, res) => {
  const { checkoutRequestId } = req.body;

  if (!checkoutRequestId) {
    return res.status(400).json({ error: 'Missing checkoutRequestId parameter.' });
  }

  try {
    const statusResult = await DarajaService.querySTKPush(checkoutRequestId);
    return res.json(statusResult);
  } catch (err: any) {
    console.error('[STK Push Query Error]', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * STK Push Webhook Callback Endpoint
 * POST /api/mpesa/callback
 */
app.post('/api/mpesa/callback', async (req, res) => {
  // Enforce secure token verification
  if (!validateWebhookToken(req)) {
    return res.status(401).json({ error: 'Unauthorized webhook access' });
  }

  const { Body } = req.body;
  if (!Body || !Body.stkCallback) {
    return res.status(400).json({ error: 'Invalid callback payload' });
  }

  const { MerchantRequestID, CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = Body.stkCallback;

  try {
    // 1. Idempotency Check: Verify if callback event was already processed
    const isDuplicate = await checkIdempotency(CheckoutRequestID, 'STK_CALLBACK');
    if (isDuplicate) {
      console.log(`[Idempotency] Duplicate callback ignored for checkout ID: ${CheckoutRequestID}`);
      return res.json({ ResultCode: 0, ResultDesc: 'Success (Duplicate Callback ignored)' });
    }

    // 2. Fetch the corresponding transaction
    const { data: trx, error: txFetchError } = await supabase
      .from('transactions')
      .select('*')
      .eq('checkout_request_id', CheckoutRequestID)
      .maybeSingle();

    if (txFetchError) throw txFetchError;

    if (!trx) {
      console.warn(`[Warning] No matching transaction found for checkout ID: ${CheckoutRequestID}`);
      // Save orphaned callback payload for auditing
      await logRawPayload(null, 'STK_CALLBACK_ORPHAN', req.body, 'mpesa_webhook');
      return res.status(404).json({ error: 'Matching transaction not found' });
    }

    // If transaction is already resolved, don't execute updates (Idempotency)
    if (trx.status !== 'pending') {
      console.log(`[Idempotency] Transaction ${trx.id} already resolved as ${trx.status}`);
      return res.json({ ResultCode: 0, ResultDesc: 'Success (Transaction already resolved)' });
    }

    const success = ResultCode === 0;
    const items = CallbackMetadata?.Item || [];
    const receiptItem = items.find((i: any) => i.Name === 'MpesaReceiptNumber');
    const receipt = receiptItem ? receiptItem.Value : null;

    // 3. Save raw webhook response payload (enforce raw callback payload storage)
    await logRawPayload(trx.id, 'STK_CALLBACK', req.body, 'mpesa_webhook');

    // 4. Update transaction status
    const { data: updatedTx, error: txUpdateError } = await supabase
      .from('transactions')
      .update({
        status: success ? 'completed' : 'failed',
        external_transaction_id: receipt,
        result_code: ResultCode.toString(),
        result_desc: ResultDesc
      })
      .eq('id', trx.id)
      .select()
      .single();

    if (txUpdateError) throw txUpdateError;

    // 5. Double-Entry Ledger Adjustments (only if successful callback)
    if (success && updatedTx) {
      const { error: ledgerError } = await supabase.from('ledger_entries').insert([
        {
          transaction_id: updatedTx.id,
          account_id: 'a2222222-2222-2222-2222-222222222222', // STK Collection Channel
          entry_type: 'DEBIT',
          amount: updatedTx.amount
        },
        {
          transaction_id: updatedTx.id,
          account_id: 'a3333333-3333-3333-3333-333333333333', // Disbursements Vault
          entry_type: 'CREDIT',
          amount: updatedTx.amount
        }
      ]);

      if (ledgerError) {
        console.error('[Ledger Error] Failed to write double entry ledger rows:', ledgerError);
      }
    }

    // 6. Write to Audit Logs
    try {
      await supabase.from('audit_logs').insert({
        action: `MPESA_STK_CALLBACK_PROCESSED`,
        entity_type: 'transaction',
        entity_id: trx.id,
        new_values: { status: success ? 'completed' : 'failed', receipt }
      });
    } catch {}

    return res.json({ ResultCode: 0, ResultDesc: 'Success' });

  } catch (err: any) {
    console.error('Callback processing error:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * 2. C2B V2 REGISTER URL / 3. C2B PAYBILL REGISTER URL
 * POST /api/mpesa/c2b/register
 */
app.post('/api/mpesa/c2b/register', async (req, res) => {
  const { version, responseType, confirmationUrl, validationUrl } = req.body;

  if (!confirmationUrl || !validationUrl) {
    return res.status(400).json({ error: 'Missing URLs parameter.' });
  }

  try {
    const params = {
      ResponseType: responseType || 'Completed',
      ConfirmationURL: confirmationUrl,
      ValidationURL: validationUrl
    };

    let registerResult;
    if (version === 'v2') {
      registerResult = await DarajaService.registerC2BUrlV2(params);
    } else {
      registerResult = await DarajaService.registerC2BUrlV1(params);
    }

    return res.json(registerResult);
  } catch (err: any) {
    console.error('[C2B Register Error]', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * C2B Validation Webhook Endpoint
 * POST /api/mpesa/validate
 */
app.post('/api/mpesa/validate', (req, res) => {
  console.log('[C2B Validation] Payload received:', req.body);
  // Safaricom validation URLs require returning validation approval format
  return res.json({
    ResultCode: 0,
    ResultDesc: 'Accepted'
  });
});

/**
 * C2B Confirmation Webhook Endpoint
 * POST /api/mpesa/confirm
 */
app.post('/api/mpesa/confirm', async (req, res) => {
  // Enforce callback validation
  if (!validateWebhookToken(req)) {
    return res.status(401).json({ error: 'Unauthorized webhook access' });
  }

  console.log('[C2B Confirmation] Payload received:', req.body);
  const { TransID, TransAmount, BillRefNumber, MSISDN } = req.body;

  if (!TransID || !TransAmount) {
    return res.status(400).json({ error: 'Invalid C2B confirmation body' });
  }

  try {
    // 1. Idempotency Check: Verify if transaction ID already exists in transactions
    const { data: existingTx, error: txCheckError } = await supabase
      .from('transactions')
      .select('id')
      .eq('external_transaction_id', TransID)
      .maybeSingle();

    if (txCheckError) throw txCheckError;

    if (existingTx) {
      console.log(`[Idempotency] C2B transaction ${TransID} already processed.`);
      return res.json({ ResultCode: 0, ResultDesc: 'Success (Duplicate Transaction ignored)' });
    }

    // 2. Resolve Customer ID from BillRefNumber/Phone if exists
    let customerId = null;
    const { data: customer } = await supabase
      .from('customers')
      .select('id')
      .or(`account_reference.eq."${BillRefNumber}",phone_number.eq."${MSISDN}"`)
      .maybeSingle();

    if (customer) {
      customerId = customer.id;
    }

    const txStatus = customerId ? 'completed' : 'orphaned';

    // 3. Create Completed or Orphaned Transaction
    const { data: trx, error: txError } = await supabase
      .from('transactions')
      .insert({
        transaction_type: 'PAYBILL',
        direction: 'incoming',
        provider: 'mpesa',
        external_transaction_id: TransID,
        amount: Number(TransAmount),
        reference: BillRefNumber || 'N/A',
        account_reference: BillRefNumber || 'N/A',
        phone_number: MSISDN,
        customer_id: customerId,
        status: txStatus,
        occurred_at: new Date().toISOString()
      })
      .select()
      .single();

    if (txError) throw txError;

    // 4. Save raw event payload
    await logRawPayload(trx.id, 'C2B_CONFIRMATION', req.body, 'mpesa_c2b_webhook');

    // 5. Double-Entry Ledger rows (only if successfully completed/reconciled)
    if (txStatus === 'completed') {
      const { error: ledgerError } = await supabase.from('ledger_entries').insert([
        {
          transaction_id: trx.id,
          account_id: 'a1111111-1111-1111-1111-111111111111', // Paybill Collection Main
          entry_type: 'DEBIT',
          amount: trx.amount
        },
        {
          transaction_id: trx.id,
          account_id: 'a3333333-3333-3333-3333-333333333333', // Disbursements Vault
          entry_type: 'CREDIT',
          amount: trx.amount
        }
      ]);

      if (ledgerError) {
        console.error('[Ledger Error] Failed to write C2B double entry rows:', ledgerError);
      }
    }

    // 6. Write Audit logs
    try {
      await supabase.from('audit_logs').insert({
        action: 'MPESA_C2B_CONFIRMATION_PROCESSED',
        entity_type: 'transaction',
        entity_id: trx.id,
        new_values: { receipt: TransID, amount: TransAmount }
      });
    } catch {}

    return res.json({ ResultCode: 0, ResultDesc: 'Success' });

  } catch (err: any) {
    console.error('C2B confirmation webhook error:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * 1. REVERSAL API
 * POST /api/mpesa/reversal
 */
app.post('/api/mpesa/reversal', async (req, res) => {
  const { originalTransactionId, amount, receiverParty, identifierType, remarks, userId } = req.body;

  if (!originalTransactionId || !amount) {
    return res.status(400).json({ error: 'Missing originalTransactionId or amount parameter.' });
  }

  try {
    const result = await initiateReversal({
      originalTxId: originalTransactionId,
      amount: Number(amount),
      reason: remarks || 'Manual Reversal',
      userId,
      receiverParty,
      identifierType: identifierType as '1' | '2' | '4' | undefined
    });

    return res.json(result);
  } catch (err: any) {
    console.error('[Reversal API Error]', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * 4. TRANSACTION STATUS QUERY (ENTERPRISE IMPLEMENTATION)
 * POST /api/mpesa/transaction/status
 */
app.post('/api/mpesa/transaction/status', async (req, res) => {
  const { transactionId, queryType, userId, remarks, occasion } = req.body;

  if (!transactionId || !queryType) {
    return res.status(400).json({ error: 'Missing transactionId or queryType parameter.' });
  }

  try {
    const result = await initiateTransactionStatus({
      transactionId,
      queryType,
      userId,
      remarks,
      occasion
    });
    return res.json(result);
  } catch (err: any) {
    console.error('[Status Query Error]', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * TRANSACTION STATUS WEBHOOKS
 */
app.post('/api/webhooks/transaction-status/result', async (req, res) => {
  if (!validateWebhookToken(req)) {
    return res.status(401).json({ error: 'Unauthorized webhook access' });
  }
  try {
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';
    const result = await handleTransactionStatusResult(req.body, clientIp);
    return res.json(result);
  } catch (err: any) {
    console.error('[TransactionStatus Result Webhook Error]', err);
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/webhooks/transaction-status/timeout', async (req, res) => {
  if (!validateWebhookToken(req)) {
    return res.status(401).json({ error: 'Unauthorized webhook access' });
  }
  try {
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';
    const result = await handleTransactionStatusTimeout(req.body, clientIp);
    return res.json(result);
  } catch (err: any) {
    console.error('[TransactionStatus Timeout Webhook Error]', err);
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/webhooks/account-balance/result', async (req, res) => {
  if (!validateWebhookToken(req)) {
    return res.status(401).json({ error: 'Unauthorized webhook access' });
  }
  try {
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';
    const result = await handleAccountBalanceResult(req.body, clientIp);
    return res.json(result);
  } catch (err: any) {
    console.error('[AccountBalance Result Webhook Error]', err);
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/webhooks/account-balance/timeout', async (req, res) => {
  if (!validateWebhookToken(req)) {
    return res.status(401).json({ error: 'Unauthorized webhook access' });
  }
  try {
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';
    const result = await handleAccountBalanceTimeout(req.body, clientIp);
    return res.json(result);
  } catch (err: any) {
    console.error('[AccountBalance Timeout Webhook Error]', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * REVERSAL Webhooks
 */
app.post('/api/webhooks/reversal/result', async (req, res) => {
  if (!validateWebhookToken(req)) {
    return res.status(401).json({ error: 'Unauthorized webhook access' });
  }
  try {
    const result = await handleReversalResult(req.body);
    return res.json(result);
  } catch (err: any) {
    console.error('[Reversal Result Webhook Error]', err);
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/webhooks/reversal/timeout', async (req, res) => {
  if (!validateWebhookToken(req)) {
    return res.status(401).json({ error: 'Unauthorized webhook access' });
  }
  try {
    const result = await handleReversalTimeout(req.body);
    return res.json(result);
  } catch (err: any) {
    console.error('[Reversal Timeout Webhook Error]', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * 5. ACCOUNT BALANCE QUERY
 * POST /api/mpesa/account/balance
 */
app.post('/api/mpesa/account/balance', async (req, res) => {
  const { userId, remarks } = req.body;
  try {
    const result = await initiateAccountBalance({ userId, remarks });
    return res.json(result);
  } catch (err: any) {
    console.error('[Account Balance Query Error]', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * 6. B2C API
 * POST /api/mpesa/b2c
 */
app.post('/api/mpesa/b2c', async (req, res) => {
  const { commandId, amount, phone, remarks, occasion } = req.body;

  if (!commandId || !amount || !phone) {
    return res.status(400).json({ error: 'Missing commandId, amount, or phone parameters.' });
  }

  try {
    const config = await resolveConfig();
    const result = await DarajaService.requestB2C({
      CommandID: commandId,
      Amount: Number(amount),
      PartyB: phone,
      Remarks: remarks || 'B2C Payout',
      QueueTimeOutURL: config.callbackUrl,
      ResultURL: config.callbackUrl,
      Occasion: occasion
    });

    return res.json(result);
  } catch (err: any) {
    console.error('[B2C API Error]', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * 9. B2B PAYMENT REQUEST
 * POST /api/mpesa/b2b
 */
app.post('/api/mpesa/b2b', async (req, res) => {
  const { commandId, receiverIdentifierType, amount, receiverParty, reference, remarks } = req.body;

  if (!commandId || !amount || !receiverParty || !reference) {
    return res.status(400).json({ error: 'Missing commandId, amount, receiverParty, or reference.' });
  }

  try {
    const config = await resolveConfig();
    const result = await DarajaService.requestB2B({
      CommandID: commandId,
      RecieverIdentifierType: receiverIdentifierType || '4',
      Amount: Number(amount),
      PartyB: receiverParty,
      AccountReference: reference,
      Remarks: remarks || 'B2B transfer',
      QueueTimeOutURL: config.callbackUrl,
      ResultURL: config.callbackUrl
    });

    return res.json(result);
  } catch (err: any) {
    console.error('[B2B API Error]', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * 10. DYNAMIC QR CODE
 * POST /api/mpesa/qrcode
 */
app.post('/api/mpesa/qrcode', async (req, res) => {
  const { merchantName, refNo, amount, trxCode, size } = req.body;

  if (!merchantName || !refNo || !amount || !trxCode) {
    return res.status(400).json({ error: 'Missing merchantName, refNo, amount, or trxCode.' });
  }

  try {
    const result = await DarajaService.generateDynamicQR({
      MerchantName: merchantName,
      RefNo: refNo,
      Amount: Number(amount),
      TrxCode: trxCode,
      Size: size || '300x300'
    });

    return res.json(result);
  } catch (err: any) {
    console.error('[QR Code API Error]', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * 11. BILL MANAGER APIs
 * POST /api/mpesa/billmanager/:action
 */
app.post('/api/mpesa/billmanager/:action', async (req, res) => {
  const { action } = req.params;

  try {
    let result;
    switch (action) {
      case 'optin':
        result = await DarajaService.billManagerOptIn(req.body);
        break;
      case 'single-invoicing':
        result = await DarajaService.billManagerSingleInvoicing(req.body);
        break;
      case 'bulk-invoicing':
        result = await DarajaService.billManagerBulkInvoicing(req.body.invoices);
        break;
      case 'reconciliation':
        result = await DarajaService.billManagerReconciliation({ InvoiceRefNo: req.body.invoiceRefNo });
        break;
      case 'cancel-single':
        result = await DarajaService.billManagerCancelSingleInvoice(req.body.invoiceRefNo);
        break;
      case 'cancel-bulk':
        result = await DarajaService.billManagerCancelBulkInvoice(req.body.invoiceRefNos);
        break;
      case 'change-optin':
        result = await DarajaService.billManagerChangeOptinDetails(req.body);
        break;
      case 'change-invoice':
        result = await DarajaService.billManagerChangeInvoice(req.body);
        break;
      case 'change-invoices':
        result = await DarajaService.billManagerChangeInvoices(req.body.invoices);
        break;
      default:
        return res.status(404).json({ error: 'Unknown Bill Manager action' });
    }

    return res.json(result);
  } catch (err: any) {
    console.error(`[Bill Manager ${action} Error]`, err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * M-PESA B2B BUSINESS BUY GOODS APIs
 */

// 12. Initiate B2B Merchant Payment
app.post('/api/business-buy-goods', async (req, res) => {
  const { receiverTill, amount, accountReference, remarks, occasion, requesterPhone, confirmationPassword, userId } = req.body;

  if (!receiverTill || !amount || !accountReference || !remarks) {
    return res.status(400).json({ error: 'Missing receiverTill, amount, accountReference, or remarks parameter.' });
  }

  try {
    const result = await initiateBusinessBuyGoods({
      receiverTill,
      amount: Number(amount),
      accountReference,
      remarks,
      occasion,
      requesterPhone,
      confirmationPassword,
      userId
    });

    return res.json(result);
  } catch (err: any) {
    console.error('[B2B Payout API Error]', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
});

// 13. Retry B2B Merchant Payment
app.post('/api/business-buy-goods/retry', async (req, res) => {
  const { transactionId, confirmationPassword, userId } = req.body;

  if (!transactionId) {
    return res.status(400).json({ error: 'Missing transactionId parameter.' });
  }

  try {
    // 1. Retrieve the existing transaction
    const { data: trx, error: fetchError } = await supabase
      .from('business_buy_goods_transactions')
      .select('*')
      .eq('id', transactionId)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!trx) {
      return res.status(444).json({ error: 'Transaction not found.' });
    }

    // 2. Safety: Only failed/timeout transactions can be retried
    if (trx.status !== 'failed' && trx.status !== 'timeout') {
      return res.status(400).json({ error: `Cannot retry transaction with status: ${trx.status}. Only failed or timed out transactions can be retried.` });
    }

    // 3. Initiate the payout as a retry
    const result = await initiateBusinessBuyGoods({
      receiverTill: trx.receiver_till,
      amount: Number(trx.amount),
      accountReference: trx.account_reference,
      remarks: trx.remarks,
      occasion: trx.occasion,
      requesterPhone: trx.requester_phone,
      confirmationPassword,
      userId: userId || trx.created_by,
      parentTransactionId: trx.id
    });

    return res.json(result);
  } catch (err: any) {
    console.error('[B2B Payout Retry Error]', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
});

// 14. B2B Webhook Result Callback
app.post('/api/webhooks/business-buy-goods/result', async (req, res) => {
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  console.log(`[Webhook B2B Result] Received callback from IP: ${clientIp}, Headers:`, req.headers);

  // 1. Verify Webhook Token
  if (!validateWebhookToken(req)) {
    return res.status(401).json({ error: 'Unauthorized webhook access' });
  }

  try {
    // 2. Fetch transaction using ConversationID in payload to link the log
    const conversationId = req.body?.Result?.ConversationID;
    let trxId: string | null = null;
    if (conversationId) {
      const { data: trx } = await supabase
        .from('business_buy_goods_transactions')
        .select('id')
        .eq('conversation_id', conversationId)
        .maybeSingle();
      if (trx) trxId = trx.id;
    }

    // 3. Enforce raw callback payload storage
    await logRawPayload(trxId, 'B2B_RESULT_CALLBACK', req.body, 'mpesa_webhook');

    // 4. Handle Result
    const outcome = await handleBusinessBuyGoodsResult(req.body, clientIp);
    return res.json({ ResultCode: 0, ResultDesc: 'Success', outcome });
  } catch (err: any) {
    console.error('[Webhook B2B Result Error]', err);
    return res.status(500).json({ error: err.message || 'Internal webhook processing error' });
  }
});

// 15. B2B Webhook Timeout Callback
app.post('/api/webhooks/business-buy-goods/timeout', async (req, res) => {
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  console.log(`[Webhook B2B Timeout] Received callback from IP: ${clientIp}`);

  // 1. Verify Webhook Token
  if (!validateWebhookToken(req)) {
    return res.status(401).json({ error: 'Unauthorized webhook access' });
  }

  try {
    // 2. Fetch transaction using ConversationID in payload
    const conversationId = req.body?.ConversationID || req.body?.Result?.ConversationID;
    let trxId: string | null = null;
    if (conversationId) {
      const { data: trx } = await supabase
        .from('business_buy_goods_transactions')
        .select('id')
        .eq('conversation_id', conversationId)
        .maybeSingle();
      if (trx) trxId = trx.id;
    }

    // 3. Log raw timeout payload
    await logRawPayload(trxId, 'B2B_TIMEOUT_CALLBACK', req.body, 'mpesa_webhook');

    // 4. Handle Timeout
    const outcome = await handleBusinessBuyGoodsTimeout(req.body, clientIp);
    return res.json({ ResultCode: 0, ResultDesc: 'Success', outcome });
  } catch (err: any) {
    console.error('[Webhook B2B Timeout Error]', err);
    return res.status(500).json({ error: err.message || 'Internal webhook processing error' });
  }
});

/**
 * M-PESA B2C ACCOUNT TOP UP (B2B FLOAT LOADING) APIs
 */

// 16. Initiate B2C Float Top Up
app.post('/api/treasury/b2c-topup', async (req, res) => {
  const { destinationShortcode, amount, accountReference, remarks, requesterPhone, confirmationPassword, userId } = req.body;

  if (!destinationShortcode || !amount || !accountReference || !remarks) {
    return res.status(400).json({ error: 'Missing destinationShortcode, amount, accountReference, or remarks parameter.' });
  }

  try {
    const result = await initiateB2CTopup({
      destinationShortcode,
      amount: Number(amount),
      accountReference,
      remarks,
      requesterPhone,
      confirmationPassword,
      userId
    });

    return res.json(result);
  } catch (err: any) {
    console.error('[B2C Topup API Error]', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
});

// 17. Retry B2C Float Top Up
app.post('/api/treasury/b2c-topup/retry', async (req, res) => {
  const { transactionId, confirmationPassword, userId } = req.body;

  if (!transactionId) {
    return res.status(400).json({ error: 'Missing transactionId parameter.' });
  }

  try {
    const { data: trx, error: fetchError } = await supabase
      .from('b2c_account_topups')
      .select('*')
      .eq('id', transactionId)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!trx) {
      return res.status(404).json({ error: 'Transaction not found.' });
    }

    if (trx.status !== 'failed' && trx.status !== 'timeout') {
      return res.status(400).json({ error: `Cannot retry transaction with status: ${trx.status}. Only failed or timed out transactions can be retried.` });
    }

    const result = await initiateB2CTopup({
      destinationShortcode: trx.destination_shortcode,
      amount: Number(trx.amount),
      accountReference: trx.account_reference,
      remarks: trx.remarks,
      requesterPhone: trx.requester_phone,
      confirmationPassword,
      userId: userId || trx.created_by,
      parentTransactionId: trx.id
    });

    return res.json(result);
  } catch (err: any) {
    console.error('[B2C Topup Retry Error]', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
});

// 18. Manual/Query Reconciliation for B2C Float Top Up
app.post('/api/treasury/b2c-topup/reconcile', async (req, res) => {
  const { topupId, action, externalTransactionId, actor } = req.body;

  if (!topupId || !action) {
    return res.status(400).json({ error: 'Missing topupId or action parameter.' });
  }

  try {
    const result = await reconcileB2CTopup(topupId, {
      action,
      externalTransactionId,
      actor
    });

    return res.json(result);
  } catch (err: any) {
    console.error('[B2C Topup Reconcile Error]', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
});

// 19. B2C Webhook Result Callback
app.post('/api/webhooks/b2c-topup/result', async (req, res) => {
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  console.log(`[Webhook B2C Topup Result] Received callback from IP: ${clientIp}, Headers:`, req.headers);

  if (!validateWebhookToken(req)) {
    return res.status(401).json({ error: 'Unauthorized webhook access' });
  }

  try {
    const conversationId = req.body?.Result?.ConversationID;
    let trxId: string | null = null;
    if (conversationId) {
      const { data: trx } = await supabase
        .from('b2c_account_topups')
        .select('id')
        .eq('conversation_id', conversationId)
        .maybeSingle();
      if (trx) trxId = trx.id;
    }

    await logRawPayload(trxId, 'B2C_TOPUP_RESULT_CALLBACK', req.body, 'mpesa_webhook');

    const outcome = await handleB2CTopupResult(req.body, clientIp);
    return res.json({ ResultCode: 0, ResultDesc: 'Success', outcome });
  } catch (err: any) {
    console.error('[Webhook B2C Topup Result Error]', err);
    return res.status(500).json({ error: err.message || 'Internal webhook processing error' });
  }
});

// 20. B2C Webhook Timeout Callback
app.post('/api/webhooks/b2c-topup/timeout', async (req, res) => {
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  console.log(`[Webhook B2C Topup Timeout] Received callback from IP: ${clientIp}`);

  if (!validateWebhookToken(req)) {
    return res.status(401).json({ error: 'Unauthorized webhook access' });
  }

  try {
    const conversationId = req.body?.ConversationID || req.body?.Result?.ConversationID;
    let trxId: string | null = null;
    if (conversationId) {
      const { data: trx } = await supabase
        .from('b2c_account_topups')
        .select('id')
        .eq('conversation_id', conversationId)
        .maybeSingle();
      if (trx) trxId = trx.id;
    }

    await logRawPayload(trxId, 'B2C_TOPUP_TIMEOUT_CALLBACK', req.body, 'mpesa_webhook');

    const outcome = await handleB2CTopupTimeout(req.body, clientIp);
    return res.json({ ResultCode: 0, ResultDesc: 'Success', outcome });
  } catch (err: any) {
    console.error('[Webhook B2C Topup Timeout Error]', err);
    return res.status(500).json({ error: err.message || 'Internal webhook processing error' });
  }
});

// 21. Business to Pochi endpoints
app.post('/api/business-to-pochi', async (req, res) => {
  const { receiverPhone, amount, accountReference, remarks, occasion, requesterPhone, confirmationPassword, userId } = req.body;

  if (!receiverPhone || !amount || !accountReference || !remarks) {
    return res.status(400).json({ error: 'Missing receiverPhone, amount, accountReference, or remarks parameter.' });
  }

  try {
    const result = await initiateBusinessToPochi({
      receiverPhone,
      amount: Number(amount),
      accountReference,
      remarks,
      occasion,
      requesterPhone,
      confirmationPassword,
      userId
    });

    return res.json(result);
  } catch (err: any) {
    console.error('[Pochi Payout API Error]', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
});

app.post('/api/business-to-pochi/retry', async (req, res) => {
  const { transactionId, confirmationPassword, userId } = req.body;

  if (!transactionId) {
    return res.status(400).json({ error: 'Missing transactionId parameter.' });
  }

  try {
    const { data: trx, error: fetchError } = await supabase
      .from('business_to_pochi_transactions')
      .select('*')
      .eq('id', transactionId)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!trx) {
      return res.status(444).json({ error: 'Transaction not found.' });
    }

    if (trx.status !== 'failed' && trx.status !== 'timeout') {
      return res.status(400).json({ error: `Cannot retry transaction with status: ${trx.status}.` });
    }

    const result = await initiateBusinessToPochi({
      receiverPhone: trx.receiver_phone,
      amount: Number(trx.amount),
      accountReference: trx.account_reference,
      remarks: trx.remarks,
      occasion: trx.occasion,
      requesterPhone: trx.requester_phone,
      confirmationPassword,
      userId: userId || trx.created_by,
      parentTransactionId: trx.id
    });

    return res.json(result);
  } catch (err: any) {
    console.error('[Pochi Payout Retry Error]', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
});

app.post('/api/webhooks/business-to-pochi/result', async (req, res) => {
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  console.log(`[Webhook Pochi Result] Received callback from IP: ${clientIp}`);

  if (!validateWebhookToken(req)) {
    return res.status(401).json({ error: 'Unauthorized webhook access' });
  }

  try {
    const conversationId = req.body?.Result?.ConversationID;
    let trxId: string | null = null;
    if (conversationId) {
      const { data: trx } = await supabase
        .from('business_to_pochi_transactions')
        .select('id')
        .eq('conversation_id', conversationId)
        .maybeSingle();
      if (trx) trxId = trx.id;
    }

    await logRawPayload(trxId, 'POCHI_RESULT_CALLBACK', req.body, 'mpesa_webhook');

    const outcome = await handleBusinessToPochiResult(req.body, clientIp);
    return res.json({ ResultCode: 0, ResultDesc: 'Success', outcome });
  } catch (err: any) {
    console.error('[Webhook Pochi Result Error]', err);
    return res.status(500).json({ error: err.message || 'Internal webhook processing error' });
  }
});

app.post('/api/webhooks/business-to-pochi/timeout', async (req, res) => {
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  console.log(`[Webhook Pochi Timeout] Received callback from IP: ${clientIp}`);

  if (!validateWebhookToken(req)) {
    return res.status(401).json({ error: 'Unauthorized webhook access' });
  }

  try {
    const conversationId = req.body?.ConversationID || req.body?.Result?.ConversationID;
    let trxId: string | null = null;
    if (conversationId) {
      const { data: trx } = await supabase
        .from('business_to_pochi_transactions')
        .select('id')
        .eq('conversation_id', conversationId)
        .maybeSingle();
      if (trx) trxId = trx.id;
    }

    await logRawPayload(trxId, 'POCHI_TIMEOUT_CALLBACK', req.body, 'mpesa_webhook');

    const outcome = await handleBusinessToPochiTimeout(req.body, clientIp);
    return res.json({ ResultCode: 0, ResultDesc: 'Success', outcome });
  } catch (err: any) {
    console.error('[Webhook Pochi Timeout Error]', err);
    return res.status(500).json({ error: err.message || 'Internal webhook processing error' });
  }
});

const PORT = 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] Express server running on port ${PORT}`);
});

