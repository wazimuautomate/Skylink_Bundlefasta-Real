'use server';

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { setDashboardPin } from '@/lib/repositories/pin';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

export async function loginAction(formData: { email: string; authPin: string }) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: formData.email,
    password: formData.authPin, // We use the password field for logging in
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

export async function demoLoginAction() {
  const email = 'demo@skylink.com';
  const password = 'password123';
  const defaultPin = '123456';

  const supabase = await createClient();
  const adminSupabase = createAdminClient();

  // Try signing in
  let authRes = await supabase.auth.signInWithPassword({ email, password });

  if (authRes.error) {
    console.log('Demo user does not exist. Creating and seeding...');

    // 1. Sign up demo user
    const signUpRes = await adminSupabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });

    if (signUpRes.error) {
      return { success: false, error: `Failed to create demo user: ${signUpRes.error.message}` };
    }

    const authUserId = signUpRes.data.user?.id;
    if (!authUserId) {
      return { success: false, error: 'User registration failed' };
    }

    // 2. Seed `me` table
    await adminSupabase.from('me').upsert({
      auth_user_id: authUserId,
      email,
      created_at: new Date().toISOString()
    }, { onConflict: 'auth_user_id' });

    // 3. Seed `dashboard_pin` table (set to 123456)
    const salt = await bcrypt.genSalt(10);
    const pinHash = await bcrypt.hash(defaultPin, salt);
    await adminSupabase.from('dashboard_pin').upsert({
      auth_user_id: authUserId,
      pin_hash: pinHash,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'auth_user_id' });

    // 4. Seed `product_sources` table
    const sources = [
      { name: 'Pesatrix', reference: 'PESATRIX' },
      { name: 'BingwaZone', reference: 'BINGWAZONE' },
      { name: 'Poster', reference: 'POSTER' },
      { name: 'Minisite', reference: 'MINISITE' }
    ];

    for (const src of sources) {
      await adminSupabase.from('product_sources').upsert({
        name: src.name,
        reference: src.reference,
        active: true
      }, { onConflict: 'reference' });
    }

    // Resolve source IDs for transactions seeding
    const { data: dbSources } = await adminSupabase.from('product_sources').select('id, reference');
    const sourceMap = (dbSources || []).reduce((acc: any, curr: any) => {
      acc[curr.reference] = curr.id;
      return acc;
    }, {});

    // 5. Seed `balance_snapshots` (starting balance)
    await adminSupabase.from('balance_snapshots').insert([
      { balance: 182450.00, fetched_at: new Date(Date.now() - 3600000 * 24 * 3).toISOString() },
      { balance: 185600.00, fetched_at: new Date(Date.now() - 3600000 * 24 * 2).toISOString() },
      { balance: 191850.50, fetched_at: new Date(Date.now() - 3600000 * 24).toISOString() },
      { balance: 195450.20, fetched_at: new Date().toISOString() }
    ]);

    // 6. Seed `transactions` (Unified ledger)
    const transactionsToSeed = [
      {
        direction: 'IN',
        transaction_type: 'C2B',
        source_id: sourceMap['PESATRIX'],
        account_reference: 'PESATRIX',
        phone_number: '254711223344',
        amount: 4500.00,
        mpesa_receipt: 'LGR4819A21',
        status: 'SUCCESS',
        description: 'C2B paybill payment',
        created_at: new Date(Date.now() - 3600000 * 6).toISOString()
      },
      {
        direction: 'IN',
        transaction_type: 'STK',
        source_id: sourceMap['BINGWAZONE'],
        account_reference: 'BINGWAZONE',
        phone_number: '254722334455',
        amount: 8200.00,
        mpesa_receipt: 'LGR4820B34',
        status: 'SUCCESS',
        description: 'STK payment request',
        created_at: new Date(Date.now() - 3600000 * 4).toISOString()
      },
      {
        direction: 'OUT',
        transaction_type: 'B2C',
        source_id: null,
        account_reference: null,
        phone_number: '254700889900',
        amount: 5000.00,
        mpesa_receipt: 'LGR4821C59',
        status: 'SUCCESS',
        description: 'Vendor utility payout',
        created_at: new Date(Date.now() - 3600000 * 3).toISOString()
      },
      {
        direction: 'IN',
        transaction_type: 'C2B',
        source_id: null, // Unknown reference to verify unknown support
        account_reference: 'UNKNOWN_PRODUCT',
        phone_number: '254744556677',
        amount: 1500.00,
        mpesa_receipt: 'LGR4822D11',
        status: 'SUCCESS',
        description: 'C2B paybill payment',
        created_at: new Date(Date.now() - 3600000 * 2).toISOString()
      },
      {
        direction: 'OUT',
        transaction_type: 'REVERSAL',
        source_id: sourceMap['PESATRIX'],
        account_reference: 'PESATRIX',
        phone_number: '254711223344',
        amount: 4500.00,
        mpesa_receipt: 'REV4823E99',
        status: 'SUCCESS',
        description: 'Reversed payment LGR4819A21',
        created_at: new Date(Date.now() - 3600000).toISOString()
      }
    ];

    for (const tx of transactionsToSeed) {
      await adminSupabase.from('transactions').insert(tx);
    }

    // 7. Seed `audit_logs`
    await adminSupabase.from('audit_logs').insert({
      auth_user_id: authUserId,
      action: 'DEMO_ACCOUNT_INITIALIZED',
      metadata: { email, setupPin: defaultPin }
    });

    // Sign in again now that account exists
    authRes = await supabase.auth.signInWithPassword({ email, password });
  }

  if (authRes.error) {
    return { success: false, error: authRes.error.message };
  }

  return { success: true };
}

export async function resetPasswordAction(email: string) {
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/login`,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}
