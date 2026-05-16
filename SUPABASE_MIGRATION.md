# JourneyTogether 2.0 — Supabase Migration Status

## ✅ Completed

### 1. Supabase Project Setup
- **Created new project:** JourneyTogether 2.0
- **Project Ref:** `nligtfvaxrwtrhdvwuug`
- **Region:** North EU (Stockholm)
- **Status:** ⏳ Provisioning (database endpoint not yet DNS-resolvable)
- **Dashboard:** https://supabase.com/dashboard/project/nligtfvaxrwtrhdvwuug

### 2. Credentials Saved
- **Backend `.env` updated** with Supabase configuration
- **API Keys:**
  - Anon key: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
  - Service role key: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
- **Database password:** `Jt2_SecureDb_2026!xK9mP`

### 3. Database Schema
- **Migration SQL created:** `backend/src/db/supabase_migration.sql`
  - All 12 tables converted from SQLite to PostgreSQL
  - Row Level Security (RLS) policies configured
  - Realtime enabled for all tables
  - Auto-profile creation trigger on user signup
  - Proper indexes and foreign keys

### 4. TypeScript Types
- **Generated:** `backend/src/db/database.types.ts`
  - Full type safety for all tables
  - Json type for JSONB columns
  - Proper enum types for constrained fields

### 5. Database Adapter
- **Created:** `backend/src/db/supabase-adapter.ts`
  - User/profile operations
  - Journey CRUD operations
  - Stop management
  - Session management (active + group sessions)
  - Reactions (session + journey level)
  - Photo uploads
  - Journey completions

### 6. Dependencies Installed
- `@supabase/supabase-js` — Supabase JavaScript client
- `pg` — PostgreSQL client for Node.js (for migration)

## ⏳ Pending (Waiting for Supabase to Finish Provisioning)

### 1. Apply Database Migration
Once the database endpoint is resolvable (`db.nligtfvaxrwtrhdvwuug.supabase.co`):

```bash
cd /home/node/.openclaw/workspace-journeytogether-2.0/backend
node src/db/run-migration.js
```

This will:
- Create all 12 tables
- Set up RLS policies
- Enable Realtime
- Create the profile trigger function

### 2. Create Storage Bucket
Via Supabase Dashboard or API:
- **Bucket name:** `journey-uploads`
- **Public:** true
- **File size limit:** 10MB
- **Allowed MIME types:** `image/*`, `audio/*`

Then apply storage policies for RLS.

### 3. Update Backend Routes
Replace SQLite calls with Supabase adapter:
- `backend/src/routes/auth.routes.ts` — Use Supabase Auth
- `backend/src/routes/user.routes.ts` — Use `getUserProfile`, `updateUserProfile`
- `backend/src/routes/journey.routes.ts` — Use journey operations
- `backend/src/routes/session.routes.ts` — Use session operations
- `backend/src/routes/groupSession.routes.ts` — Use session + Realtime

### 4. Update WebSocket Server
Replace custom WebSocket auth with Supabase Realtime:
- Use Supabase Realtime channels for group sessions
- Remove custom `ws` server code
- Subscribe to `session_members` changes

### 5. Update Frontend (if needed)
- Update API base URL if changed
- Add Supabase client for direct Realtime subscriptions
- Update auth flow to use Supabase Auth

## 📋 Next Steps

1. **Wait 5-10 minutes** for Supabase project to fully provision
2. **Run migration:** `node backend/src/db/run-migration.js`
3. **Create storage bucket** in Supabase dashboard
4. **Update backend routes** to use Supabase adapter
5. **Test authentication** with Supabase Auth
6. **Test Realtime** for group sessions
7. **Deploy and verify**

## 🔗 Useful Links

- **Dashboard:** https://supabase.com/dashboard/project/nligtfvaxrwtrhdvwuug
- **SQL Editor:** https://supabase.com/dashboard/project/nligtfvaxrwtrhdvwuug/sql
- **Storage:** https://supabase.com/dashboard/project/nligtfvaxrwtrhdvwuug/storage
- **Auth:** https://supabase.com/dashboard/project/nligtfvaxrwtrhdvwuug/auth/users
- **API Docs:** https://supabase.com/docs/reference/javascript/introduction

## 🎩 Notes

- The old `journey-together` project (humlcvhfiusstnbgiwae) is still in "COMING_UP" state and couldn't be deleted
- New project uses proper PostgreSQL with RLS for security
- All queries should use the Supabase adapter for type safety
- Realtime is enabled on all tables for live updates
