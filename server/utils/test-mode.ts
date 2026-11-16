/**
 * Whether the integration suite's test endpoints are on: token-revealing helpers
 * under `/api/_test`, no rate limiting, captured instead of sent card emails.
 *
 * Exactly `'1'`, never truthiness: `ALLOW_TEST_ENDPOINTS=false` or `=0` is a
 * non-empty string, so an operator writing either to switch it *off* switched it
 * on, exposing every verification and reset token to anyone who asked.
 */
export function testEndpointsEnabled(): boolean {
  return process.env.ALLOW_TEST_ENDPOINTS === '1'
}

/** 404 unless the test endpoints are on, so a production server hides them entirely. */
export function requireTestEndpoints() {
  if (!testEndpointsEnabled()) {
    throw createError({ statusCode: 404, message: 'Not found' })
  }
}
