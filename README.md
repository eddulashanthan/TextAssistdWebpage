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

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Branching & Deployment

This project uses two main branches for deployment:

- `main` (development): All development work and feature branches are merged here. This branch is deployed to the Vercel preview environment.
- `production`: Stable, production-ready code. This branch is deployed to the live Vercel production environment.

### Creating and Using Branches

To create and push a production branch:

```bash
git checkout -b production
# Push the branch to GitHub
git push -u origin production
```

To deploy to production, merge your changes from `main`:

```bash
git checkout production
git merge main
git push origin production
```

### Environment Variables & Security

- Store all secrets (Supabase, Stripe, PayPal, etc.) in Vercel's environment variable settings. Never commit secrets to the repo.
- For single-db setups, be aware that dev and prod share the same data. Use caution when testing destructive changes.
- Enable Row Level Security (RLS) in Supabase for all tables.
- Never expose service role keys to the client.

### Deploying on Vercel

- Vercel will auto-deploy the `main` branch to a preview environment and the `production` branch to the live site.
- You can configure custom domains and environment variables per branch in the Vercel dashboard.
