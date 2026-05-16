# JourneyTogether 2.0 - Frontend Only

**Architecture:** Direct Supabase integration (no backend server)

## 🏗️ Architecture

```
┌─────────────────┐
│   Expo App      │
│  (React Native) │
└────────┬────────┘
         │
         │ Supabase Client
         │ - Auth
         │ - Database (PostgREST)
         │ - Realtime
         │ - Storage
         ▼
┌─────────────────┐
│    Supabase     │
│  - PostgreSQL   │
│  - Auth         │
│  - Realtime     │
│  - Storage      │
└─────────────────┘
```

## 📦 Dependencies

### Core
- `expo` ~54.0.33
- `react` 19.1.0
- `react-native` 0.81.5

### Supabase
- `@supabase/supabase-js` ^2.x
- `react-native-url-polyfill` (for deep links)

### State Management
- `zustand` ^5.0.12

### Navigation
- `expo-router` ~6.0.23
- `@react-navigation/*`

### Storage
- `@react-native-async-storage/async-storage` (for Supabase session persistence)

## 🔧 Configuration

### Environment Variables

Create `.env` in the frontend directory:

```bash
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
EXPO_PUBLIC_SUPABASE_STORAGE_BUCKET=journey-uploads
```

### Supabase Setup

1. **Run migration** (once):
```bash
cd /home/node/.openclaw/workspace-journeytogether-2.0
# Apply supabase_migration.sql in Supabase SQL Editor
```

2. **Create storage bucket**:
   - Name: `journey-uploads`
   - Public: ✅ true
   - File size: 10MB limit
   - Allowed MIME: `image/*,audio/*`

3. **Enable Email Auth** in Supabase Dashboard:
   - Authentication → Providers → Email
   - Enable "Enable Email Signup"
   - Disable email confirmation for development (optional)

## 📁 Project Structure

```
frontend/
├── api/
│   └── supabaseClient.ts    # Supabase API functions
├── app/
│   ├── _layout.tsx          # Root layout (initialize Supabase)
│   ├── index.tsx            # Home screen
│   ├── auth/
│   │   ├── login.tsx
│   │   └── register.tsx
│   └── (tabs)/
│       ├── index.tsx        # Journey discovery
│       ├── journey/
│       │   └── [id].tsx     # Journey detail
│       ├── session/
│       │   └── active.tsx   # Active session
│       └── profile.tsx      # User profile
├── components/
│   ├── JourneyCard.tsx
│   ├── StopCard.tsx
│   └── ...
├── lib/
│   └── supabase.ts          # Supabase client setup
├── stores/
│   ├── authStore.ts         # Auth state (zustand)
│   ├── journeyStore.ts      # Journey state
│   └── sessionStore.ts      # Session state
├── types/
│   └── database.ts          # Supabase types
└── hooks/
    ├── useAuth.ts           # Auth hook
    ├── useJourney.ts        # Journey hook
    └── useSession.ts        # Session hook
```

## 🔐 Authentication Flow

```typescript
import { signUp, signIn, signOut, getSession } from '@/api/supabaseClient';

// Register
const { user, session } = await signUp(email, password, displayName);

// Login
const { user, session } = await signIn(email, password);

// Get current session
const session = await getSession();

// Logout
await signOut();
```

## 📊 Database Usage

```typescript
import { 
  getJourneys, 
  getJourneyById, 
  createJourney,
  getProfile 
} from '@/api/supabaseClient';

// Get all public journeys
const journeys = await getJourneys({ is_public: true });

// Get journey with stops
const journey = await getJourneyById(journeyId);

// Create journey
const newJourney = await createJourney({
  title: 'My Journey',
  description: 'Amazing adventure',
  tags: ['hiking', 'nature'],
  stops: [
    {
      title: 'Start Point',
      location: { lat: 55.6761, lng: 12.5683 },
    }
  ]
});
```

## 🎨 Realtime Subscriptions

```typescript
import { getSupabaseClient } from '@/lib/supabase';

// Subscribe to session updates
const channel = getSupabaseClient()
  .channel('session-updates')
  .on(
    'postgres_changes',
    {
      schema: 'public',
      table: 'session_members',
      filter: `session_id=eq.${sessionId}`,
    },
    (payload) => {
      console.log('Session member changed:', payload);
    }
  )
  .subscribe();

// Cleanup
return () => {
  channel.unsubscribe();
};
```

## 📸 File Uploads

```typescript
import { uploadAvatar, uploadSessionPhoto } from '@/api/supabaseClient';

// Upload avatar
const { url } = await uploadAvatar(imageUri);

// Upload session photo
const photo = await uploadSessionPhoto(sessionId, photoUri, stopId);
```

## 🧪 Testing

```bash
# Run E2E tests
npm run test:e2e

# Run with visible browser
npm run test:e2e:headed

# Run in Docker (isolated)
npm run test:e2e:docker
```

## 🚀 Development

```bash
# Install dependencies
npm install

# Start Expo dev server
npm run dev:web

# Start on device
npm run android
npm run ios
```

## 📝 Migration from Backend

The previous backend (`/backend`) has been removed. All functionality is now handled by Supabase:

| Old Backend Route | New Supabase Function |
|-------------------|----------------------|
| `POST /auth/register` | `signUp()` |
| `POST /auth/login` | `signIn()` |
| `GET /journeys` | `getJourneys()` |
| `GET /journeys/:id` | `getJourneyById()` |
| `POST /journeys` | `createJourney()` |
| `POST /sessions/solo/start` | `startSoloSession()` |
| `POST /journeys/:id/reactions` | `addJourneyReaction()` |

## 🔗 Links

- **Supabase Dashboard:** https://supabase.com/dashboard/project/nligtfvaxrwtrhdvwuug
- **Docs:** https://supabase.com/docs
- **Expo Docs:** https://docs.expo.dev
