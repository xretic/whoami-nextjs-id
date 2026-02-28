# whoami-nextjs-id

Small Next.js-friendly library that extracts client IP (IPv4/IPv6), parses User-Agent into a readable device name, and optionally fetches geo info via a provider.

## Install

```bash
npm i whoami-nextjs-id
```

## Usage (Next.js Route Handler)

```ts
import { createUserProxyClient } from "whoami-nextjs-id";

const client = createUserProxyClient({ provider: "ipapi" });

export async function POST(req: any) {
  const info = await client.userProxy(req);
  return new Response(JSON.stringify(info), { status: 200 });
}
```

## Providers

- `ipapi` (no key)
- `ipgeolocation` (requires `apiKey`)
