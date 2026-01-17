// POST /api/auth/mobile/challenge - Generate a challenge nonce for App Attest
//
// This endpoint provides a cryptographically random challenge that the iOS app
// uses when attesting its key with Apple. The challenge prevents replay attacks.
//
// The challenge is stored in KV with a short TTL (5 minutes) and can only be
// used once.

interface Env {
  SESSIONS: KVNamespace
}

interface ChallengeResponse {
  challenge: string  // Base64-encoded random bytes
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { env } = context

  try {
    // Generate a cryptographically random 32-byte challenge
    const challengeBytes = crypto.getRandomValues(new Uint8Array(32))
    const challengeBase64 = btoa(String.fromCharCode(...challengeBytes))

    // Create a unique ID for this challenge
    const challengeId = crypto.randomUUID()

    // Store the challenge in KV with 5-minute TTL
    // We'll verify this when the attestation comes back
    await env.SESSIONS.put(
      `attest_challenge:${challengeId}`,
      challengeBase64,
      { expirationTtl: 300 }  // 5 minutes
    )

    // Return both the challenge and its ID
    // The client will send both back with the attestation
    const response: ChallengeResponse & { challengeId: string } = {
      challenge: challengeBase64,
      challengeId,
    }

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  } catch (err) {
    console.error('Challenge generation error:', err)
    return new Response(
      JSON.stringify({ error: 'Failed to generate challenge' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
