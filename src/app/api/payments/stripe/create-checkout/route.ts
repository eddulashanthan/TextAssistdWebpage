import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabase } from '@/lib/utils/supabase';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-04-30.basil',
});

const PRICE_MAP = {
  5: 999, // $9.99 for 5 hours
  10: 1499, // $14.99 for 10 hours
  20: 1999, // $19.99 for 20 hours
};

export async function POST(request: Request) {
  try {
    const { hours, userId } = await request.json();

    if (!hours || !userId || !PRICE_MAP[hours as keyof typeof PRICE_MAP]) {
      return NextResponse.json(
        { error: 'Invalid hours selected' },
        { status: 400 }
      );
    }

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `TextAssistd ${hours}-Hour License`,
              description: `${hours} hours of TextAssistd usage`,
            },
            unit_amount: PRICE_MAP[hours as keyof typeof PRICE_MAP],
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?success=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pricing?canceled=true`,
      metadata: {
        userId,
        hours,
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Stripe session creation failed:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}