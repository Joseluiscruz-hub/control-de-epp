import { NextRequest, NextResponse } from "next/server";

function buildContentSecurityPolicy(nonce: string) {
  const isDevelopment = process.env.NODE_ENV !== "production";

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(isDevelopment ? ["'unsafe-eval'"] : []),
      "https://www.gstatic.com",
      "https://www.google.com",
      "https://www.recaptcha.net",
      "https://recaptcha.net",
      "https://apis.google.com",
    ],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": [
      "'self'",
      "data:",
      "blob:",
      "https://picsum.photos",
      "https://lh3.googleusercontent.com",
      "https://*.googleapis.com",
    ],
    "font-src": ["'self'", "data:", "https://fonts.gstatic.com"],
    "connect-src": [
      "'self'",
      "https://*.googleapis.com",
      "https://*.firebaseio.com",
      "wss://*.firebaseio.com",
      "https://identitytoolkit.googleapis.com",
      "https://securetoken.googleapis.com",
      "https://accounts.google.com",
      "https://www.gstatic.com",
      "https://www.google.com",
      "https://www.recaptcha.net",
      "https://recaptcha.net",
    ],
    "frame-src": [
      "'self'",
      "https://*.firebaseapp.com",
      "https://accounts.google.com",
      "https://www.google.com",
      "https://www.recaptcha.net",
      "https://recaptcha.net",
    ],
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
    "upgrade-insecure-requests": [],
  };

  return Object.entries(directives)
    .map(([directive, values]) => values.length ? `${directive} ${values.join(" ")}` : directive)
    .join("; ");
}

export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const contentSecurityPolicy = buildContentSecurityPolicy(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  // Next.js parses the request CSP and propagates the nonce to framework scripts.
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set("Content-Security-Policy", contentSecurityPolicy);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|icons/|manifest\\.webmanifest|sw\\.js).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
