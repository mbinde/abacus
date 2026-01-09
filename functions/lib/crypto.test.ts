import { describe, it, expect } from 'vitest'
import { encryptToken, decryptToken } from './crypto'

describe('functions/lib/crypto', () => {
  // 256-bit key (64 hex chars)
  const testKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

  describe('encryptToken/decryptToken', () => {
    it('round-trips token through encryption', async () => {
      const token = 'ghp_abcdef123456'

      const encrypted = await encryptToken(token, testKey)
      const decrypted = await decryptToken(encrypted, testKey)

      expect(decrypted).toBe(token)
    })

    it('handles empty string', async () => {
      const token = ''

      const encrypted = await encryptToken(token, testKey)
      const decrypted = await decryptToken(encrypted, testKey)

      expect(decrypted).toBe(token)
    })

    it('handles long tokens', async () => {
      const token = 'ghp_' + 'a'.repeat(1000)

      const encrypted = await encryptToken(token, testKey)
      const decrypted = await decryptToken(encrypted, testKey)

      expect(decrypted).toBe(token)
    })

    it('produces different ciphertext each time (random IV)', async () => {
      const token = 'ghp_test123'

      const encrypted1 = await encryptToken(token, testKey)
      const encrypted2 = await encryptToken(token, testKey)

      expect(encrypted1).not.toBe(encrypted2)

      // But both decrypt correctly
      expect(await decryptToken(encrypted1, testKey)).toBe(token)
      expect(await decryptToken(encrypted2, testKey)).toBe(token)
    })

    it('fails with wrong key', async () => {
      const token = 'ghp_secret'
      const wrongKey = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210'

      const encrypted = await encryptToken(token, testKey)

      await expect(decryptToken(encrypted, wrongKey)).rejects.toThrow()
    })

    it('fails with tampered ciphertext', async () => {
      const token = 'ghp_secret'
      const encrypted = await encryptToken(token, testKey)

      // Tamper with the ciphertext
      const bytes = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0))
      bytes[15] ^= 0xff
      const tampered = btoa(String.fromCharCode(...bytes))

      await expect(decryptToken(tampered, testKey)).rejects.toThrow()
    })

    it('output is base64 encoded', async () => {
      const token = 'test'
      const encrypted = await encryptToken(token, testKey)

      // Should be valid base64
      expect(() => atob(encrypted)).not.toThrow()

      // Should contain IV (12 bytes) + ciphertext (at least 16 bytes for GCM tag)
      const decoded = atob(encrypted)
      expect(decoded.length).toBeGreaterThanOrEqual(28)
    })
  })
})
