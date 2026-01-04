// Web Crypto API adapter (works in Cloudflare Workers and modern browsers/Node.js)

import type { CryptoProvider } from '../interfaces/crypto'

export class WebCryptoProvider implements CryptoProvider {
  async encrypt(plaintext: string, keyHex: string): Promise<string> {
    const keyBytes = hexToBytes(keyHex)
    const key = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    )

    const iv = crypto.getRandomValues(new Uint8Array(12))
    const encoded = new TextEncoder().encode(plaintext)

    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoded
    )

    // Combine IV + ciphertext and encode as base64
    const combined = new Uint8Array(iv.length + ciphertext.byteLength)
    combined.set(iv)
    combined.set(new Uint8Array(ciphertext), iv.length)

    return btoa(String.fromCharCode(...combined))
  }

  async decrypt(ciphertext: string, keyHex: string): Promise<string> {
    const keyBytes = hexToBytes(keyHex)
    const key = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    )

    const combined = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0))
    const iv = combined.slice(0, 12)
    const data = combined.slice(12)

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    )

    return new TextDecoder().decode(decrypted)
  }

  generateToken(): string {
    return crypto.randomUUID()
  }

  generateWebhookSecret(): string {
    return crypto.randomUUID()
  }

  async hmacVerify(payload: string, signature: string, secret: string): Promise<boolean> {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )

    const sig = await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(payload)
    )

    const expected = 'sha256=' + bytesToHex(new Uint8Array(sig))
    return timingSafeEqual(expected, signature)
  }
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}
