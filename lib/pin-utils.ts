export function isSixDigitPin(pin: string) {
  return /^\d{6}$/.test(pin);
}

export function legacyHashPin(pin: string): string {
  let hash = 0;
  for (let i = 0; i < pin.length; i++) {
    hash = (hash << 5) - hash + pin.charCodeAt(i);
    hash |= 0;
  }
  return "pin_" + Math.abs(hash).toString(36) + "_" + pin.length;
}
