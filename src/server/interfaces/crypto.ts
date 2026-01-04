// Crypto abstraction interface
// Implement this for different crypto backends (Web Crypto, Node crypto)

export interface CryptoProvider {
  encrypt(plaintext: string, keyHex: string): Promise<string>
  decrypt(ciphertext: string, keyHex: string): Promise<string>
  generateToken(): string
  generateWebhookSecret(): string
  hmacVerify(payload: string, signature: string, secret: string): Promise<boolean>
}
