'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/context/AuthContext';

const PRICING_TIERS = [
  {
    name: 'Starter',
    hours: 5,
    price: 9.99,
    description: 'Perfect for trying out TextAssistd',
    features: [
      '5 hours of usage',
      'Full AI capabilities',
      'Floating window',
      'Basic support'
    ]
  },
  {
    name: 'Professional',
    hours: 10,
    price: 14.99,
    description: 'Most popular for professionals',
    features: [
      '10 hours of usage',
      'Full AI capabilities',
      'Floating window',
      'Priority support',
      'Advanced features'
    ]
  },
  {
    name: 'Enterprise',
    hours: 20,
    price: 19.99,
    description: 'Best value for power users',
    features: [
      '20 hours of usage',
      'Full AI capabilities',
      'Floating window',
      'Premium support',
      'Advanced features',
      'Extended usage analytics'
    ]
  }
];

export default function PricingPage() {
  const [isLoading, setIsLoading] = useState<number | null>(null);
  const [error, setError] = useState('');
  const { user } = useAuth();

  const handlePayment = async (tierIndex: number, method: 'stripe' | 'paypal') => {
    if (!user) {
      window.location.href = '/login?redirect=/pricing';
      return;
    }

    setIsLoading(tierIndex);
    setError(''); // Clear previous errors

    try {
      const response = await fetch(`/api/payments/${method}/create-${method === 'stripe' ? 'checkout' : 'order'}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          hours: PRICING_TIERS[tierIndex].hours,
          userId: user.id,
          productName: PRICING_TIERS[tierIndex].name,
          amount: PRICING_TIERS[tierIndex].price,
          currency: 'USD', // Or your desired currency
        }),
      });

      if (!response.ok) {
        let errorJson;
        try {
          errorJson = await response.json();
        } catch (e) {
          throw new Error(`Payment initialization failed: ${response.statusText || 'Server error'}`);
        }
        console.error('Payment initialization API error:', errorJson);
        throw new Error(errorJson.message || `Payment initialization failed with status: ${response.status}`);
      }

      const jsonResponse = await response.json();

      if (!jsonResponse.success || !jsonResponse.data) {
        console.error('Payment API did not return success or data:', jsonResponse);
        throw new Error(jsonResponse.message || 'Payment API returned an unsuccessful or malformed response.');
      }

      if (method === 'stripe') {
        if (jsonResponse.data.url && typeof jsonResponse.data.url === 'string') {
          window.location.href = jsonResponse.data.url;
        } else {
          console.error('Stripe checkout URL not found in response:', jsonResponse);
          throw new Error('Failed to retrieve Stripe checkout URL. Please try again.');
        }
      } else if (method === 'paypal') {
        if (jsonResponse.data.links && Array.isArray(jsonResponse.data.links)) {
          const approveLink = jsonResponse.data.links.find((link: { rel: string; href: string }) => link.rel === 'approve');
          if (approveLink && approveLink.href) {
            window.location.href = approveLink.href;
          } else {
            console.error('PayPal approve link not found in response:', jsonResponse);
            throw new Error('Failed to retrieve PayPal approval link. Please try again.');
          }
        } else {
          console.error('PayPal links array not found in response:', jsonResponse);
          throw new Error('Malformed response from PayPal API. Please try again.');
        }
      }
    } catch (err: unknown) {
      let message = 'Failed to initialize payment. Please try again.';
      if (err instanceof Error) {
        message = err.message;
      }
      console.error('handlePayment caught an error:', err);
      setError(message);
    } finally {
      setIsLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="max-w-7xl mx-auto pt-24 px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h1 className="text-4xl font-extrabold text-gray-900 dark:text-white sm:text-5xl sm:tracking-tight lg:text-6xl">
            Simple, Transparent Pricing
          </h1>
          <p className="mt-4 max-w-xl mx-auto text-xl text-gray-500 dark:text-gray-300">
            Choose the perfect plan for your needs. All plans include full access to TextAssistd&apos;s features.
          </p>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="max-w-7xl mx-auto mt-8 px-4">
          <div className="bg-red-50 dark:bg-red-900/50 border border-red-200 dark:border-red-800 rounded-md p-4">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        </div>
      )}

      {/* Pricing Cards */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mt-20 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {PRICING_TIERS.map((tier, index) => (
            <div
              key={tier.name}
              className={`relative rounded-2xl border ${
                index === 1
                  ? 'border-blue-600 dark:border-blue-500'
                  : 'border-gray-200 dark:border-gray-700'
              } bg-white dark:bg-gray-800 p-8 shadow-sm flex flex-col`}
            >
              {index === 1 && (
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                  <span className="inline-flex rounded-full bg-blue-600 px-4 py-1 text-sm font-semibold text-white">
                    Most Popular
                  </span>
                </div>
              )}

              <div className="flex-1">
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white">{tier.name}</h3>
                <p className="mt-4 text-gray-500 dark:text-gray-300">{tier.description}</p>
                <p className="mt-8">
                  <span className="text-4xl font-extrabold text-gray-900 dark:text-white">${tier.price}</span>
                  <span className="text-base font-medium text-gray-500 dark:text-gray-300"> /license</span>
                </p>

                <ul className="mt-8 space-y-4">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-center">
                      <svg
                        className="h-5 w-5 text-green-500"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span className="ml-3 text-gray-600 dark:text-gray-300">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-8 space-y-3">
                <button
                  onClick={() => {
                    if (!user) {
                      window.location.href = `/login?redirect=/pricing`;
                      return;
                    }
                    handlePayment(index, 'stripe'); // Default to Stripe for now
                  }}
                  disabled={isLoading === index}
                  className={`w-full rounded-md py-3 px-6 text-center text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                    index === 1
                      ? 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500'
                      : 'bg-gray-100 text-gray-900 hover:bg-gray-200 focus:ring-gray-500 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {isLoading === index ? (
                    <div className="flex items-center justify-center">
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Processing...
                    </div>
                  ) : (
                    'Purchase'
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* FAQs or additional info */}
      <div className="max-w-7xl mx-auto mt-20 px-4 sm:px-6 lg:px-8 pb-24">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Have questions?
          </h2>
          <p className="mt-4 text-gray-500 dark:text-gray-300">
            Contact our support team at{' '}
            <a href="mailto:support@textassistd.com" className="text-blue-600 hover:text-blue-500 dark:text-blue-400">
              support@textassistd.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}