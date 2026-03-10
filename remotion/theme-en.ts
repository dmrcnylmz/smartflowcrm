/**
 * Callception Brand Theme — English Version
 * Shared constants for English Remotion compositions
 */

// Re-export visual constants (same for both languages)
export { COLORS, FONTS, FONT_IMPORT, VIDEO, VIDEO_MOBILE, SCENES, PRICING_SCENES } from './theme';

// English product data
export const FEATURES_EN = [
  {
    icon: '🤖',
    title: 'AI Voice Assistant',
    description: 'Answer calls 24/7 with natural-sounding AI conversations',
  },
  {
    icon: '📅',
    title: 'Auto Scheduling',
    description: 'Automatically create and manage appointments from calls',
  },
  {
    icon: '📋',
    title: 'Complaint Management',
    description: 'Smart categorization and prioritization for faster resolution',
  },
  {
    icon: '📊',
    title: 'Smart Analytics',
    description: 'Real-time performance metrics and actionable insights',
  },
  {
    icon: '🔗',
    title: 'CRM Integration',
    description: 'Seamless integration with your existing business tools',
  },
  {
    icon: '🔒',
    title: 'Enterprise Security',
    description: 'GDPR-compliant data protection and encryption',
  },
] as const;

export const PRICING_PLANS_EN = [
  {
    name: 'Starter',
    price: 49,
    currency: '$',
    period: '/mo',
    features: [
      '500 minutes AI calls',
      '1 AI assistant',
      'Basic analytics',
      'Email support',
    ],
    highlighted: false,
  },
  {
    name: 'Professional',
    price: 149,
    currency: '$',
    period: '/mo',
    features: [
      '2,000 minutes AI calls',
      '5 AI assistants',
      'Advanced analytics',
      'CRM integration',
      'Priority support',
    ],
    highlighted: true,
    badge: 'Most Popular',
  },
  {
    name: 'Enterprise',
    price: 399,
    currency: '$',
    period: '/mo',
    features: [
      'Unlimited AI calls',
      'Unlimited AI assistants',
      'Custom model training',
      'Full API access',
      'Dedicated support',
      'SLA guarantee',
    ],
    highlighted: false,
  },
] as const;

export const STEPS_EN = [
  { number: '01', title: 'Sign Up', description: 'Get started in minutes' },
  { number: '02', title: 'Connect Your Number', description: 'Link your business phone' },
  { number: '03', title: 'Start Answering', description: 'Your AI assistant is ready' },
] as const;

export const STATS_EN = [
  { value: 95, prefix: '', suffix: '%', label: 'Call Answer Rate' },
  { value: 2, prefix: '<', suffix: 's', label: 'Response Time' },
  { value: 24, prefix: '', suffix: '/7', label: 'Always On' },
  { value: 40, prefix: '', suffix: '%', label: 'Cost Savings' },
] as const;
