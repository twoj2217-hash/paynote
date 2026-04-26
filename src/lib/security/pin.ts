import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

export async function hashPin(plainPin: string): Promise<string> {
  if (!plainPin || typeof plainPin !== "string") {
    throw new Error("hashPin: 유효한 PIN 문자열이 필요합니다.");
  }
  return bcrypt.hash(plainPin, SALT_ROUNDS);
}

export async function verifyPin(
  plainPin: string,
  storedHash: string
): Promise<boolean> {
  if (!plainPin || !storedHash) return false;
  try {
    return await bcrypt.compare(plainPin, storedHash);
  } catch {
    return false;
  }
}

export function isHashed(value: string | null | undefined): boolean {
  if (!value) return false;
  return /^\$2[aby]?\$\d{2}\$.{53}$/.test(value);
}