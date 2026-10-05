const env = require("../../config/env");
const esewa = require("./esewa.provider");

/**
 * Online payment provider abstraction.
 *
 * WHY this indirection: eSewa's signing rules, redirect envelope and status
 * vocabulary are gateway-specific and will differ from any future provider.
 * Without a registry those rules leak into controllers and route handlers, and
 * adding or replacing a gateway means editing the payment flow itself. Callers
 * depend on this small contract instead:
 *
 *   isConfigured()                              -> boolean
 *   buildTransactionUuid(invoiceNo, { avoid })  -> string  (new value every call)
 *   createPaymentFields({amount, uuid})         -> { endpoint, method, fields }
 *   decodeCallbackData(raw)                     -> { parsed, raw }
 *   verifyResponseSignature(raw)                -> { valid, reason? }
 *   checkStatus(transactionUuid)                -> { reachable, status, reference? }
 *   logGatewayResponse(stage, context, raw)     -> void
 *   mapStatus(gatewayStatus)                    -> internal Payment.status
 *
 * `buildTransactionUuid` is called once per attempt and MUST return a value it has
 * not returned before: gateways treat the uuid as single-use and reject a repeat
 * with "Duplicate transaction UUID." Callers must therefore never cache a uuid and
 * replay it - a retry is a new transaction, not a resumed one.
 *
 * A provider that is not configured or not registered simply is not offered, so
 * "Pay with eSewa" never appears when the server cannot actually take the money.
 */

const PROVIDERS = new Map([[esewa.provider, esewa]]);

/** The gateway a new online payment should use. */
const DEFAULT_PROVIDER = esewa.provider;

const getProvider = (name = DEFAULT_PROVIDER) => {
  const key = String(name || DEFAULT_PROVIDER).toUpperCase();
  const provider = PROVIDERS.get(key);
  if (!provider) {
    const error = new Error(`Payment provider not supported: ${key}`);
    error.statusCode = 400;
    throw error;
  }
  return provider;
};

/** Providers that are registered AND have usable credentials. */
const availableProviders = () =>
  [...PROVIDERS.values()].filter((provider) => provider.isConfigured()).map((provider) => provider.provider);

/**
 * What the client is allowed to know: which gateway is active, whether it is
 * usable, and where it will send the customer back to. Never the secret key, and
 * never a gateway response.
 */
const publicConfig = () => {
  const provider = getProvider();
  return {
    provider: DEFAULT_PROVIDER,
    enabled: provider.isConfigured(),
    // The callback URLs are public by definition - they are embedded in the form
    // the browser submits to the gateway.
    successUrl: env.esewa.successUrl,
    failureUrl: env.esewa.failureUrl,
    label: "eSewa",
  };
};

module.exports = { getProvider, availableProviders, publicConfig, DEFAULT_PROVIDER, PROVIDERS };