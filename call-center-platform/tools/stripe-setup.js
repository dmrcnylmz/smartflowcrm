#!/usr/bin/env node
/**
 * Stripe Product & Price Creation Map
 * 
 * Creates the exact Stripe catalog needed for minute-based pricing.
 * 
 * PRICING RULE: Customer sees ONLY:
 *   - Monthly subscription fee
 *   - Included minutes (in product description)
 *   - Overage price per minute (metered)
 * 
 * Run: STRIPE_SECRET_KEY=sk_test_... node stripe-setup.js
 */

const STRIPE_CATALOG = {
    products: [
        // ─── Subscription Products ───────────────────
        {
            id: 'prod_starter',
            name: 'Starter Plan',
            description: '500 included AI call minutes per month. Perfect for small teams.',
            metadata: {
                plan_name: 'starter',
                included_minutes: '500',
                max_agents: '5',
                max_concurrent_calls: '3'
            },
            prices: [
                {
                    id: 'price_starter_monthly',
                    nickname: 'Starter Monthly',
                    unit_amount: 4900,   // $49.00
                    currency: 'usd',
                    recurring: { interval: 'month' },
                    metadata: { billing_cycle: 'monthly', plan: 'starter' }
                },
                {
                    id: 'price_starter_yearly',
                    nickname: 'Starter Annual (save 20%)',
                    unit_amount: 47000,  // $470.00
                    currency: 'usd',
                    recurring: { interval: 'year' },
                    metadata: { billing_cycle: 'yearly', plan: 'starter' }
                }
            ]
        },
        {
            id: 'prod_pro',
            name: 'Pro Plan',
            description: '2,000 included AI call minutes per month. For growing businesses.',
            metadata: {
                plan_name: 'pro',
                included_minutes: '2000',
                max_agents: '20',
                max_concurrent_calls: '10'
            },
            prices: [
                {
                    id: 'price_pro_monthly',
                    nickname: 'Pro Monthly',
                    unit_amount: 14900,  // $149.00
                    currency: 'usd',
                    recurring: { interval: 'month' },
                    metadata: { billing_cycle: 'monthly', plan: 'pro' }
                },
                {
                    id: 'price_pro_yearly',
                    nickname: 'Pro Annual (save 20%)',
                    unit_amount: 143000, // $1,430.00
                    currency: 'usd',
                    recurring: { interval: 'year' },
                    metadata: { billing_cycle: 'yearly', plan: 'pro' }
                }
            ]
        },
        {
            id: 'prod_enterprise',
            name: 'Enterprise Plan',
            description: '10,000 included AI call minutes per month. For large operations.',
            metadata: {
                plan_name: 'enterprise',
                included_minutes: '10000',
                max_agents: '100',
                max_concurrent_calls: '50'
            },
            prices: [
                {
                    id: 'price_enterprise_monthly',
                    nickname: 'Enterprise Monthly',
                    unit_amount: 49900,  // $499.00
                    currency: 'usd',
                    recurring: { interval: 'month' },
                    metadata: { billing_cycle: 'monthly', plan: 'enterprise' }
                },
                {
                    id: 'price_enterprise_yearly',
                    nickname: 'Enterprise Annual (save 20%)',
                    unit_amount: 479000, // $4,790.00
                    currency: 'usd',
                    recurring: { interval: 'year' },
                    metadata: { billing_cycle: 'yearly', plan: 'enterprise' }
                }
            ]
        },

        // ─── Overage Product (Metered Billing) ───────
        {
            id: 'prod_overage_minutes',
            name: 'Additional AI Call Minutes',
            description: 'Overage minutes beyond your plan inclusion. Billed per minute used.',
            metadata: {
                type: 'overage',
                unit: 'minute',
                // Note: rate varies by plan, managed by our backend
            },
            prices: [
                {
                    id: 'price_overage_starter',
                    nickname: 'Starter Overage (per minute)',
                    currency: 'usd',
                    recurring: {
                        interval: 'month',
                        usage_type: 'metered',  // Stripe metered billing
                        aggregate_usage: 'sum',
                    },
                    unit_amount: 12,     // $0.12 per minute
                    metadata: { plan: 'starter', type: 'overage' }
                },
                {
                    id: 'price_overage_pro',
                    nickname: 'Pro Overage (per minute)',
                    currency: 'usd',
                    recurring: {
                        interval: 'month',
                        usage_type: 'metered',
                        aggregate_usage: 'sum',
                    },
                    unit_amount: 8,      // $0.08 per minute
                    metadata: { plan: 'pro', type: 'overage' }
                },
                {
                    id: 'price_overage_enterprise',
                    nickname: 'Enterprise Overage (per minute)',
                    currency: 'usd',
                    recurring: {
                        interval: 'month',
                        usage_type: 'metered',
                        aggregate_usage: 'sum',
                    },
                    unit_amount: 5,      // $0.05 per minute
                    metadata: { plan: 'enterprise', type: 'overage' }
                }
            ]
        }
    ],

    // ─── Webhook Events to Handle ────────────────────
    webhook_events: [
        'checkout.session.completed',       // New subscription created
        'customer.subscription.created',    // Subscription activated
        'customer.subscription.updated',    // Plan change, status change
        'customer.subscription.deleted',    // Cancellation
        'invoice.paid',                     // Payment successful
        'invoice.payment_failed',           // Payment failed
        'invoice.finalized',               // Invoice ready (includes overage)
        'customer.subscription.trial_will_end', // 3 days before trial ends
    ],

    // ─── Customer Portal Configuration ──────────────
    portal_config: {
        business_profile: {
            headline: 'Manage your AI Call Center subscription',
            privacy_policy_url: 'https://smartflow.ai/privacy',
            terms_of_service_url: 'https://smartflow.ai/terms',
        },
        features: {
            subscription_update: {
                enabled: true,
                default_allowed_updates: ['price', 'quantity'],
                proration_behavior: 'create_prorations',
                products: [
                    { product: 'prod_starter', prices: ['price_starter_monthly', 'price_starter_yearly'] },
                    { product: 'prod_pro', prices: ['price_pro_monthly', 'price_pro_yearly'] },
                    { product: 'prod_enterprise', prices: ['price_enterprise_monthly', 'price_enterprise_yearly'] },
                ]
            },
            subscription_cancel: {
                enabled: true,
                mode: 'at_period_end',
                cancellation_reason: { enabled: true }
            },
            invoice_history: { enabled: true },
            payment_method_update: { enabled: true },
        }
    }
};


