// Test-only: the card emails sendCardActivityEmails would have sent since the
// last read. `?clear=1` empties the outbox after reading. See card-emails.ts.
export default defineEventHandler((event) => {
  if (!process.env.ALLOW_TEST_ENDPOINTS) {
    throw createError({ statusCode: 404, message: 'Not found' })
  }
  const sent = [...cardEmailTestOutbox]
  if (getQuery(event).clear) cardEmailTestOutbox.length = 0
  return sent
})
