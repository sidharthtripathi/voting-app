# Settle It - Real-Time Anonymous Polling App

A real-time anonymous polling application built with Next.js 14+, TypeScript, Prisma, and Pusher.

## Features

- Create polls without authentication
- Real-time vote updates via WebSocket
- Anonymous voting with browser-based deduplication
- Poll creator control via local tokens
- Natural language option parsing
- Voter suggestions with approval workflow
- Automatic poll expiration
- Visual vote representation with bar charts

## Tech Stack

- **Framework**: Next.js 14+ with App Router
- **Language**: TypeScript (strict mode)
- **Database**: PostgreSQL with Prisma ORM
- **Real-time**: Pusher WebSocket service
- **Charts**: Recharts
- **Fingerprinting**: FingerprintJS
- **Testing**: Jest, React Testing Library, fast-check (property-based testing)

## Getting Started

### Prerequisites

- Node.js 18+ 
- PostgreSQL database
- Pusher account (for real-time features)

### Installation

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

3. Set up environment variables:

Copy `.env.example` to `.env` and fill in your values:

```bash
DATABASE_URL="postgresql://user:password@localhost:5432/settle_it"
PUSHER_APP_ID="your_pusher_app_id"
PUSHER_SECRET="your_pusher_secret"
NEXT_PUBLIC_PUSHER_KEY="your_pusher_key"
NEXT_PUBLIC_PUSHER_CLUSTER="your_pusher_cluster"
```

4. Set up the database:

```bash
npx prisma migrate dev
```

5. Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

## Project Structure

```
settle-it/
├── app/              # Next.js App Router pages and API routes
├── components/       # React components
├── lib/              # Utility functions and configurations
├── types/            # TypeScript type definitions
├── prisma/           # Database schema and migrations
└── .kiro/            # Spec files (requirements, design, tasks)
```

## Development

### Database Migrations

```bash
# Create a new migration
npx prisma migrate dev --name migration_name

# Reset database
npx prisma migrate reset

# Generate Prisma Client
npx prisma generate
```

### Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run property-based tests
npm test -- --testPathPattern=property
```

## Documentation

See the `.kiro/specs/settle-it-voting-app/` directory for detailed:
- Requirements document
- Design document
- Implementation tasks
