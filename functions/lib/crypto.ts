// Token encryption/decryption using AES-256-GCM

function hexToBytes(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  }
  return bytes.buffer
}

export async function encryptToken(token: string, keyHex: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    hexToBytes(keyHex),
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  )

  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(token)

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  )

  // Combine iv + ciphertext and encode as base64
  const combined = new Uint8Array(iv.length + ciphertext.byteLength)
  combined.set(iv)
  combined.set(new Uint8Array(ciphertext), iv.length)

  return btoa(String.fromCharCode(...combined))
}

export async function decryptToken(encrypted: string, keyHex: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    hexToBytes(keyHex),
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  )

  const combined = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0))
  const iv = combined.slice(0, 12)
  const ciphertext = combined.slice(12)

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  )

  return new TextDecoder().decode(decrypted)
}

// HMAC-signed session token functions
// Token format: base64(payload).base64(signature)
// Payload: JSON with session data and expiration

export interface SessionPayload {
  id: string  // Session ID (for lookup/revocation)
  userId: number
  githubId: number
  role: 'admin' | 'premium' | 'user' | 'guest'
  exp: number  // Expiration timestamp (seconds)
}

// Create a signed session token
export async function createSignedSessionToken(
  payload: Omit<SessionPayload, 'exp'>,
  keyHex: string,
  ttlSeconds: number
): Promise<string> {
  const fullPayload: SessionPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  }

  const payloadJson = JSON.stringify(fullPayload)
  const payloadBase64 = btoa(payloadJson)

  const key = await crypto.subtle.importKey(
    'raw',
    hexToBytes(keyHex),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const encoder = new TextEncoder()
  const signatureBytes = await crypto.subtle.sign('HMAC', key, encoder.encode(payloadBase64))
  const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signatureBytes)))

  return `${payloadBase64}.${signatureBase64}`
}

// Verify and decode a signed session token
// Returns the payload if valid, null if invalid or expired
export async function verifySignedSessionToken(
  token: string,
  keyHex: string
): Promise<SessionPayload | null> {
  const parts = token.split('.')
  if (parts.length !== 2) return null

  const [payloadBase64, signatureBase64] = parts

  try {
    // Verify signature
    const key = await crypto.subtle.importKey(
      'raw',
      hexToBytes(keyHex),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    )

    const encoder = new TextEncoder()
    const signatureBytes = Uint8Array.from(atob(signatureBase64), c => c.charCodeAt(0))

    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      signatureBytes,
      encoder.encode(payloadBase64)
    )

    if (!valid) return null

    // Decode payload
    const payloadJson = atob(payloadBase64)
    const payload = JSON.parse(payloadJson) as SessionPayload

    // Check expiration
    const now = Math.floor(Date.now() / 1000)
    if (payload.exp < now) return null

    return payload
  } catch {
    return null
  }
}
