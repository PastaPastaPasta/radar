const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self'",
  "style-src-attr 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "media-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

const TRUSTED_TYPES_REPORT_ONLY = "require-trusted-types-for 'script'"

const SECURITY_HEADERS: Record<string, string> = {
  'content-security-policy': CSP,
  'content-security-policy-report-only': TRUSTED_TYPES_REPORT_ONLY,
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(self), microphone=(), geolocation=(), payment=(), usb=()',
}

export function withSecurityHeaders(res: Response): Response {
  const out = new Response(res.body, res)
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) out.headers.set(k, v)
  return out
}
