import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import Stripe from 'stripe';
import { supabase } from '@/lib/utils/supabase';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-04-30.basil',
});

export async function POST(request: Request) {
  const body = await request.text();
  const headersList = await headers();
  const signature = headersList.get('stripe-signature');

  if (!signature) {
    return NextResponse.json(
      { error: 'Missing stripe-signature header' },
      { status: 400 }
    );
  }

  try {
    const event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const { userId, hours } = session.metadata!;

      // Create license using the Supabase function
      const { data: licenseData, error: licenseError } = await supabase.rpc(
        'create_license',
        {
          user_id: userId,
          hours: parseInt(hours),
          transaction_id: session.payment_intent as string,
          payment_gateway: 'stripe',
          amount: session.amount_total! / 100,
          currency: session.currency
        }
      );

      if (licenseError) {
        console.error('License creation failed:', licenseError);
        return NextResponse.json(
          { error: 'Failed to create license' },
          { status: 500 }
        );
      }

      return NextResponse.json(licenseData);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 400 }
    );
  }
}