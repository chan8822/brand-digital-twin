/**
 * @fileoverview Centralized security scrubber for PII, PANs, JWTs, and keys.
 */

/**
 * Checks if a sequence of digits is valid per the Luhn algorithm.
 */
export function isLuhnValid(digitsStr: string): boolean {
  let sum = 0;
  let shouldDouble = false;
  for (let i = digitsStr.length - 1; i >= 0; i--) {
    let digit = parseInt(digitsStr.charAt(i), 10);
    if (isNaN(digit)) return false;
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

/**
 * Scans a string for credit card PAN digit sequences and redacts Luhn-valid ones.
 */
export function redactPanStrings(val: string): string {
  const panRegex = /\b(?:\d[ -\s]?){13,19}\b/g;
  return val.replace(panRegex, (match) => {
    const digits = match.replace(/[ -\s]/g, '');
    if (isLuhnValid(digits)) {
      return '[REDACTED]';
    }
    return match;
  });
}

/**
 * Scans a string for JWT patterns and redacts them.
 */
export function redactJwtStrings(val: string): string {
  const jwtRegex = /\b[a-zA-Z0-9\-_]{4,}\.[a-zA-Z0-9\-_]{4,}\.[a-zA-Z0-9\-_]{4,}\b/g;
  return val.replace(jwtRegex, '[REDACTED]');
}

/**
 * Centralized, recursive, case-insensitive PII/credential scrubber.
 */
export function redactSensitiveData(
  val: any,
  depth = 0,
  visited = new WeakSet<any>(),
): any {
  if (val === null || val === undefined) return val;
  if (depth > 20) return '[DEPTH_EXCEEDED]';

  if (typeof val === 'object') {
    if (visited.has(val)) {
      return '[CIRCULAR]';
    }
    visited.add(val);
  }

  if (Array.isArray(val)) {
    const result = val.map((v) => redactSensitiveData(v, depth + 1, visited));
    visited.delete(val);
    return result;
  }

  if (typeof val === 'object') {
    const redacted: Record<string, any> = {};
    for (const key of Object.keys(val)) {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes('auth') ||
        lowerKey.includes('secret') ||
        lowerKey.includes('key') ||
        lowerKey.includes('token') ||
        lowerKey.includes('bearer') ||
        lowerKey.includes('password') ||
        lowerKey.includes('refresh')
      ) {
        redacted[key] = '[REDACTED]';
      } else {
        redacted[key] = redactSensitiveData(val[key], depth + 1, visited);
      }
    }
    visited.delete(val);
    return redacted;
  }

  if (typeof val === 'string') {
    // 1. URL query param sanitization
    if (val.startsWith('/') || val.startsWith('http')) {
      try {
        const parsed = new URL(val, 'http://localhost');
        let changed = false;
        for (const key of Array.from(parsed.searchParams.keys())) {
          const lowerKey = key.toLowerCase();
          if (
            lowerKey.includes('token') ||
            lowerKey.includes('code') ||
            lowerKey.includes('state') ||
            lowerKey.includes('secret') ||
            lowerKey.includes('key')
          ) {
            parsed.searchParams.set(key, '[REDACTED]');
            changed = true;
          }
        }
        if (changed) {
          return val.startsWith('/')
            ? parsed.pathname + parsed.search
            : parsed.href;
        }
      } catch {
        // Ignored
      }
    }

    // 2. JWT redaction
    let temp = redactJwtStrings(val);
    // 3. PAN redaction
    temp = redactPanStrings(temp);
    // 4. Secret keyword assignment/prefix redaction
    temp = redactSecretKeywordsInString(temp);

    return temp;
  }

  return val;
}

export function redactSecretKeywordsInString(val: string): string {
  const assignRegex = /\b(\w*(?:secret|key|token|password|auth|bearer)\w*)\b\s*[=:]\s*([a-zA-Z0-9_\-]+)/gi;
  const prefixRegex = /\b\w*(?:secret|key|token|password|auth|bearer)\w*_[a-zA-Z0-9_\-]{6,}\b/gi;

  let temp = val.replace(assignRegex, (match, p1) => {
    return `${p1} = [REDACTED]`;
  });
  temp = temp.replace(prefixRegex, '[REDACTED]');
  return temp;
}
