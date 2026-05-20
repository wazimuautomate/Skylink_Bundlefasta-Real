export interface ParsedPochiResult {
  resultCode: string;
  resultDesc: string;
  transactionId?: string;
  amount?: number;
  receiverPartyName?: string;
  transactionCompletedAt?: Date;
  debitAccountBalance?: string;
  debitPartyBalance?: string;
  initiatorBalance?: string;
}

/**
 * Extracts Business to Pochi B2C transaction parameters from Callback structures.
 */
export function parseBusinessToPochiResult(payload: any): ParsedPochiResult {
  const result = payload?.Result;
  if (!result) {
    throw new Error('Invalid webhook payload structure: Missing Result object.');
  }

  const parsed: ParsedPochiResult = {
    resultCode: result.ResultCode?.toString() || 'unknown',
    resultDesc: result.ResultDesc || ''
  };

  if (result.TransactionID) {
    parsed.transactionId = result.TransactionID;
  }

  const params = result.ResultParameters?.ResultParameter || [];
  for (const p of params) {
    const name = p.Name;
    const val = p.Value;
    if (!name || val === undefined) continue;

    switch (name) {
      case 'DebitAccountBalance':
        parsed.debitAccountBalance = val.toString();
        break;
      case 'DebitPartyBalance':
        parsed.debitPartyBalance = val.toString();
        break;
      case 'InitiatorBalance':
        parsed.initiatorBalance = val.toString();
        break;
      case 'Amount':
        parsed.amount = Number(val);
        break;
      case 'ReceiverPartyPublicName':
        parsed.receiverPartyName = val.toString();
        break;
      case 'TransactionCompletedDateTime':
        try {
          let dateStr = val.toString();
          if (dateStr.includes('.') && dateStr.length === 19) {
            const parts = dateStr.split(' ');
            const dateParts = parts[0].split('.');
            dateStr = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]} ${parts[1]}`;
          }
          parsed.transactionCompletedAt = new Date(dateStr);
        } catch {
          parsed.transactionCompletedAt = new Date();
        }
        break;
    }
  }

  return parsed;
}
