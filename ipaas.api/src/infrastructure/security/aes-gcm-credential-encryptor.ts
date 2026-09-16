import { createCipheriv, randomBytes } from "node:crypto";
import type {
  CredentialEncryptor,
  EncryptedCredential,
} from "../../application/ports/credential-encryptor";

export class AesGcmCredentialEncryptor implements CredentialEncryptor {
  private readonly key: Buffer;

  constructor(base64Key: string) {
    this.key = Buffer.from(base64Key, "base64");
    if (this.key.length !== 32)
      throw new Error("Invalid credential encryption configuration.");
  }

  encrypt(secret: string): EncryptedCredential {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const plaintext = Buffer.from(JSON.stringify(secret), "utf8");
    const encryptedPayload = Buffer.concat([
      cipher.update(plaintext),
      cipher.final(),
    ]);
    return { encryptedPayload, iv, authTag: cipher.getAuthTag() };
  }
}
