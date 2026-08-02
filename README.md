# CivicAI — Public Infrastructure Intelligence Platform

CivicAI is a role-based reporting and operations platform for city infrastructure. Citizens can report issues with photos, GPS, and category metadata. Departments get district intelligence, duplicate-aware routing, and a verified resolution trail. Field officers update work status and attach proof as issues move through a five-stage workflow.

## Key features

- Role-based workspaces for citizens, department admins, and field officers
- Issue reporting with photo, description, GPS, and category selection
- Duplicate detection and intelligent routing to the right department
- Live district analytics, workload visibility, and performance insights
- Verified five-stage complaint flow from submission through completion
- Supabase authentication and persistence
- AI-powered decision support for report triage and analytics

## Local development

### Prerequisites

- Node.js 18+ / npm
- Supabase project and credentials
- Gemini API key from Google AI Studio

### Install dependencies


npm install


### Start the app


npm run dev -- --host 0.0.0.0


Then open:

- `http://localhost:8080/`

Set `GEMINI_API_KEY` in your local environment before running the AI features.

### Build for production


npm run build
npm run preview

## Built with

- Vite
- React 19
- TypeScript
- Tailwind CSS
- TanStack React Router
- Supabase
- OAuth authentication
- AI integration
