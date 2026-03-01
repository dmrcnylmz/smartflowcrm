// ESLint flat config (v9) for SmartFlow CRM
// Uses only built-in ESLint rules — no external plugins required.
export default [
  {
    rules: {
      // Warn on unused variables to keep code clean
      'no-unused-vars': 'warn',

      // Allow console.warn and console.error but flag console.log
      'no-console': ['warn', { allow: ['warn', 'error'] }],

      // Enforce const for variables that are never reassigned
      'prefer-const': 'error',

      // Disallow var — use let or const instead
      'no-var': 'error',

      // Require strict equality, but allow safe type coercion patterns
      eqeqeq: ['error', 'smart'],

      // Require curly braces for multi-line blocks
      curly: ['error', 'multi-line'],

      // Disallow throwing literals — always throw Error objects
      'no-throw-literal': 'error',
    },
  },
];
