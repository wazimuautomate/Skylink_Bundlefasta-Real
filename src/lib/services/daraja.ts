import crypto from 'crypto';
import { PRODUCTION_CERTIFICATE, SANDBOX_CERTIFICATE } from './certificates';

interface DarajaConfig {
  consumerKey: string;
  consumerSecret: string;
  shortCode: string;
  passKey: string;
  initiatorName: string;
  initiatorPassword: string;
  certificate: string;
  callbackUrlBase: string;
  isSandbox: boolean;
  stkCallbackUrl: string;
  b2cResultUrl: string;
  b2cTimeoutUrl: string;
  reversalResultUrl: string;
  reversalTimeoutUrl: string;
  balanceResultUrl: string;
  balanceTimeoutUrl: string;
  b2bResultUrl: string;
  b2bTimeoutUrl: string;
}

/**
 * Load the RSA public key certificate for Daraja SecurityCredential encryption.
 *
 * Resolution order:
 *  1. DARAJA_CERTIFICATE env var — set this to override without redeploying.
 *  2. Embedded certificate constant from certificates.ts — the default, works
 *     everywhere (local, Vercel, Docker) with no filesystem dependency.
 */
function loadCertificate(isSandbox: boolean): string {
  // 1. Env var override (useful for rotating certs without redeployment)
  if (process.env.DARAJA_CERTIFICATE) {
    const cert = process.env.DARAJA_CERTIFICATE.trim();
    if (!cert) {
      throw new Error('[Daraja Security] DARAJA_CERTIFICATE env var is set but empty. Provide a valid PEM certificate.');
    }
    console.log('[Daraja Security] Using certificate from DARAJA_CERTIFICATE env var.');
    return cert;
  }

  // 2. Embedded certificate bundled with the source code
  const cert = (isSandbox ? SANDBOX_CERTIFICATE : PRODUCTION_CERTIFICATE).trim();
  if (!cert) {
    throw new Error('[Daraja Security] Embedded certificate constant is empty. Check src/lib/services/certificates.ts.');
  }

  // Best-effort expiry check — logs a warning but does not block execution
  try {
    const x509 = new crypto.X509Certificate(cert);
    const validTo = new Date(x509.validTo);
    if (validTo < new Date()) {
      console.error(
        `[Daraja Security] ⚠️  CRITICAL: The embedded ${isSandbox ? 'Sandbox' : 'Production'} certificate` +
        ` EXPIRED on ${validTo.toISOString()}.` +
        ` SecurityCredential encryption will be rejected by Safaricom.` +
        ` Update PRODUCTION_CERTIFICATE in src/lib/services/certificates.ts` +
        ` or set the DARAJA_CERTIFICATE env var to the new PEM content.`
      );
    } else {
      const daysLeft = Math.floor((validTo.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      if (daysLeft < 30) {
        console.warn(`[Daraja Security] ⚠️  Embedded certificate expires in ${daysLeft} day(s). Renew soon.`);
      }
    }
  } catch {
    // X509Certificate parse failure is non-fatal — proceed with the cert as-is
  }

  console.log(`[Daraja Security] Using embedded ${isSandbox ? 'sandbox' : 'production'} certificate from certificates.ts.`);
  return cert;
}

// Function to encrypt the Initiator Password to obtain the SecurityCredential parameter.
// Uses RSA PKCS#1 v1.5 padding as required by Safaricom Daraja API.
// IMPORTANT: Throws on failure — never falls back to plaintext, which would be silently rejected by Safaricom.
function encryptSecurityCredential(password: string, certificatePem: string): string {
  if (!password) {
    throw new Error('[Daraja Security] Initiator password is empty. Set DARAJA_INITIATOR_PASSWORD.');
  }
  if (!certificatePem) {
    throw new Error(
      '[Daraja Security] No certificate provided for SecurityCredential encryption. ' +
      'Ensure DARAJA_CERTIFICATE env var is set or the certificate file exists in the project root.'
    );
  }

  let formattedCert = certificatePem.trim();
  // Auto-wrap raw base64 content into a proper PEM envelope if needed
  if (!formattedCert.includes('-----BEGIN CERTIFICATE-----') && !formattedCert.includes('-----BEGIN PUBLIC KEY-----')) {
    const cleanCert = formattedCert.replace(/\s+/g, '');
    const chunks = cleanCert.match(/.{1,64}/g) || [];
    formattedCert = `-----BEGIN CERTIFICATE-----\n${chunks.join('\n')}\n-----END CERTIFICATE-----`;
  }

  try {
    const buffer = Buffer.from(password);
    const encrypted = crypto.publicEncrypt(
      {
        key: formattedCert,
        padding: crypto.constants.RSA_PKCS1_PADDING,
      },
      buffer
    );
    return encrypted.toString('base64');
  } catch (error: any) {
    // Do NOT fall back to raw password — Safaricom always rejects unencrypted credentials
    throw new Error(
      `[Daraja Security] RSA encryption of SecurityCredential failed: ${error.message}. ` +
      `Verify the certificate is valid, not expired, and matches the environment (Sandbox vs Production).`
    );
  }
}

// Function to normalize mobile number to 12-digit format (2547XXXXXXXX or 2541XXXXXXXX)
function normalizePesaPhone(input: string): string {
  const value = input.trim().replace(/[^\d+]/g, "");

  if (value.startsWith("+254")) {
    return value.slice(1);
  }
  if (value.startsWith("254")) {
    return value;
  }
  if (value.startsWith("0")) {
    return `254${value.slice(1)}`;
  }
  return value;
}

function sanitizeCallbackUrl(url: string): string {
  if (url.includes('localhost') || url.startsWith('http://localhost')) {
    // Look for NEXT_PUBLIC_APP_URL. If it is NOT localhost, use it!
    if (process.env.NEXT_PUBLIC_APP_URL && !process.env.NEXT_PUBLIC_APP_URL.includes('localhost')) {
      const publicBase = process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
      return url.replace(/http:\/\/localhost:\d+/, publicBase);
    }
    
    // Otherwise, check VERCEL_URL. If set, prepend https://
    if (process.env.VERCEL_URL) {
      const publicBase = `https://${process.env.VERCEL_URL}`.replace(/\/$/, '');
      return url.replace(/http:\/\/localhost:\d+/, publicBase);
    }
    
    // Default fallback
    return url.replace(/http:\/\/localhost:\d+/, 'https://skylink-bundlefasta.vercel.app');
  }
  return url;
}

const getEnvConfig = (): DarajaConfig | null => {
  const consumerKey = process.env.DARAJA_CONSUMER_KEY;
  const consumerSecret = process.env.DARAJA_CONSUMER_SECRET;
  const shortCode = process.env.DARAJA_SHORTCODE;
  const passKey = process.env.DARAJA_PASSKEY;
  const initiatorName = process.env.DARAJA_INITIATOR_NAME;
  const initiatorPassword = process.env.DARAJA_INITIATOR_PASSWORD;
  const callbackUrlBase = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  
  if (!consumerKey || !consumerSecret || !shortCode || !passKey || !initiatorName) {
    return null;
  }

  // If initiatorPassword is not set, return null to trigger mock mode (same as no config)
  // rather than using a dangerous default that would silently fail against Safaricom
  if (!initiatorPassword) {
    console.error('[Daraja] DARAJA_INITIATOR_PASSWORD is not set. Cannot generate SecurityCredential. Falling back to mock mode.');
    return null;
  }

  const isSandbox = (process.env.DARAJA_ENVIRONMENT || process.env.DARAJA_ENV || 'sandbox').trim().toLowerCase() !== 'production';

  // loadCertificate now throws descriptively if cert is missing, empty, or unreadable
  const cert = loadCertificate(isSandbox);

  console.log(`[Daraja] Initialized in ${isSandbox ? 'SANDBOX' : 'PRODUCTION'} mode. ShortCode: ${shortCode}, Initiator: ${initiatorName}`);

  return {
    consumerKey,
    consumerSecret,
    shortCode,
    passKey,
    initiatorName,
    initiatorPassword,
    certificate: cert,
    callbackUrlBase,
    isSandbox,
    stkCallbackUrl: sanitizeCallbackUrl(process.env.DARAJA_CALLBACK_URL || `${callbackUrlBase}/api/daraja/callback/stk`),
    b2cResultUrl: sanitizeCallbackUrl(process.env.DARAJA_B2C_RESULT_URL || `${callbackUrlBase}/api/daraja/callback/b2c`),
    b2cTimeoutUrl: sanitizeCallbackUrl(process.env.DARAJA_B2C_TIMEOUT_URL || `${callbackUrlBase}/api/daraja/callback/b2c-timeout`),
    reversalResultUrl: sanitizeCallbackUrl(process.env.DARAJA_REVERSAL_RESULT_URL || `${callbackUrlBase}/api/daraja/callback/reversal`),
    reversalTimeoutUrl: sanitizeCallbackUrl(process.env.DARAJA_REVERSAL_TIMEOUT_URL || `${callbackUrlBase}/api/daraja/callback/reversal-timeout`),
    balanceResultUrl: sanitizeCallbackUrl(process.env.DARAJA_BALANCE_RESULT_URL || `${callbackUrlBase}/api/daraja/callback/balance`),
    balanceTimeoutUrl: sanitizeCallbackUrl(process.env.DARAJA_BALANCE_TIMEOUT_URL || `${callbackUrlBase}/api/daraja/callback/balance-timeout`),
    b2bResultUrl: sanitizeCallbackUrl(process.env.DARAJA_B2B_RESULT_URL || `${callbackUrlBase}/api/mpesa/b2b/result`),
    b2bTimeoutUrl: sanitizeCallbackUrl(process.env.DARAJA_B2B_TIMEOUT_URL || `${callbackUrlBase}/api/mpesa/b2b/timeout`),
  };
};

// Generates M-Pesa Password parameter for STK
function getMpesaPassword(shortCode: string, passKey: string, timestamp: string): string {
  return Buffer.from(`${shortCode}${passKey}${timestamp}`).toString('base64');
}

// Generates Timestamp parameter: YYYYMMDDHHmmss
function getTimestamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(
    now.getHours()
  )}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

export class DarajaService {
  private static async getOAuthToken(config: DarajaConfig): Promise<string> {
    if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
      return cachedToken.token;
    }

    const baseUrl = config.isSandbox 
      ? 'https://sandbox.safaricom.co.ke' 
      : 'https://api.safaricom.co.ke';
    
    const auth = Buffer.from(`${config.consumerKey}:${config.consumerSecret}`).toString('base64');

    const res = await fetch(`${baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
      headers: {
        Authorization: `Basic ${auth}`,
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to generate Daraja token: ${res.statusText} - ${errText}`);
    }

    const data = await res.json();
    
    if (data.access_token && data.expires_in) {
      cachedToken = {
        token: data.access_token,
        expiresAt: Date.now() + Number(data.expires_in) * 1000,
      };
    }
    
    return data.access_token;
  }

  // --- 1. Initiate STK Push ---
  static async initiateStkPush(params: {
    phoneNumber: string;
    amount: number;
    accountReference: string;
    description: string;
  }) {
    const config = getEnvConfig();
    const timestamp = getTimestamp();

    const formattedPhone = normalizePesaPhone(params.phoneNumber);

    if (!config) {
      // Mock flow for testing
      const merchantRequestId = `MR_${crypto.randomBytes(8).toString('hex')}`;
      const checkoutRequestId = `ws_CO_${crypto.randomBytes(8).toString('hex')}`;
      
      // Simulate background callback from Safaricom after 3 seconds
      this.triggerMockCallback('stk', {
        Body: {
          stkCallback: {
            MerchantRequestID: merchantRequestId,
            CheckoutRequestID: checkoutRequestId,
            ResultCode: 0,
            ResultDesc: 'The service request is processed successfully.',
            CallbackMetadata: {
              Item: [
                { Name: 'Amount', Value: params.amount },
                { Name: 'MpesaReceiptNumber', Value: `NL${crypto.randomBytes(4).toString('hex').toUpperCase()}8D9` },
                { Name: 'TransactionDate', Value: Number(timestamp) },
                { Name: 'PhoneNumber', Value: Number(formattedPhone) }
              ]
            }
          }
        }
      });

      return {
        isMock: true,
        MerchantRequestID: merchantRequestId,
        CheckoutRequestID: checkoutRequestId,
        ResponseCode: '0',
        ResponseDescription: 'Success. Request accepted for processing',
        CustomerMessage: 'Success. Request accepted for processing'
      };
    }

    const token = await this.getOAuthToken(config);
    const baseUrl = config.isSandbox ? 'https://sandbox.safaricom.co.ke' : 'https://api.safaricom.co.ke';
    const password = getMpesaPassword(config.shortCode, config.passKey, timestamp);

    const payload = {
      BusinessShortCode: config.shortCode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: params.amount,
      PartyA: formattedPhone,
      PartyB: config.shortCode,
      PhoneNumber: formattedPhone,
      CallBackURL: config.stkCallbackUrl,
      AccountReference: params.accountReference,
      TransactionDesc: params.description
    };

    const res = await fetch(`${baseUrl}/mpesa/stkpush/v1/processrequest`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Daraja STK Push failed: ${errText}`);
    }

    return await res.json();
  }

  // --- 2. Query STK Status ---
  static async queryStkStatus(checkoutRequestId: string) {
    const config = getEnvConfig();
    const timestamp = getTimestamp();

    if (!config) {
      return {
        isMock: true,
        ResponseCode: '0',
        ResponseDescription: 'The service request has been processed successfully.',
        MerchantRequestID: 'MR_mock_query',
        CheckoutRequestID: checkoutRequestId,
        ResultCode: '0',
        ResultDesc: 'The service request is processed successfully.'
      };
    }

    const token = await this.getOAuthToken(config);
    const baseUrl = config.isSandbox ? 'https://sandbox.safaricom.co.ke' : 'https://api.safaricom.co.ke';
    const password = getMpesaPassword(config.shortCode, config.passKey, timestamp);

    const payload = {
      BusinessShortCode: config.shortCode,
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId
    };

    const res = await fetch(`${baseUrl}/mpesa/stkpushquery/v1/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Daraja STK Query failed: ${errText}`);
    }

    return await res.json();
  }

  // --- 3. B2C Payout ---
  static async initiateB2c(params: {
    phoneNumber: string;
    amount: number;
    remarks: string;
  }) {
    const config = getEnvConfig();
    const formattedPhone = normalizePesaPhone(params.phoneNumber);

    if (!config) {
      const conversationId = `B2C_CON_${crypto.randomBytes(8).toString('hex')}`;
      const originatorConversationId = `B2C_ORI_${crypto.randomBytes(8).toString('hex')}`;

      // Simulate B2C Callback using Key/Value format
      this.triggerMockCallback('b2c', {
        Result: {
          ResultType: 0,
          ResultCode: 0,
          ResultDesc: 'The service request is processed successfully.',
          OriginatorConversationID: originatorConversationId,
          ConversationID: conversationId,
          TransactionID: `OBC${crypto.randomBytes(5).toString('hex').toUpperCase()}`,
          ResultParameters: {
            ResultParameter: [
              { Key: 'TransactionAmount', Value: params.amount },
              { Key: 'ReceiverPartyPublicName', Value: formattedPhone },
              { Key: 'TransactionReceipt', Value: `NL${crypto.randomBytes(4).toString('hex').toUpperCase()}8D9` }
            ]
          }
        }
      });

      return {
        isMock: true,
        ConversationID: conversationId,
        OriginatorConversationID: originatorConversationId,
        ResponseCode: '0',
        ResponseDescription: 'Accept the service request successfully.'
      };
    }

    const token = await this.getOAuthToken(config);
    const baseUrl = config.isSandbox ? 'https://sandbox.safaricom.co.ke' : 'https://api.safaricom.co.ke';

    // encryptSecurityCredential now throws on failure — no silent plaintext fallback
    const securityCredential = encryptSecurityCredential(config.initiatorPassword || '', config.certificate!);

    const originatorConversationId = `B2C_ORI_${crypto.randomBytes(8).toString('hex').toUpperCase()}`;

    const payload = {
      InitiatorName: config.initiatorName,
      SecurityCredential: securityCredential,
      CommandID: process.env.DARAJA_B2C_COMMAND_ID || 'PromotionPayment',
      Amount: params.amount,
      PartyA: config.shortCode,
      PartyB: formattedPhone,
      Remarks: params.remarks,
      QueueTimeOutURL: config.b2cTimeoutUrl,
      ResultURL: config.b2cResultUrl,
      Occasion: 'SkylinkPayout',
      OriginatorConversationID: originatorConversationId
    };

    console.log('[Daraja B2C] Sending B2C Payment request:', JSON.stringify({
      ...payload,
      SecurityCredential: `${securityCredential.substring(0, 20)}...[masked]`,
    }));

    const res = await fetch(`${baseUrl}/mpesa/b2c/v3/paymentrequest`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Daraja B2C Payout failed: ${errText}`);
    }

    const result = await res.json();
    return {
      ...result,
      OriginatorConversationID: result.OriginatorConversationID || originatorConversationId
    };
  }

  // --- 4. Reversal Request ---
  static async requestReversal(params: {
    receiptNumber: string;
    amount: number;
    reason: string;
  }) {
    const config = getEnvConfig();

    if (!config) {
      const conversationId = `REV_CON_${crypto.randomBytes(8).toString('hex')}`;
      
      // Simulate Reversal Callback using Key/Value format
      this.triggerMockCallback('reversal', {
        Result: {
          ResultType: 0,
          ResultCode: 0,
          ResultDesc: 'Reversal Processed Successfully',
          OriginatorConversationID: `REV_ORI_${crypto.randomBytes(8).toString('hex')}`,
          ConversationID: conversationId,
          TransactionID: `REV${crypto.randomBytes(5).toString('hex').toUpperCase()}`,
          ResultParameters: {
            ResultParameter: [
              { Key: 'Amount', Value: params.amount },
              { Key: 'Receipt', Value: params.receiptNumber }
            ]
          }
        }
      });

      return {
        isMock: true,
        ConversationID: conversationId,
        ResponseCode: '0',
        ResponseDescription: 'Accept the service request successfully.'
      };
    }

    const token = await this.getOAuthToken(config);
    const baseUrl = config.isSandbox ? 'https://sandbox.safaricom.co.ke' : 'https://api.safaricom.co.ke';

    // encryptSecurityCredential now throws on failure — no silent plaintext fallback
    const securityCredential = encryptSecurityCredential(config.initiatorPassword || '', config.certificate!);

    const payload = {
      Initiator: config.initiatorName,
      SecurityCredential: securityCredential,
      CommandID: 'TransactionReversal',
      TransactionID: params.receiptNumber,
      Amount: params.amount,
      ReceiverParty: config.shortCode,
      RecieverIdentifierType: '11', // 11 is for shortcode under reversals
      QueueTimeOutURL: config.reversalTimeoutUrl,
      ResultURL: config.reversalResultUrl,
      Remarks: params.reason,
      Occasion: 'SkylinkReversal'
    };

    console.log('[Daraja Reversal] Sending Reversal request:', JSON.stringify({
      ...payload,
      SecurityCredential: `${securityCredential.substring(0, 20)}...[masked]`,
    }));

    const res = await fetch(`${baseUrl}/mpesa/reversal/v1/request`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Daraja Reversal failed: ${errText}`);
    }

    return await res.json();
  }

  // --- 5. Query Account Balance ---
  static async queryAccountBalance() {
    const config = getEnvConfig();

    if (!config) {
      const newMockBalance = 150000 + Math.random() * 20000;
      
      // Trigger async mock callback for balance to populate balance snapshots
      this.triggerMockCallback('balance', {
        Result: {
          ResultType: 0,
          ResultCode: 0,
          ResultDesc: 'The service request is processed successfully',
          OriginatorConversationID: `BAL_ORI_${crypto.randomBytes(8).toString('hex')}`,
          ConversationID: `BAL_CON_${crypto.randomBytes(8).toString('hex')}`,
          TransactionID: `BAL${crypto.randomBytes(5).toString('hex').toUpperCase()}`,
          ResultParameters: {
            ResultParameter: [
              {
                Key: 'AccountBalance',
                Value: `Working Account|KES|${newMockBalance.toFixed(2)}|${newMockBalance.toFixed(2)}|0.00|0.00&Float Account|KES|0.00|0.00|0.00|0.00&Utility Account|KES|${(newMockBalance - 2500).toFixed(2)}|${(newMockBalance - 2500).toFixed(2)}|0.00|0.00`
              },
              {
                Key: 'BOCompletedTime',
                Value: new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14)
              }
            ]
          }
        }
      });

      return {
        isMock: true,
        balance: Number((newMockBalance - 2500).toFixed(2)), // Default to Utility Balance
      };
    }

    const token = await this.getOAuthToken(config);
    const baseUrl = config.isSandbox ? 'https://sandbox.safaricom.co.ke' : 'https://api.safaricom.co.ke';

    // encryptSecurityCredential now throws on failure — no silent plaintext fallback
    const securityCredential = encryptSecurityCredential(config.initiatorPassword || '', config.certificate!);

    const payload = {
      Initiator: config.initiatorName,
      SecurityCredential: securityCredential,
      CommandID: 'AccountBalance',
      PartyA: config.shortCode,
      IdentifierType: '4',
      QueueTimeOutURL: config.balanceTimeoutUrl,
      ResultURL: config.balanceResultUrl,
      Remarks: 'Skylink Balance Check'
    };

    // Log the outgoing payload for debugging (SecurityCredential masked to protect sensitive data)
    console.log('[Daraja Balance] Sending Account Balance request:', JSON.stringify({
      ...payload,
      SecurityCredential: `${securityCredential.substring(0, 20)}...[masked]`,
    }));
    console.log('[Daraja Balance] Environment:', config.isSandbox ? 'SANDBOX' : 'PRODUCTION');
    console.log('[Daraja Balance] API URL:', `${baseUrl}/mpesa/accountbalance/v1/query`);
    console.log('[Daraja Balance] Result URL:', config.balanceResultUrl);
    console.log('[Daraja Balance] Timeout URL:', config.balanceTimeoutUrl);

    const res = await fetch(`${baseUrl}/mpesa/accountbalance/v1/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const responseText = await res.text();
    console.log('[Daraja Balance] Raw API response:', responseText);

    if (!res.ok) {
      throw new Error(`Daraja Balance Query failed (HTTP ${res.status}): ${responseText}`);
    }

    let responseData: any;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      throw new Error(`Daraja Balance Query returned non-JSON response: ${responseText}`);
    }

    // Log Daraja's acceptance/rejection codes immediately
    if (responseData.ResponseCode && responseData.ResponseCode !== '0') {
      console.error('[Daraja Balance] Request REJECTED by Daraja:', responseData);
    } else {
      console.log('[Daraja Balance] Request accepted. ConversationID:', responseData.ConversationID);
    }

    return responseData;
  }

  // --- 6. B2B Settlement Payout ---
  static async initiateB2b(params: {
    destinationType: 'Till' | 'PayBill';
    destinationShortcode: string;
    amount: number;
    accountReference: string;
    remarks: string;
  }) {
    const config = getEnvConfig();

    const commandId = params.destinationType === 'Till' ? 'BusinessBuyGoods' : 'BusinessPayBill';
    const receiverIdentifierType = params.destinationType === 'Till' ? '2' : '4';

    if (!config) {
      const conversationId = `B2B_CON_${crypto.randomBytes(8).toString('hex')}`;
      const originatorConversationId = `B2B_ORI_${crypto.randomBytes(8).toString('hex')}`;

      // Simulate B2B Callback
      this.triggerMockCallback('b2b', {
        Result: {
          ResultType: 0,
          ResultCode: 0,
          ResultDesc: 'The service request is processed successfully.',
          OriginatorConversationID: originatorConversationId,
          ConversationID: conversationId,
          TransactionID: `B2B${crypto.randomBytes(5).toString('hex').toUpperCase()}`,
          ResultParameters: {
            ResultParameter: [
              { Key: 'InitiatorAccountCurrentBalance', Value: 950000 },
              { Key: 'TransactionReceipt', Value: `NL${crypto.randomBytes(4).toString('hex').toUpperCase()}8D9` }
            ]
          }
        }
      });

      return {
        isMock: true,
        ConversationID: conversationId,
        OriginatorConversationID: originatorConversationId,
        ResponseCode: '0',
        ResponseDescription: 'Accept the service request successfully.'
      };
    }

    const token = await this.getOAuthToken(config);
    const baseUrl = config.isSandbox ? 'https://sandbox.safaricom.co.ke' : 'https://api.safaricom.co.ke';

    // encryptSecurityCredential now throws on failure — no silent plaintext fallback
    const securityCredential = encryptSecurityCredential(config.initiatorPassword || '', config.certificate!);

    const payload = {
      Initiator: config.initiatorName,
      SecurityCredential: securityCredential,
      CommandID: commandId,
      SenderIdentifierType: '4', // Shortcode
      RecieverIdentifierType: receiverIdentifierType,
      Amount: params.amount,
      PartyA: config.shortCode,
      PartyB: params.destinationShortcode,
      AccountReference: params.accountReference,
      Remarks: params.remarks,
      QueueTimeOutURL: config.b2bTimeoutUrl,
      ResultURL: config.b2bResultUrl,
    };

    console.log('[Daraja B2B] Sending B2B Payment request:', JSON.stringify({
      ...payload,
      SecurityCredential: `${securityCredential.substring(0, 20)}...[masked]`,
    }));

    const res = await fetch(`${baseUrl}/mpesa/b2b/v1/paymentrequest`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Daraja B2B Payment failed: ${errText}`);
    }

    return await res.json();
  }

  // Helper function to mock asynchronous callbacks from Safaricom locally
  private static triggerMockCallback(type: 'stk' | 'b2c' | 'reversal' | 'balance' | 'b2b', payload: any) {
    setTimeout(async () => {
      try {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const callbackEndpoint = type === 'b2b'
          ? `${appUrl}/api/mpesa/b2b/result`
          : `${appUrl}/api/daraja/callback/${type}`;
        
        await fetch(callbackEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
      } catch (e) {
        console.error(`Mock callback execution for ${type} failed:`, e);
      }
    }, 2000);
  }
}
