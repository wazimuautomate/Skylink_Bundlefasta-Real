\# M-Pesa Payment Integration Blueprint  
\#\#\# C2B (STK Push) & B2C (Payouts) Developer Integration Guide

This document provides a comprehensive technical blueprint of how \*\*M-Pesa C2B (STK Push)\*\* and \*\*B2C (Business-to-Customer Payouts)\*\* payment processes are implemented in the Pesatrix codebase. This guide is designed to serve as a complete reference for replicating and integrating these payment mechanisms into your other applications.

\---

\#\# 1\. Architectural Overview & Workflow

The integration leverages the Safaricom Daraja API. The architecture is built on top of \*\*Next.js (API routes)\*\*, \*\*Supabase\*\* for database persistence, and robust cryptographic signatures for initiator credentials.

\#\#\# STK Push (C2B) Activation Flow  
\`\`\`mermaid  
sequenceDiagram  
    autonumber  
    actor User as Customer Phone  
    participant App as Next.js Backend  
    participant DB as Supabase Database  
    participant MP as M-Pesa Daraja API

    User-\>\>App: 1\. Request Activation (Phone Number)  
    App-\>\>DB: 2\. Check activation status & Rate Limits  
    App-\>\>DB: 3\. Insert pending record (activation\_payments)  
    App-\>\>MP: 4\. Fetch OAuth Token & POST /stkpush/v1/processrequest  
    MP--\>\>App: 5\. Response (MerchantRequestID, CheckoutRequestID)  
    App-\>\>DB: 6\. Save request IDs onto payment record  
    App--\>\>User: 7\. Prompt shown ("Check your phone")  
    MP-\>\>User: 8\. STK SIM PIN Prompt triggered  
    User-\>\>MP: 9\. User inputs M-Pesa PIN  
    Note over MP,App: Asynchronous Callback (1-15 seconds later)  
    MP-\>\>App: 10\. POST Callback to CallbackURL (ResultCode, Metadata)  
    rect rgb(240, 248, 255\)  
        Note over App: 11\. IP verification & amount/phone/duplicate validation  
    end  
    alt Payment Successful (ResultCode: 0\)  
        App-\>\>DB: 12\. Update payment status \= "paid", save receipt  
        App-\>\>DB: 13\. Update account\_status (is\_activated \= true)  
        App-\>\>DB: 14\. Credit Referrer / Trigger Starter Tasks  
    else Payment Cancelled/Failed (ResultCode \!= 0\)  
        App-\>\>DB: 15\. Update payment status \= "failed"  
    end  
    App--\>\>MP: 16\. Return { ResultCode: 0, ResultDesc: "Accepted" }  
\`\`\`

\#\#\# B2C Withdrawal (Payout) Flow  
\`\`\`mermaid  
sequenceDiagram  
    autonumber  
    actor Admin  
    participant App as Next.js Backend  
    participant DB as Supabase Database  
    participant MP as M-Pesa Daraja API  
    actor User as Customer Phone

    Admin-\>\>App: 1\. Process Payout (Withdrawal ID)  
    App-\>\>DB: 2\. Verify admin credentials & check risk scores  
    App-\>\>DB: 3\. Verify debit transaction is "locked" in wallet  
    App-\>\>DB: 4\. Update withdrawal request to "processing" (DB Lock)  
    App-\>\>MP: 5\. Fetch OAuth Token & POST /mpesa/b2c/v1/paymentrequest  
    MP--\>\>App: 6\. Response (ConversationID, OriginatorConversationID)  
    App-\>\>DB: 7\. Save conversation IDs on withdrawal record  
    Note over MP,App: Asynchronous Callback (5-30 seconds later)  
    alt B2C Success (ResultCode: 0\)  
        MP-\>\>App: 8a. POST Successful Callback (ResultURL)  
        App-\>\>DB: 9a. Update status \= "sent", save MpesaReceipt  
        App-\>\>DB: 10a. Finalize wallet\_transactions debit status \= "available"  
        App--\>\>MP: 11a. Return { ResultCode: 0, ResultDesc: "Accepted" }  
        MP-\>\>User: 12a. SMS Notification (Funds Credited)  
    else B2C Failure (ResultCode \!= 0\)  
        MP-\>\>App: 8b. POST Failed Callback (ResultURL)  
        App-\>\>DB: 9b. Update status \= "failed", save failure reason  
        App-\>\>DB: 10b. Update transaction status \= "reversed" & insert credit refund  
        App--\>\>MP: 11b. Return { ResultCode: 0, ResultDesc: "Accepted" }  
    else B2C Callback Timeout  
        MP-\>\>App: 8c. POST Timeout Callback (QueueTimeOutURL)  
        App-\>\>DB: 9c. Update status \= "failed", failure\_reason \= "Timeout"  
        App-\>\>DB: 10c. Insert wallet reversal credit transaction  
        App--\>\>MP: 11c. Return { ResultCode: 0, ResultDesc: "Accepted" }  
    end  
\`\`\`

\---

\#\# 2\. Database Schema Checklist

To implement this payment system, your database should support the following primary tables.

\#\#\# A. Activation Payments (\`activation\_payments\`)  
Tracks individual STK push initiation attempts and status responses.  
\`\`\`sql  
CREATE TABLE activation\_payments (  
    id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),  
    user\_id UUID NOT NULL REFERENCES auth.users(id),  
    amount NUMERIC NOT NULL,  
    phone VARCHAR(20) NOT NULL,  
    merchant\_request\_id VARCHAR(100),  
    checkout\_request\_id VARCHAR(100) UNIQUE,  
    mpesa\_receipt VARCHAR(100) UNIQUE,  
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'reversed')),  
    callback\_raw JSONB,  
    callback\_validation\_error VARCHAR(100),  
    stk\_initiated\_at TIMESTAMP WITH TIME ZONE,  
    stk\_completed\_at TIMESTAMP WITH TIME ZONE,  
    paid\_at TIMESTAMP WITH TIME ZONE,  
    safaricom\_ip VARCHAR(50),  
    created\_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())  
);  
\`\`\`

\#\#\# B. Withdrawal Requests (\`withdrawal\_requests\`)  
Tracks payout requests initiated by users and processed by admins.  
\`\`\`sql  
CREATE TABLE withdrawal\_requests (  
    id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),  
    user\_id UUID NOT NULL REFERENCES auth.users(id),  
    amount NUMERIC NOT NULL,  
    fee\_ksh NUMERIC DEFAULT 0,  
    amount\_after\_fee NUMERIC NOT NULL,  
    phone VARCHAR(20) NOT NULL,  
    status VARCHAR(20) NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'processing', 'sent', 'failed', 'held')),  
    mpesa\_txn\_id VARCHAR(100) UNIQUE,  
    b2c\_request\_id VARCHAR(100),  
    b2c\_conversation\_id VARCHAR(100) UNIQUE,  
    b2c\_originator\_id VARCHAR(100),  
    b2c\_result\_code VARCHAR(10),  
    b2c\_result\_desc TEXT,  
    b2c\_raw\_callback JSONB,  
    b2c\_initiated\_at TIMESTAMP WITH TIME ZONE,  
    last\_reconciled\_at TIMESTAMP WITH TIME ZONE,  
    processed\_at TIMESTAMP WITH TIME ZONE,  
    failure\_reason TEXT,  
    created\_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())  
);  
\`\`\`

\#\#\# C. Wallet Transactions (\`wallet\_transactions\`)  
Double-entry booking ledger. For withdrawals, funds are "locked" during processing, and either set to "available" (completed debit) or "reversed" (returned credit) upon callback resolution.  
\`\`\`sql  
CREATE TABLE wallet\_transactions (  
    id UUID PRIMARY KEY DEFAULT gen\_random\_uuid(),  
    user\_id UUID NOT NULL REFERENCES auth.users(id),  
    type VARCHAR(50) NOT NULL CHECK (type IN ('task\_earning', 'referral\_bonus', 'activation\_fee', 'deposit', 'withdrawal', 'admin\_adjustment', 'reward', 'reversal')),  
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('credit', 'debit')),  
    amount NUMERIC NOT NULL,  
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'available', 'locked', 'reversed')),  
    bucket VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (bucket IN ('pending', 'available', 'locked')),  
    description TEXT,  
    reference\_table VARCHAR(100),  
    reference\_id VARCHAR(100),  
    available\_at TIMESTAMP WITH TIME ZONE,  
    created\_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())  
);  
\`\`\`

\#\#\# D. Account Activation Status (\`account\_status\`)  
Tracks the global state of the user's account.  
\`\`\`sql  
CREATE TABLE account\_status (  
    user\_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,  
    state VARCHAR(50) DEFAULT 'registered' CHECK (state IN ('registered', 'pending\_activation', 'activated', 'setup\_complete', 'suspended', 'banned')),  
    status VARCHAR(50) DEFAULT 'active',  
    is\_activated BOOLEAN DEFAULT false,  
    activated\_at TIMESTAMP WITH TIME ZONE,  
    setup\_completed\_at TIMESTAMP WITH TIME ZONE,  
    updated\_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())  
);  
\`\`\`

\---

\#\# 3\. Core M-Pesa Client Library

Create a backend helper module (e.g., \`lib/mpesa.ts\` and submodules) to interact with the Safaricom APIs.

\#\#\# A. Environment Configuration & Base URL  
\`\`\`typescript  
function resolveDarajaEnvironment() {  
  const env \= process.env.DARAJA\_ENV?.trim().toLowerCase();  
  if (\!env || env \=== "sandbox" || env \=== "development" || env \=== "test") {  
    return "sandbox" as const;  
  }  
  if (env \=== "production" || env \=== "live") {  
    return "production" as const;  
  }  
  throw new Error(\`Unsupported DARAJA\_ENV: "${process.env.DARAJA\_ENV}"\`);  
}

const DARAJA\_ENVIRONMENT \= resolveDarajaEnvironment();  
const DARAJA\_BASE \=  
  DARAJA\_ENVIRONMENT \=== "production"  
    ? "https://api.safaricom.co.ke"  
    : "https://sandbox.safaricom.co.ke";  
\`\`\`

\#\#\# B. OAuth 2.0 Access Token Retrieval (With In-Memory Caching)  
Safaricom's access tokens expire in 3600 seconds. An in-memory cache cuts down API overhead on high volume loads.  
\`\`\`typescript  
let cachedToken: { token: string; expiresAt: number } | null \= null;

export async function getDarajaToken(): Promise\<string\> {  
  // If token is cached and not expiring within the next 60 seconds, reuse it  
  if (cachedToken && Date.now() \< cachedToken.expiresAt \- 60\_000) {  
    return cachedToken.token;  
  }

  const key \= process.env.DARAJA\_CONSUMER\_KEY;  
  const secret \= process.env.DARAJA\_CONSUMER\_SECRET;  
  if (\!key || \!secret) throw new Error("Missing DARAJA\_CONSUMER\_KEY or DARAJA\_CONSUMER\_SECRET");

  const credentials \= Buffer.from(\`${key}:${secret}\`).toString("base64");

  const response \= await fetch(\`${DARAJA\_BASE}/oauth/v1/generate?grant\_type=client\_credentials\`, {  
    headers: {  
      Authorization: \`Basic ${credentials}\`,  
    },  
    cache: "no-store",  
  });

  const data \= await response.json();  
  if (\!response.ok || \!data.access\_token || \!data.expires\_in) {  
    throw new Error(\`Daraja Authentication failed: ${data.errorMessage || "Unknown error"}\`);  
  }

  cachedToken \= {  
    token: data.access\_token,  
    expiresAt: Date.now() \+ Number.parseInt(data.expires\_in, 10\) \* 1000,  
  };

  return cachedToken.token;  
}  
\`\`\`

\#\#\# C. Security Utility & Credential Generation (B2C SecurityCredential)  
For B2C transactions, Safaricom requires the initiator's API password to be encrypted using the public certificate (\`SandboxCertificate.cer\` or \`ProductionCertificate.cer\`) provided by Safaricom.

Here is the robust utility using \`node-rsa\` (or fallback to standard node \`crypto\` package):  
\`\`\`typescript  
import crypto from "node:crypto";  
import fs from "node:fs";  
import path from "node:path";  
import NodeRSA from "node-rsa";

// Encrypt plain initiator password with Safaricom's certificate  
export function generateSecurityCredential(): string {  
  const password \= process.env.DARAJA\_INITIATOR\_PASSWORD?.trim();  
  let cert \= process.env.DARAJA\_CERTIFICATE?.trim();

  // Fallback to loading local certificate files in project root  
  if (\!cert) {  
    const isProd \= process.env.DARAJA\_ENV?.trim().toLowerCase() \=== "production";  
    const certFilename \= isProd ? "ProductionCertificate.cer" : "SandboxCertificate.cer";  
    const certPath \= path.join(process.cwd(), certFilename);  
      
    try {  
      if (fs.existsSync(certPath)) {  
        cert \= fs.readFileSync(certPath, "utf8");  
      }  
    } catch (err) {  
      console.error(\`\[M-Pesa Security\] Failed to read certificate from path: ${certPath}\`, err);  
    }  
  }

  if (\!password || \!cert) {  
    throw new Error("Missing DARAJA\_INITIATOR\_PASSWORD or Certificate content");  
  }

  // Resilient RSA encryption with NodeRSA  
  const key \= new NodeRSA();  
  try {  
    key.importKey(cert, "pkcs8-public-pem");  
  } catch {  
    key.importKey(cert, "public");  
  }  
    
  key.setOptions({ encryptionScheme: "pkcs1" });  
  return key.encrypt(password, "base64");  
}  
\`\`\`

\#\#\# D. Phone Normalization (Crucial\!)  
M-Pesa requires phone numbers in the standard format \`2547XXXXXXXX\` or \`2541XXXXXXXX\`.  
\`\`\`typescript  
export function normalizePesaPhone(input: string): string {  
  const value \= input.trim().replace(/\[^\\d+\]/g, "");

  if (value.startsWith("+254")) {  
    return value.slice(1);  
  }  
  if (value.startsWith("254")) {  
    return value;  
  }  
  if (value.startsWith("0")) {  
    return \`254${value.slice(1)}\`;  
  }  
  return value;  
}  
\`\`\`

\---

\#\# 4\. STK Push (C2B) Core Implementation

\#\#\# A. Initiation API Endpoint (\`/api/payments/activation/stk-push\`)  
This route initiates the push request. It secures the flow by checking for pre-existing activations, pending requests, rate-limiting, and locking the state in the database before querying Safaricom.

\`\`\`typescript  
// src/app/api/payments/activation/stk-push/route.ts  
import { NextResponse } from "next/server";  
import { getDarajaToken, normalizePesaPhone, DARAJA\_BASE } from "@/lib/mpesa";  
import { generateTimestamp, generateStkPassword } from "@/lib/mpesa/security";

export async function POST(request: Request) {  
  try {  
    const { phone } \= await request.json();  
    const normalizedPhone \= normalizePesaPhone(phone);

    // \[INSERT YOUR USER AUTHENTICATION & DUPLICATE PENDING CHECK HERE\]

    // 1\. Log pending transaction in DB first  
    // Save to database table \`activation\_payments\` (status: 'pending')

    // 2\. Fetch Token & Compile Payload  
    const token \= await getDarajaToken();  
    const timestamp \= generateTimestamp(); // YYYYMMDDHHmmss string  
    const shortcode \= process.env.DARAJA\_SHORTCODE\!;  
    const passkey \= process.env.DARAJA\_PASSKEY\!;  
      
    // Password formula: Base64(Shortcode \+ Passkey \+ Timestamp)  
    const password \= Buffer.from(\`${shortcode}${passkey}${timestamp}\`).toString("base64");

    const payload \= {  
      BusinessShortCode: shortcode,  
      Password: password,  
      Timestamp: timestamp,  
      TransactionType: "CustomerPayBillOnline",  
      Amount: Number(process.env.ACTIVATION\_FEE\_KSH || 200),  
      PartyA: normalizedPhone,  
      PartyB: shortcode,  
      PhoneNumber: normalizedPhone,  
      CallBackURL: process.env.DARAJA\_CALLBACK\_URL\!,  
      AccountReference: "SiteActivation",  
      TransactionDesc: "Registration Fee Payment",  
    };

    // 3\. POST to Daraja STK Push Endpoint  
    const response \= await fetch(\`${DARAJA\_BASE}/mpesa/stkpush/v1/processrequest\`, {  
      method: "POST",  
      headers: {  
        Authorization: \`Bearer ${token}\`,  
        "Content-Type": "application/json",  
      },  
      body: JSON.stringify(payload),  
    });

    const data \= await response.json();

    if (\!response.ok || data.ResponseCode \!== "0") {  
      throw new Error(data.ResponseDescription || "STK Initiation Rejected");  
    }

    // 4\. Update the DB Payment record with checkout IDs  
    // Save data.CheckoutRequestID and data.MerchantRequestID for callback mapping

    return NextResponse.json({  
      success: true,  
      message: "Prompt sent successfully",  
      checkoutRequestId: data.CheckoutRequestID,  
    });  
  } catch (error: any) {  
    console.error("STK Push error:", error);  
    return NextResponse.json({ error: error.message }, { status: 500 });  
  }  
}  
\`\`\`

\#\#\# B. Callback API Endpoint (\`/api/payments/mpesa/callback\`)  
This URL is called asynchronously by Safaricom when the user enters (or fails to enter) their M-Pesa PIN.

\> \[\!IMPORTANT\]  
\> \*\*Production Callback Security Checklist:\*\*  
\> 1\. \*\*IP Whitelisting\*\*: Ensure requests come ONLY from Safaricom API Gateways.  
\> 2\. \*\*Receipt Deduplication\*\*: Guarantee the same \`MpesaReceiptNumber\` isn't processed twice.  
\> 3\. \*\*Amount Check\*\*: Verify the paid amount matches your DB expectations.  
\> 4\. \*\*Phone Matching\*\*: Ensure the phone number in the callback metadata matches the record.

\`\`\`typescript  
// src/app/api/payments/mpesa/callback/route.ts  
import { NextResponse } from "next/server";  
import { extractIP, validateSafaricomIP, parseStkCallbackMetadata } from "@/lib/mpesa/security";

const ACCEPTED\_RESPONSE \= NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });

export async function POST(request: Request) {  
  // 1\. IP Validation  
  const ip \= extractIP(request);  
  if (\!validateSafaricomIP(ip)) {  
    console.error("\[M-Pesa Callback\] Unauthorized Caller IP:", ip);  
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });  
  }

  try {  
    const payload \= await request.json();  
    const stk \= payload?.Body?.stkCallback;  
    const checkoutRequestId \= stk?.CheckoutRequestID;

    if (\!stk || \!checkoutRequestId) {  
      return ACCEPTED\_RESPONSE; // Always return 200/0 code to stop Daraja retries  
    }

    // 2\. Fetch the pending payment record from the database  
    // SELECT \* FROM activation\_payments WHERE checkout\_request\_id \= checkoutRequestId

    const resultCode \= Number(stk.ResultCode ?? \-1);  
      
    // User cancelled or transaction failed  
    if (resultCode \!== 0\) {  
      // Update payment status \= "failed" in your database  
      return ACCEPTED\_RESPONSE;  
    }

    // 3\. Process Success Metadata  
    // parseStkCallbackMetadata parses stk.CallbackMetadata.Item array into structural key-values  
    const metadata \= parseStkCallbackMetadata(stk.CallbackMetadata?.Item);  
      
    // 4\. Strict Validations  
    // a. Check Amount: metadata.amount \=== paymentRecord.amount  
    // b. Check Phone: metadata.phoneNumber \=== paymentRecord.phone  
    // c. Check Deduplication: SELECT id FROM activation\_payments WHERE mpesa\_receipt \= metadata.mpesaReceipt  
      
    if (/\* Validation Fails \*/ false) {  
      // Mark payment status \= "failed" with validation\_error reason  
      return ACCEPTED\_RESPONSE;  
    }

    // 5\. Commit Payment Success  
    // UPDATE activation\_payments SET status \= 'paid', mpesa\_receipt \= metadata.mpesaReceipt, paid\_at \= NOW()  
      
    // 6\. Fulfill Activation Logic  
    // UPDATE account\_status SET is\_activated \= true, state \= 'activated' WHERE user\_id \= payment.user\_id  
    // \[CREDIT REFERRAL BONUSES / TRIGGER WELCOME TASKS HERE\]

    return ACCEPTED\_RESPONSE;  
  } catch (error) {  
    console.error("\[Callback Handler Exception\]:", error);  
    return ACCEPTED\_RESPONSE; // Safely return accepted to avoid Daraja queue flood  
  }  
}  
\`\`\`

\---

\#\# 5\. B2C Payout (Withdrawal) Core Implementation

B2C represents payouts (e.g. paying salary, commissions, or user rewards) from your corporate Utility/Working Account to the customer's mobile wallet.

\#\#\# A. Request Processing Function  
Triggered when an admin manually approves a withdrawal or an automated trigger verifies security risk scores.

\`\`\`typescript  
// src/lib/mpesa/payouts.ts  
import { getDarajaToken, generateSecurityCredential, DARAJA\_BASE, normalizePesaPhone } from "@/lib/mpesa";

export async function processWithdrawalPayout(withdrawalId: string) {  
  // 1\. Fetch withdrawal request & verify status is 'requested'  
  // 2\. Lock the transaction: UPDATE withdrawal\_requests SET status \= 'processing'  
  //    This step is CRUCIAL to prevent double-submission race conditions.  
    
  try {  
    const token \= await getDarajaToken();  
    const securityCredential \= generateSecurityCredential();

    const payload \= {  
      InitiatorName: process.env.DARAJA\_INITIATOR\_NAME\!,  
      SecurityCredential: securityCredential,  
      CommandID: "SalaryPayment", // SalaryPayment or BusinessPayment  
      Amount: String(100), // Payout amount (must be integer string representation)  
      PartyA: process.env.DARAJA\_SHORTCODE\!, // Your B2C shortcode  
      PartyB: normalizePesaPhone("0712345678"), // Target Customer Phone  
      Remarks: \`Withdrawal ID ${withdrawalId}\`,  
      QueueTimeOutURL: process.env.DARAJA\_B2C\_TIMEOUT\_URL\!,  
      ResultURL: process.env.DARAJA\_B2C\_RESULT\_URL\!,  
      Occasion: withdrawalId, // We map withdrawalId to Occasion so we can reconcile it in callback  
    };

    const response \= await fetch(\`${DARAJA\_BASE}/mpesa/b2c/v1/paymentrequest\`, {  
      method: "POST",  
      headers: {  
        Authorization: \`Bearer ${token}\`,  
        "Content-Type": "application/json",  
      },  
      body: JSON.stringify(payload),  
    });

    const data \= await response.json();

    if (\!response.ok || data.ResponseCode \!== "0") {  
      throw new Error(data.ResponseDescription || "Daraja Payout Rejected");  
    }

    // 3\. Persist the identifiers for callback matching  
    // UPDATE withdrawal\_requests SET   
    //    b2c\_conversation\_id \= data.ConversationID,  
    //    b2c\_originator\_id \= data.OriginatorConversationID  
    // WHERE id \= withdrawalId

    return {  
      success: true,  
      conversationId: data.ConversationID,  
      originatorConversationId: data.OriginatorConversationID,  
    };  
  } catch (error: any) {  
    // 4\. Rollback Lock on failure  
    // UPDATE withdrawal\_requests SET status \= 'failed', failure\_reason \= error.message  
    // REVERSE the user's locked debit in wallet\_transactions  
    console.error("B2C payout failed to initiate:", error);  
    throw error;  
  }  
}  
\`\`\`

\#\#\# B. Result Callback Endpoint (\`/api/payments/b2c/result\`)  
This callback is sent to \`DARAJA\_B2C\_RESULT\_URL\` after Safaricom successfully processes the payout or rejects the transfer.

\`\`\`typescript  
// src/app/api/payments/b2c/result/route.ts  
import { NextResponse } from "next/server";  
import { validateSafaricomIP, extractIP } from "@/lib/mpesa/security";

const ACCEPTED\_RESPONSE \= NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });

export async function POST(request: Request) {  
  const ip \= extractIP(request);  
  if (\!validateSafaricomIP(ip)) {  
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });  
  }

  try {  
    const body \= await request.json();  
    const result \= body?.Result;  
    const withdrawalId \= result?.Occasion; // Retreive our mapped ID

    if (\!result || \!withdrawalId) {  
      return ACCEPTED\_RESPONSE;  
    }

    // 1\. Fetch withdrawal request: status must be "processing"  
      
    const resultCode \= Number(result.ResultCode ?? \-1);  
    const resultDesc \= result.ResultDesc || "";  
    const mpesaReceipt \= result.TransactionID; // Safaricom receipt number

    const now \= new Date().toISOString();

    if (resultCode \=== 0\) {  
      // 2\. PAYOUT SUCCESS FLOW:  
      // a. UPDATE withdrawal\_requests SET status \= 'sent', mpesa\_txn\_id \= mpesaReceipt  
      // b. UPDATE wallet\_transactions SET status \= 'available', bucket \= 'available' (Unlocks the debit)  
      console.log(\`\[Payout Success\] Withdrawal ${withdrawalId} completed.\`);  
    } else {  
      // 3\. PAYOUT FAILURE FLOW (e.g. Account not found, Insufficient balance):  
      // a. UPDATE withdrawal\_requests SET status \= 'failed', failure\_reason \= resultDesc  
      // b. REVERSE the debit in wallet: UPDATE wallet\_transactions SET status \= 'reversed', bucket \= 'locked'  
      // c. INSERT wallet\_transactions credit refund transaction to restore user balance  
      console.error(\`\[Payout Failed\] Withdrawal ${withdrawalId} failed with code ${resultCode}: ${resultDesc}\`);  
    }

    return ACCEPTED\_RESPONSE;  
  } catch (error) {  
    console.error("B2C result processing exception:", error);  
    return ACCEPTED\_RESPONSE;  
  }  
}  
\`\`\`

\#\#\# C. Timeout Callback Endpoint (\`/api/payments/b2c/timeout\`)  
Called if the transaction remains queued in the Safaricom queue for too long and times out without response.

\`\`\`typescript  
// src/app/api/payments/b2c/timeout/route.ts  
import { NextResponse } from "next/server";

export async function POST(request: Request) {  
  try {  
    const body \= await request.json();  
    const originatorId \= body?.Result?.OriginatorConversationID;

    // 1\. Find withdrawal WHERE b2c\_originator\_id \= originatorId  
    // 2\. Mark status \= 'failed', failure\_reason \= 'M-Pesa timeout — request expired in queue'  
    // 3\. Rollback the debit: Insert credit transaction to restore user wallet balance  
      
    return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });  
  } catch (error) {  
    console.error("B2C timeout exception:", error);  
    return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });  
  }  
}  
\`\`\`

\---

\#\# 6\. Reconciliation & Stuck Recovery (Cron Tasks)

In case a callback request gets dropped by internet issues or cloud outages, you must have an automated cleanup task to audit and reconcile stuck transactions. 

Run a scheduled serverless function (Cron) at regular intervals (e.g., every 15-30 minutes):

\`\`\`typescript  
// Run via GET route with a secure API Header token: x-cron-secret  
export async function reconcileStuckTransactions() {  
  const thresholdIso \= new Date(Date.now() \- 30 \* 60 \* 1000).toISOString(); // 30 minutes ago  
    
  // 1\. RECONCILE C2B (STK Push)  
  // Find all activation\_payments where status \= 'pending' AND created\_at \< threshold  
  // UPDATE status \= 'failed', callback\_validation\_error \= 'reconciliation\_timeout'  
    
  // 2\. RECONCILE B2C (Payouts)  
  // Find all withdrawal\_requests where status \= 'processing' AND b2c\_initiated\_at \< threshold  
  // UPDATE status \= 'held' (so administrators can review why Safaricom didn't return a callback)  
}  
\`\`\`

\---

\#\# 7\. Environment Variables Integration Checklist

Ensure the target website environment (.env) contains these accurately configured variables:

| Variable Name | Sandbox Value Example | Production / Live Setup | Purpose |  
| :--- | :--- | :--- | :--- |  
| \`DARAJA\_ENV\` | \`sandbox\` | \`production\` | Switches API base URLs & whitelist validation |  
| \`DARAJA\_CONSUMER\_KEY\` | \`qG...yA\` | \*Production Key\* | Safaricom Client Credentials Key |  
| \`DARAJA\_CONSUMER\_SECRET\` | \`zP...r8\` | \*Production Secret\* | Safaricom Client Credentials Secret |  
| \`DARAJA\_SHORTCODE\` | \`174379\` | \*Your Till/Paybill\* | Shortcode used for STK Push and B2C Payouts |  
| \`DARAJA\_PASSKEY\` | \`bfb2d...\` | \*Production Passkey\* | Required to compute STK Password |  
| \`DARAJA\_INITIATOR\_NAME\` | \`testapi\` | \*B2C Operator Username\*| User allowed to initiate payouts |  
| \`DARAJA\_INITIATOR\_PASSWORD\` | \`Plain\_password\` | \*Operator Password\* | Initiator password (encrypted dynamically) |  
| \`DARAJA\_CERTIFICATE\` | \*Content of certificate\* | \*Live Cert\* | RSA Public key used for B2C encryption |  
| \`DARAJA\_CALLBACK\_URL\`| \`https://my-app.com/api/payments/mpesa/callback\` | Webhook URL for STK push async results |  
| \`DARAJA\_B2C\_RESULT\_URL\`| \`https://my-app.com/api/mpesa/b2c/result\` | Webhook URL for successful B2C payouts |  
| \`DARAJA\_B2C\_TIMEOUT\_URL\`| \`https://my-app.com/api/mpesa/b2c/timeout\` | Webhook URL for queued B2C timeouts |  
| \`SAFARICOM\_IP\_WHITELIST\`| \*Empty or optional\* | \`196.201.212.74, ...\` | Enhances callback IP access security |

\---

\#\# 8\. Best Practices for Replication

1\. \*\*Strict Callback Authentication\*\*: Do not skip the Safaricom IP validation checking in production. This blocks malicious actors from invoking your callback URL with mock success payloads.  
2\. \*\*Double Entry Logging\*\*: Always preserve the raw callback JSON (\`callback\_raw\` / \`b2c\_raw\_callback\`) in the database. This allows manual reconciliation in case you need to verify or audit a transaction with Safaricom.  
3\. \*\*Fail-Safe Processing\*\*: For withdrawals, change the status of withdrawal requests to \`processing\` \*before\* hitting the Daraja API. This ensures that even if the API query hangs, the user cannot trigger a concurrent request.

