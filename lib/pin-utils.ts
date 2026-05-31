export function isSixDigitPin(pin: string) {
  return /^\d{6}$/.test(pin);
}

export function isWeakPin(pin: string) {
  if (!isSixDigitPin(pin)) return true;
  if (/^(\d)\1{5}$/.test(pin)) return true;
  return ["012345", "123456", "234567", "345678", "456789", "987654", "876543", "765432", "654321"].includes(pin);
}

export function legacyHashPin(pin: string): string {
  let hash = 0;
  for (let i = 0; i < pin.length; i++) {
    hash = (hash << 5) - hash + pin.charCodeAt(i);
    hash |= 0;
  }
  return "pin_" + Math.abs(hash).toString(36) + "_" + pin.length;
}