// ─── Stripe API Setup Script ────────────────────────

async function setupStripe() {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
        console.log('⚠️  Set STRIPE_SECRET_KEY to create products in Stripe.');
        console.log('   Running in dry-run mode — showing catalog only.\n');
        printCatalog();
        return;
    }

    const stripe = require('stripe')(stripeKey);
    console.log('🔧 Setting up Stripe catalog...\n');

    for (const product of STRIPE_CATALOG.products) {
        try {
            // Create product
            const p = await stripe.products.create({
                name: product.name,
                description: product.description,
                metadata: product.metadata,
            });
            console.log(`✅ Product: ${product.name} → ${p.id}`);

            // Create prices
            for (const price of product.prices) {
                const priceData = {
                    product: p.id,
                    currency: price.currency,
                    nickname: price.nickname,
                    metadata: price.metadata,
                };

                if (price.recurring?.usage_type === 'metered') {
                    // Metered price for overage
                    priceData.recurring = price.recurring;
                    priceData.unit_amount = price.unit_amount;
                } else {
                    // Fixed recurring price
                    priceData.unit_amount = price.unit_amount;
                    priceData.recurring = price.recurring;
                }

                const pr = await stripe.prices.create(priceData);
                console.log(`   💲 Price: ${price.nickname} → ${pr.id}`);
            }
        } catch (err) {
            console.error(`❌ Error: ${product.name}: ${err.message}`);
        }
    }

    // Create customer portal config
    try {
        const portal = await stripe.billingPortal.configurations.create(STRIPE_CATALOG.portal_config);
        console.log(`\n✅ Customer Portal: ${portal.id}`);
    } catch (err) {
        console.log(`⚠️  Portal config: ${err.message}`);
    }

    // Register webhook
    console.log('\n📋 Register these webhook events:');
    STRIPE_CATALOG.webhook_events.forEach(e => console.log(`   • ${e}`));

    console.log('\n✅ Stripe setup complete!');
}

function printCatalog() {
    console.log('📦 STRIPE PRODUCT CATALOG');
    console.log('='.repeat(60));

    for (const product of STRIPE_CATALOG.products) {
        console.log(`\n🏷️  ${product.name}`);
        console.log(`   ${product.description}`);
        console.log(`   Metadata: ${JSON.stringify(product.metadata)}`);
        for (const price of product.prices) {
            const amount = price.unit_amount >= 100
                ? `$${(price.unit_amount / 100).toFixed(2)}`
                : `$${(price.unit_amount / 100).toFixed(2)}`;
            const type = price.recurring?.usage_type === 'metered' ? '(metered)' : `/${price.recurring.interval}`;
            console.log(`   💲 ${price.nickname}: ${amount} ${type}`);
        }
    }

    console.log('\n📋 Webhook Events:');
    STRIPE_CATALOG.webhook_events.forEach(e => console.log(`   • ${e}`));
}


// Run
if (require.main === module) {
    setupStripe().catch(console.error);
}

module.exports = STRIPE_CATALOG;
