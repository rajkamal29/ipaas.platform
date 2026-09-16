export interface EncryptedCredential {
  readonly encryptedPayload: Uint8Array;
  readonly iv: Uint8Array;
  readonly authTag: Uint8Array;
}

export interface CredentialEncryptor {
  encrypt(secret: string): EncryptedCredential;
}
