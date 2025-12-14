import 'server-only'

import crypto from 'node:crypto'

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY
  if (!raw) {
    throw new Error('Missing ENCRYPTION_KEY (required to store AI provider keys securely)')
  }

  // Derive a stable 32-byte key from arbitrary input.
  return crypto.createHash('sha256').update(raw, 'utf8').digest()
}

export function encryptSecret(plaintext: string): string {
  const key = getKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  // format: base64(iv).base64(tag).base64(ciphertext)
  return `${iv.toString('base64')}.${tag.toString('base64')}.${ciphertext.toString('base64')}`
}

export function decryptSecret(payload: string): string {
  const key = getKey()
  const [ivB64, tagB64, ciphertextB64] = payload.split('.')
  if (!ivB64 || !tagB64 || !ciphertextB64) {
    throw new Error('Invalid encrypted secret payload')
  }

  const iv = Buffer.from(ivB64, 'base64')
  const tag = Buffer.from(tagB64, 'base64')
  const ciphertext = Buffer.from(ciphertextB64, 'base64')

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return plaintext.toString('utf8')
}
