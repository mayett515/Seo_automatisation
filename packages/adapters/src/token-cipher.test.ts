import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AesGcmTokenCipher } from "./token-cipher.js";

void describe("AesGcmTokenCipher", () => {
  void it("decrypts values encrypted with the same secret", () => {
    const cipher = new AesGcmTokenCipher("test-token-secret-with-at-least-32-characters");
    const encrypted = cipher.encrypt("refresh-token-value");

    assert.notEqual(encrypted, "refresh-token-value");
    assert.equal(cipher.decrypt(encrypted), "refresh-token-value");
  });

  void it("rejects tampered ciphertext", () => {
    const cipher = new AesGcmTokenCipher("test-token-secret-with-at-least-32-characters");
    const encrypted = cipher.encrypt("refresh-token-value");

    assert.throws(() => cipher.decrypt(`${encrypted}tampered`));
  });
});
