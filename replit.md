# GAC Trackings Dashboard

## Overview

GAC Trackings is an employee attendance tracking and management dashboard. The application provides role-based access for administrators and employees, enabling attendance monitoring, employee management, and reporting capabilities. Administrators can manage employees, view attendance records, and generate reports, while employees can clock in/out and view their attendance history.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite for development and production builds
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: TanStack React Query for server state and caching
- **UI Components**: Shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with CSS custom properties for theming (light/dark mode support)
- **Form Handling**: React Hook Form with Zod validation

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript with ESM modules
- **API Design**: RESTful JSON API with `/api` prefix
- **Session Management**: Express-session with cookie-based authentication

### Data Storage
- **Database**: PostgreSQL
- **ORM**: Drizzle ORM with type-safe schema definitions
- **Schema Location**: `shared/schema.ts` contains all table definitions
- **Migrations**: Drizzle Kit for database migrations (`drizzle-kit push`)

### Security
- **API secrets**: ClickUp API key, team ID, and space ID stored in Replit Secrets (not hardcoded)
- **WaSender token masking**: API token is masked (last 4 chars only) in all admin API responses; masked tokens are ignored on update
- **Session secret**: Uses `SESSION_SECRET` env var with cryptographically random fallback (note: random fallback rotates on restart, so set SESSION_SECRET in production)
- **Employee data**: `getAllUsers()` selects specific columns excluding password hashes
- **Password Security**: Bcrypt for password hashing

### Authentication & Authorization
- **Session-based authentication** using express-session
- **Role-based access control** with two roles: `admin` and `employee`
- **Middleware guards**: `requireAuth` for authenticated routes, `requireAdmin` for admin-only routes
- **Protected routes** on frontend redirect unauthenticated users to login

### Project Structure
```
├── client/           # React frontend application
│   └── src/
│       ├── components/   # Reusable UI components
│       ├── pages/        # Route page components
│       ├── lib/          # Utilities and context providers
│       └── hooks/        # Custom React hooks
├── server/           # Express backend
│   ├── routes.ts     # API route definitions
│   ├── storage.ts    # Database access layer
│   └── db.ts         # Database connection
├── shared/           # Shared code between client/server
│   └── schema.ts     # Drizzle schema and Zod validators
└── migrations/       # Database migration files
```

### Work Schedule & Attendance Rules
- **Work Week**: Monday-Friday = full working days, Saturday = half day (5 hours), Sunday = off day
- **Timezone**: All day-of-week detection uses Pakistan timezone (Asia/Karachi, UTC+5) via Intl.DateTimeFormat
- **Monthly Required Hours**: Sum of per-day required hours (Mon-Fri x employee's shift hours + Saturdays x 5h, Sundays = 0)
- **Net Work Hours**: Gross working time (clock-out - clock-in) minus total break time
- **Overtime**: Net work hours - Required hours (only positive values)
- **Sunday Block**: Backend blocks clock-in on Sundays; scheduler skips absent marking on Sundays
- **Saturday Cap**: Required hours capped at 5 hours (300 minutes) on Saturdays regardless of shift configuration
- **Grace Period**: 15 minutes for late determination
- **Active Shift Priority**: Shift availability logic prioritizes active shift state (clocked-in without clock-out) over time window calculations. An active shift is ALWAYS unlocked regardless of calculated time windows, preventing cross-midnight reload bugs where evening shifts appeared locked after their scheduled end time.
- **Shift Extension Reminder Flow**: Scheduled end time + 1h → WhatsApp reminder with 10-min auto-close warning → if no extension within 10 min → auto-close with base scheduled end time → if extended: next reminder in 1h after extension, repeat cycle. Skips open shifts and Saturday. Applies to one-shift and two-shift employees only.

### Design Patterns
- **Shared schema**: Database schema and validation schemas defined once in `shared/schema.ts`, used by both frontend and backend
- **Storage abstraction**: `IStorage` interface in `server/storage.ts` abstracts database operations
- **Query invalidation**: React Query handles cache invalidation after mutations
- **Component composition**: Shadcn/ui components use Radix primitives with Tailwind styling

## External Dependencies

### Database
- **PostgreSQL**: Primary database, connection via `DATABASE_URL` environment variable
- **Connection pooling**: Using `pg` Pool for database connections

### UI Framework
- **Radix UI**: Accessible component primitives (dialogs, dropdowns, tabs, etc.)
- **Lucide React**: Icon library
- **React Day Picker**: Calendar component
- **Embla Carousel**: Carousel functionality
- **Vaul**: Drawer component

### Development Tools
- **Drizzle Kit**: Database schema management and migrations
- **TSX**: TypeScript execution for development
- **ESBuild**: Production bundling for server code

### Session Storage
- **connect-pg-simple**: PostgreSQL session store (available for production use)
- **memorystore**: In-memory session storage option

### Validation
- **Zod**: Runtime schema validation
- **drizzle-zod**: Generate Zod schemas from Drizzle table definitions