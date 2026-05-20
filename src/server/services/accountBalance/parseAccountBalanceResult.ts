export interface ParsedAccountBalanceResult {
  resultCode: string;
  resultDesc: string;
  transactionId?: string;
  accountBalances?: {
    utilityCurrent?: number;
    utilityAvailable?: number;
    workingCurrent?: number;
    workingAvailable?: number;
    chargesCurrent?: number;
    chargesAvailable?: number;
    settlementCurrent?: number;
    settlementAvailable?: number;
  };
  rawBalances?: string;
  rawParams: Record<string, any>;
}

/**
 * Extracts and parses the Account Balance callback parameters from Safaricom.
 */
export function parseAccountBalanceResult(payload: any): ParsedAccountBalanceResult {
  const result = payload?.Result;
  if (!result) {
    throw new Error('Invalid webhook payload structure: Missing Result object.');
  }

  const parsed: ParsedAccountBalanceResult = {
    resultCode: result.ResultCode?.toString() || 'unknown',
    resultDesc: result.ResultDesc || '',
    rawParams: {}
  };

  if (result.TransactionID) {
    parsed.transactionId = result.TransactionID;
  }

  const params = result.ResultParameters?.ResultParameter || [];
  for (const p of params) {
    const name = p.Name || p.Key;
    const val = p.Value;
    if (!name || val === undefined) continue;

    parsed.rawParams[name] = val;

    if (name === 'AccountBalance') {
      parsed.rawBalances = val.toString();
      parsed.accountBalances = parseBalanceString(val.toString());
    }
  }

  return parsed;
}

/**
 * Helper to split and parse the pipe-separated and ampersand-separated Safaricom balance string.
 * Example input:
 * "Utility Account|KES|100000.00|100000.00|0.00|0.00&Working Account|KES|250000.00|250000.00|0.00|0.00"
 */
function parseBalanceString(balanceStr: string) {
  const result: {
    utilityCurrent?: number;
    utilityAvailable?: number;
    workingCurrent?: number;
    workingAvailable?: number;
    chargesCurrent?: number;
    chargesAvailable?: number;
    settlementCurrent?: number;
    settlementAvailable?: number;
  } = {};

  const accounts = balanceStr.split('&');
  for (const acct of accounts) {
    const parts = acct.split('|');
    if (parts.length >= 4) {
      const name = parts[0].trim().toLowerCase();
      const current = parseFloat(parts[2]);
      const available = parseFloat(parts[3]);

      if (name.includes('utility')) {
        result.utilityCurrent = isNaN(current) ? undefined : current;
        result.utilityAvailable = isNaN(available) ? undefined : available;
      } else if (name.includes('working')) {
        result.workingCurrent = isNaN(current) ? undefined : current;
        result.workingAvailable = isNaN(available) ? undefined : available;
      } else if (name.includes('charges')) {
        result.chargesCurrent = isNaN(current) ? undefined : current;
        result.chargesAvailable = isNaN(available) ? undefined : available;
      } else if (name.includes('settlement')) {
        result.settlementCurrent = isNaN(current) ? undefined : current;
        result.settlementAvailable = isNaN(available) ? undefined : available;
      }
    }
  }

  return result;
}
