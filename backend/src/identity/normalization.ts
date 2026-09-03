import { AppError } from "../common/errors/app-error";

export function normalizeName(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ");
}

export function normalizeEmail(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase();
}

export function normalizePhone(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/[\s().-]/g, "");
}

export function normalizeSerial(value: string): string {
  const serial = value.normalize("NFKC").trim().toUpperCase();
  if (!/^KSA-[0-9]{2}$/.test(serial)) {
    throw new AppError(
      "VALIDATION_ERROR",
      400,
      "Enter the participant serial in the format KSA-07.",
      { field: "serialNumber" },
    );
  }
  return serial;
}

export function isValidPhone(value: string): boolean {
  return /^\+?[0-9]{7,15}$/.test(value);
}

export function namesMatch(left: string, right: string): boolean {
  return normalizeName(left).toLocaleLowerCase() === normalizeName(right).toLocaleLowerCase();
}

export function safeIdentifier(value: string): string {
  return value.includes("@") ? normalizeEmail(value) : normalizeSerial(value);
}
