# Frontend: Lead Finder Agent

This directory contains the Next.js frontend for the Lead Finder Agent application.

## 🏗️ Folder Structure

```text
frontend/
├── app/                  # Next.js App Router structure (pages, layouts)
│   ├── dashboard/        # Authenticated UI (Admin, Campaigns, Search)
│   ├── login/            # Public login page
│   └── layout.tsx        # Root layout with global providers
├── src/
│   ├── components/       # Reusable React components (buttons, badges)
│   ├── features/         # Modular feature logic (auth store, etc)
│   ├── lib/              # Utility configurations (Axios, cn merge)
│   └── types/            # TypeScript interfaces
├── .env                  # Local environment file
├── package.json          # Node.js dependencies
└── next.config.ts        # Next.js build configuration
```

## 🛠️ Technology Stack

- **Framework**: [Next.js 15](https://nextjs.org/) (App Router)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Data Fetching**: [TanStack React Query](https://tanstack.com/query)
- **State Management**: [Zustand](https://github.com/pmndrs/zustand)

## 🚀 Quick Start

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Environment Variables**
   Ensure you have created a `.env` file from the `.env.example`:
   ```bash
   cp .env.example .env
   ```

3. **Run Development Server**
   ```bash
   npm run dev
   ```
   Open [http://https://lead-finder-agent.netlify.app/](http://https://lead-finder-agent.netlify.app/) in your browser.

## 🔑 Authentication

The frontend relies heavily on JWT Authentication. `AuthGuard` wraps the `/dashboard` routes, ensuring unauthorized users are instantly redirected to `/login`.
State is synced globally using Zustand (`src/features/auth/store`).
