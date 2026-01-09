import { describe, it, expect } from 'vitest'
import { WebCryptoProvider } from './web-crypto'

describe('WebCryptoProvider', () => {
  const provider = new WebCryptoProvider()
  // 256-bit key (64 hex chars)
  const testKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

  describe('encrypt/decrypt', () => {
    it('round-trips plaintext through encryption', async () => {
      const plaintext = 'Hello, World!'

      const encrypted = await provider.encrypt(plaintext, testKey)
      const decrypted = await provider.decrypt(encrypted, testKey)

      expect(decrypted).toBe(plaintext)
    })

    it('handles empty string', async () => {
      const plaintext = ''

      const encrypted = await provider.encrypt(plaintext, testKey)
      const decrypted = await provider.decrypt(encrypted, testKey)

      expect(decrypted).toBe(plaintext)
    })

    it('handles unicode characters', async () => {
      const plaintext = '🔐 Secret with émojis and accénts'

      const encrypted = await provider.encrypt(plaintext, testKey)
      const decrypted = await provider.decrypt(encrypted, testKey)

      expect(decrypted).toBe(plaintext)
    })

    it('handles long text', async () => {
      const plaintext = 'A'.repeat(10000)

      const encrypted = await provider.encrypt(plaintext, testKey)
      const decrypted = await provider.decrypt(encrypted, testKey)

      expect(decrypted).toBe(plaintext)
    })

    it('produces different ciphertext for same plaintext (random IV)', async () => {
      const plaintext = 'Test message'

      const encrypted1 = await provider.encrypt(plaintext, testKey)
      const encrypted2 = await provider.encrypt(plaintext, testKey)

      expect(encrypted1).not.toBe(encrypted2)

      // But both decrypt to same value
      const decrypted1 = await provider.decrypt(encrypted1, testKey)
      const decrypted2 = await provider.decrypt(encrypted2, testKey)
      expect(decrypted1).toBe(plaintext)
      expect(decrypted2).toBe(plaintext)
    })

    it('fails to decrypt with wrong key', async () => {
      const plaintext = 'Secret data'
      const wrongKey = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210'

      const encrypted = await provider.encrypt(plaintext, testKey)

      await expect(provider.decrypt(encrypted, wrongKey)).rejects.toThrow()
    })

    it('fails to decrypt tampered ciphertext', async () => {
      const plaintext = 'Secret data'

      const encrypted = await provider.encrypt(plaintext, testKey)

      // Tamper with the ciphertext
      const bytes = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0))
      bytes[20] ^= 0xff // Flip bits in the middle
      const tampered = btoa(String.fromCharCode(...bytes))

      await expect(provider.decrypt(tampered, testKey)).rejects.toThrow()
    })
  })

  describe('generateToken', () => {
    it('generates UUID format token', () => {
      const token = provider.generateToken()

      // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
      expect(token).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      )
    })

    it('generates unique tokens', () => {
      const tokens = new Set<string>()
      for (let i = 0; i < 100; i++) {
        tokens.add(provider.generateToken())
      }

      expect(tokens.size).toBe(100)
    })
  })

  describe('generateWebhookSecret', () => {
    it('generates UUID format secret', () => {
      const secret = provider.generateWebhookSecret()

      expect(secret).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      )
    })

    it('generates unique secrets', () => {
      const secrets = new Set<string>()
      for (let i = 0; i < 100; i++) {
        secrets.add(provider.generateWebhookSecret())
      }

      expect(secrets.size).toBe(100)
    })
  })

  describe('hmacVerify', () => {
    it('verifies valid signature', async () => {
      const payload = '{"test":"data"}'
      const secret = 'webhook-secret'

      // Generate expected signature
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
      const hexSig = Array.from(new Uint8Array(sig))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
      const signature = `sha256=${hexSig}`

      const result = await provider.hmacVerify(payload, signature, secret)

      expect(result).toBe(true)
    })

    it('rejects invalid signature', async () => {
      const payload = '{"test":"data"}'
      const secret = 'webhook-secret'
      const wrongSignature = 'sha256=0000000000000000000000000000000000000000000000000000000000000000'

      const result = await provider.hmacVerify(payload, wrongSignature, secret)

      expect(result).toBe(false)
    })

    it('rejects signature with different length', async () => {
      const payload = '{"test":"data"}'
      const secret = 'webhook-secret'
      const shortSignature = 'sha256=00000000'

      const result = await provider.hmacVerify(payload, shortSignature, secret)

      expect(result).toBe(false)
    })

    it('rejects wrong secret', async () => {
      const payload = '{"test":"data"}'
      const secret = 'correct-secret'
      const wrongSecret = 'wrong-secret'

      // Generate signature with wrong secret
      const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(wrongSecret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      )
      const sig = await crypto.subtle.sign(
        'HMAC',
        key,
        new TextEncoder().encode(payload)
      )
      const hexSig = Array.from(new Uint8Array(sig))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
      const signature = `sha256=${hexSig}`

      const result = await provider.hmacVerify(payload, signature, secret)

      expect(result).toBe(false)
    })

    it('rejects modified payload', async () => {
      const originalPayload = '{"test":"data"}'
      const modifiedPayload = '{"test":"modified"}'
      const secret = 'webhook-secret'

      // Generate signature for original payload
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
        new TextEncoder().encode(originalPayload)
      )
      const hexSig = Array.from(new Uint8Array(sig))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
      const signature = `sha256=${hexSig}`

      // Verify against modified payload
      const result = await provider.hmacVerify(modifiedPayload, signature, secret)

      expect(result).toBe(false)
    })
  })
})
