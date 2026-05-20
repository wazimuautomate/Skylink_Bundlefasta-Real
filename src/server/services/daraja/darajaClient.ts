import { createClient } from '@supabase/supabase-js';
import { AccessTokenResponse, DarajaConfig } from './types';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

let cachedToken: string | null = null;
let tokenExpiryTime: number = 0; // Epoch ms

/**
 * Resolves credentials by prioritizing environment variables.
 * If env keys are dummy or missing, falls back to querying the settings table in Supabase.
 */
export async function resolveConfig(): Promise<DarajaConfig> {
  const envKey = process.env.MPESA_CONSUMER_KEY;
  const envSecret = process.env.MPESA_CONSUMER_SECRET;
  
  const isDummy = !envKey || envKey === 'your-mpesa-consumer-key';
  
  if (!isDummy) {
    return {
      env: (process.env.MPESA_ENV as 'sandbox' | 'production') || 'sandbox',
      consumerKey: envKey!,
      consumerSecret: envSecret!,
      shortCode: process.env.MPESA_SHORTCODE || '174379',
      passkey: process.env.MPESA_PASSKEY || '',
      callbackUrl: process.env.MPESA_CALLBACK_URL || '',
      initiatorName: process.env.MPESA_INITIATOR_NAME || 'api_user',
      securityCredential: process.env.MPESA_SECURITY_CREDENTIAL || 'credential',
      b2cShortCode: process.env.MPESA_B2C_SHORTCODE || process.env.MPESA_SHORTCODE || '174379',
      b2bShortCode: process.env.MPESA_B2B_SHORTCODE || process.env.MPESA_SHORTCODE || '174379'
    };
  }

  // Fallback to Supabase Database
  try {
    const { data, error } = await supabase
      .from('mpesa_credentials')
      .select('*')
      .eq('id', 'c1111111-1111-1111-1111-111111111111')
      .maybeSingle();

    if (!error && data) {
      return {
        env: (data.environment as 'sandbox' | 'production') || 'sandbox',
        consumerKey: data.consumer_key || '',
        consumerSecret: data.consumer_secret || '',
        shortCode: data.paybill_number || '174379',
        passkey: data.passkey || '',
        callbackUrl: data.stk_callback_url || '',
        initiatorName: data.initiator_name || 'api_user',
        securityCredential: data.security_credential || 'credential',
        b2cShortCode: data.b2c_shortcode || data.paybill_number || '174379',
        b2bShortCode: data.b2b_shortcode || data.paybill_number || '174379'
      };
    }
  } catch (dbErr) {
    console.error('[DarajaConfig] Database fallback resolution failed:', dbErr);
  }

  // Final fallback to defaults
  return {
    env: 'sandbox',
    consumerKey: 'your-mpesa-consumer-key',
    consumerSecret: 'your-mpesa-consumer-secret',
    shortCode: '174379',
    passkey: '',
    callbackUrl: '',
    initiatorName: 'api_user',
    securityCredential: 'credential'
  };
}

/**
 * Obtains an OAuth Access Token from Safaricom.
 * Automatically handles caching, token expiry checking, and refreshing.
 */
export async function getAccessToken(config: DarajaConfig): Promise<string> {
  const now = Date.now();
  // If token is cached and has > 60 seconds validity, reuse it
  if (cachedToken && tokenExpiryTime > now + 60000) {
    return cachedToken;
  }

  const credentials = Buffer.from(`${config.consumerKey}:${config.consumerSecret}`).toString('base64');
  const tokenUrl = 'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials';

  console.log(`[DARAJA TOKEN] Refreshing token via ${tokenUrl}`);

  let attempts = 0;
  const maxRetries = 3;
  let lastError: any = null;

  while (attempts < maxRetries) {
    try {
      const response = await fetch(tokenUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errText}`);
      }

      const data = (await response.json()) as AccessTokenResponse;
      cachedToken = data.access_token;
      
      const expiresInSec = Number(data.expires_in) || 3599;
      tokenExpiryTime = Date.now() + (expiresInSec * 1000);

      console.log(`[DARAJA TOKEN] Refresh complete. Token expires in ${expiresInSec}s.`);
      return cachedToken;
    } catch (err: any) {
      attempts++;
      lastError = err;
      console.warn(`[DARAJA TOKEN] Refresh attempt ${attempts} failed: ${err.message}`);
      
      if (attempts < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempts) * 250));
      }
    }
  }

  throw new Error(`Failed to generate Daraja token: ${lastError?.message}`);
}

/**
 * Generic caller function for posting to Daraja endpoints.
 * Handles timeouts, token injection, retries, and masked payload logging.
 */
export async function callDaraja<T>(
  url: string,
  payload: any,
  config: DarajaConfig
): Promise<T> {
  const token = await getAccessToken(config);

  // Mask sensitive fields in log outputs
  const logPayload = { ...payload };
  if (logPayload.SecurityCredential) logPayload.SecurityCredential = '[MASKED]';
  if (logPayload.Password) logPayload.Password = '[MASKED]';

  console.log(`[DARAJA API REQUEST] POST ${url}`, JSON.stringify(logPayload));

  let attempts = 0;
  const maxRetries = 3;
  let lastError: any = null;

  while (attempts < maxRetries) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s Timeout

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const respText = await response.text();
      let respJson: any = null;
      try {
        respJson = JSON.parse(respText);
      } catch {
        // Plaintext response
      }

      console.log(`[DARAJA API RESPONSE] Status ${response.status}`, respJson || respText);

      // Audit API Transaction to DB if necessary
      try {
        await supabase.from('audit_logs').insert({
          action: `DARAJA_API_CALL`,
          entity_type: 'integration',
          new_values: {
            endpoint: url.replace('https://api.safaricom.co.ke', ''),
            statusCode: response.status,
            success: response.ok,
            responseCode: respJson?.ResponseCode || respJson?.ResultCode || null
          }
        });
      } catch (logErr) {
        // Suppress audit log fail to prevent blocking operations
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${respText}`);
      }

      return (respJson || respText) as T;

    } catch (err: any) {
      attempts++;
      lastError = err;
      console.warn(`[DARAJA API WARNING] Request to ${url} failed (attempt ${attempts}): ${err.message}`);
      
      if (attempts < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempts) * 250));
      }
    }
  }

  throw new Error(`Daraja API call to ${url} failed after ${maxRetries} attempts. Last error: ${lastError?.message}`);
}
