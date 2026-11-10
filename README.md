This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Phone access

The dashboard works from a phone over [Tailscale](https://tailscale.com), never over the open network.

1. **Start the server from a normal terminal** (not from inside another app's sandbox) with `npm run dev` or `npm start`. Both bind to `127.0.0.1`, so nothing else on your Wi-Fi can reach it. Settings → Phone and remote access warns if the server is reachable on a network address.
2. **Once, in the [Tailscale admin console](https://login.tailscale.com/admin/dns):** turn on MagicDNS and HTTPS certificates for your tailnet.
3. **In Settings → Phone and remote access on the PC:** press **Enable phone access** (this runs `tailscale serve` for you), then switch **Allow the phone to connect** on. The panel shows the address and a QR code.
4. **On the phone**, signed into the same Tailscale account, scan the QR code or open the address.

Turning the switch off, or pressing Disable, cuts the phone off at once. Changes made from the phone are recorded in the audit log.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
