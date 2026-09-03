import { normalizeEmail, normalizeName, normalizePhone, normalizeSerial } from "./normalization";

describe("identity normalization", () => {
  it("canonicalizes names, email, and phone separators", () => {
    expect(normalizeName("  Ada   Lovelace ")).toBe("Ada Lovelace");
    expect(normalizeEmail(" ADA@Example.TEST ")).toBe("ada@example.test");
    expect(normalizePhone("+234 (801) 234-5678")).toBe("+2348012345678");
  });

  it("accepts only canonical two-digit participant serials", () => {
    expect(normalizeSerial(" ksa-07 ")).toBe("KSA-07");
    expect(() => normalizeSerial("KSA-7")).toThrow();
    expect(() => normalizeSerial("KSA24")).toThrow();
  });
});
