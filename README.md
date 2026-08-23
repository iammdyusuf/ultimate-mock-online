# Ultimate Mock Online — Full Stack Demo

This version adds:
- Student registration/login
- JWT authentication
- bcrypt password hashing
- Admin role
- PostgreSQL cloud database support
- Server-side question bank
- Bulk JSON question import for admins
- Per-student result history
- Global leaderboard
- Admin statistics
- Online deployment-ready Express server

## 1. Database
Create a PostgreSQL database (Supabase, Neon, Railway, Render PostgreSQL, etc.).
Run `schema.sql` in the database SQL editor.

## 2. Environment
Copy `.env.example` to `.env` and fill:
- DATABASE_URL
- JWT_SECRET
- ADMIN_EMAIL
- ADMIN_PASSWORD

IMPORTANT: the current server does not automatically create the admin account from the ADMIN_* variables. Create the first admin manually by registering, then change that user's role to `admin` in PostgreSQL:
UPDATE users SET role='admin' WHERE email='your-admin-email@example.com';

## 3. Install and run
npm install
npm start

Open http://localhost:3000

## 4. Deploy
Deploy the Node app to Render/Railway/Fly.io/etc. and set the same environment variables.
Use a managed PostgreSQL provider for the cloud database.

## Security notes
- Never put DATABASE_URL, JWT_SECRET or admin passwords in frontend JavaScript.
- Use HTTPS in production.
- Change JWT_SECRET to a long random value.
- Add rate limiting, email verification, password reset, CSRF/origin controls and stronger admin controls before public production use.
- For true instant leaderboard updates without refresh, enable PostgreSQL/Supabase Realtime and add a websocket/SSE layer. The included leaderboard is server-backed and updates on each dashboard load.
