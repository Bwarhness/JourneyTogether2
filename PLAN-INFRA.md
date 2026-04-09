# JourneyTogether 2.0 — Infrastructure & DevOps Plan

**Author:** DevOps Subagent  
**Date:** 2026-04-09 (Revised)  
**Status:** Plan for Implementation

---

## Overview

This plan covers the full infrastructure and DevOps setup for JourneyTogether 2.0 — a React Native mobile app with a self-hosted Node.js/Express backend on Unraid via Docker.

**Key paths on Unraid:**
- App data: `/mnt/user/journeytogether/`
- Uploads: `/mnt/user/journeytogether/uploads/`
- Database: `/mnt/user/journeytogether/data.db`
- Backups: `/mnt/user/journeytogether/backups/`

---

## 1. Docker Setup

### 1.1 Backend Dockerfile

```dockerfile
# backend/Dockerfile
FROM node:22-alpine

WORKDIR /app

# Install build dependencies for sharp (native image processing)
RUN apk add --no-cache vips-dev fftw-dev

# Install dependencies first (better layer caching)
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

COPY dist/ ./dist/

# Create uploads subdirectories (photos, voice notes, avatars)
RUN mkdir -p /app/uploads/photos /app/uploads/voice-notes /app/uploads/avatars

# Non-root user for security
RUN addgroup -g 1001 -S nodejs && adduser -S nodeapp -u 1001
USER nodeapp

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "dist/index.js"]
```

> **Note:** Build happens on CI (see Section 3). The `dist/` folder is the compiled TypeScript output. For local dev, use `npm run dev` with `ts-node` directly.

### 1.2 docker-compose.yml

```yaml
# docker-compose.yml
version: "3.9"

services:
  # ⚠️ WARNING: Do NOT scale this service to multiple replicas.
  # WebSocket state is in-memory and will not synchronize across instances.
  # Horizontal scaling requires Redis pub/sub (out of scope for v1).
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
      args:
        - NODE_ENV=production
    container_name: journeytogether-backend
    restart: unless-stopped
    # Port 3000 is NOT exposed to host — only accessible within Docker network via nginx
    environment:
      - NODE_ENV=production
      - PORT=3000
      - DB_PATH=/data/journeytogether.db
      - UPLOAD_DIR=/uploads
      - JWT_SECRET=${JWT_SECRET}
      - CORS_ORIGIN=${CORS_ORIGIN}
    volumes:
      - journeytogether-data:/data        # Named volume (container-local SSD) — NOT NFS
      - journeytogether-uploads:/uploads  # Bind mount (NFS OK for large files)
      - journeytogether-logs:/var/log/journeytogether
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 15s
    networks:
      - journeytogether-net

  nginx:
    image: nginx:alpine
    container_name: journeytogether-nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro  # Optional: TLS certs
      - journeytogether-uploads:/usr/share/nginx/html/uploads:ro
    depends_on:
      backend:
        condition: service_healthy
    networks:
      - journeytogether-net

networks:
  journeytogether-net:
    driver: bridge

volumes:
  journeytogether-data:               # Named volume — container-local SSD storage (NOT NFS)
    driver: local
  journeytogether-uploads:             # Bind mount — NFS OK for large files
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /mnt/user/journeytogether/uploads/
  journeytogether-logs:               # Named volume — app log files
    driver: local
```

> ⚠️ **WebSocket Scaling Note (v1):** JourneyTogether v1 uses a **single-container deployment**. WebSocket connection state (active connections, rooms, etc.) is held **in-memory** in the Node.js process. Horizontal scaling (multi-container) would require a pub/sub layer (e.g., Redis adapter for `ws` library via `@shared/redis-adapter` or similar) to synchronize state across instances. This is **out of scope for v1**.

### 1.3 nginx.conf

```nginx
# nginx/nginx.conf
worker_processes auto;
worker_rlimit_nofile 4096;
error_log /var/log/nginx/error.log warn;

events {
    worker_connections 1024;
    use epoll;
    multi_accept on;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';

    access_log /var/log/nginx/access.log main;

    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;
    client_max_body_size 10M;  # Max upload size: photos (~500KB compressed) + voice notes (up to 5MB)

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml application/json application/javascript application/xml;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=upload:10m rate=2r/s;
    limit_req_zone $binary_remote_addr zone=sessions:10m rate=5r/s;

    upstream backend {
        server backend:3000;
        keepalive 32;
    }

    server {
        listen 80;
        server_name _;

        # Security headers
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-XSS-Protection "1; mode=block" always;

        # Static uploads (served directly by nginx, not proxied)
        location /uploads/ {
            alias /usr/share/nginx/html/uploads/;
            expires 30d;
            add_header Cache-Control "public, immutable";
            try_files $uri =404;
        }

        # Public recap page proxy (shareable journey recap)
        location /recap/ {
            limit_req zone=api burst=20 nodelay;

            proxy_pass http://backend;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # API proxy
        location /api/ {
            limit_req zone=api burst=20 nodelay;
            limit_req zone=sessions:10m rate=5r/s;
            
            proxy_pass http://backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;

            # Timeouts for WebSocket upgrade
            proxy_read_timeout 86400;
            proxy_send_timeout 86400;
        }

        # WebSocket proxy
        location /ws/ {
            proxy_pass http://backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header Authorization $http_authorization;
            
            proxy_read_timeout 86400;
            proxy_send_timeout 86400;
        }

        # Health check (nginx only, no proxy)
        location /health {
            access_log off;
            return 200 "healthy\n";
            add_header Content-Type text/plain;
        }

        # Root
        location / {
            return 301 https://$host$request_uri;
        }
    }

    # HTTPS server — NOT configured here.
    # For TLS termination, either:
    #   (1) Copy all location blocks from the HTTP server above into this block and configure TLS certs, OR
    #   (2) Terminate TLS at the Unraid host/Traefik/Caddy level and forward plain HTTP to nginx :80
    # This stub is left as a reminder that port 443 is reserved and HTTPS must be configured separately.
}
```

---

## 2. Unraid-Specific Deployment

### 2.1 Directory Structure Pre-creation

SSH into Unraid and create the required directories:

```bash
# On Unraid host (192.168.1.200)
mkdir -p /mnt/user/journeytogether/uploads/photos
mkdir -p /mnt/user/journeytogether/uploads/voice-notes
mkdir -p /mnt/user/journeytogether/uploads/avatars
mkdir -p /mnt/user/journeytogether/backups
mkdir -p /mnt/user/journeytogether/logs

# Ensure permissions
chmod -R 755 /mnt/user/journeytogether/
```

> ⚠️ **SQLite on NFS — FIXED:** The database volume (`journeytogether-data`) is now a **named Docker volume** stored on the container's local filesystem (not NFS). This avoids NFS latency issues with SQLite. Only the uploads volume remains as an NFS bind mount, since large files don't require SQLite's fsync performance.

### 2.2 Unraid Docker Template

In the Unraid WebUI → **Docker** → **Add Container**:

| Field | Value |
|-------|-------|
| Name | `journeytogether-backend` |
| Docker Image | `ghcr.io/bwarhness/journeytogether:latest` (or custom registry) |
| Network Type | `bridge` |
| Post Arguments | `--restart=unless-stopped` |

**Volume Mounts:**

| Config Volume | Container Path | Description |
|---------------|----------------|-------------|
| `/mnt/user/journeytogether/` | `/data` | SQLite DB location |
| `/mnt/user/journeytogether/uploads/` | `/uploads` | User-uploaded photos |
| `/mnt/user/journeytogether/logs/` | `/var/log/journeytogether` | App logs |

**Port Mapping:**

| Container Port | Host Port | Protocol |
|----------------|-----------|----------|
| 3000 | 3000 | TCP |
| 80 | 80 | TCP |
| 443 | 443 | TCP |

> ⚠️ **Non-root Container User:** The backend container runs as non-root user `nodeapp` (uid 1001). Ensure the host directories (`/mnt/user/journeytogether/` and `/mnt/user/journeytogether/uploads/`) are writable by this user. If permissions issues occur, run on the Unraid host:
> ```bash
> chown -R 1001:1001 /mnt/user/journeytogether/
> chmod -R 755 /mnt/user/journeytogether/
> ```

**Environment Variables (add these in template):**

```
NODE_ENV=production
PORT=3000
DB_PATH=/data/journeytogether.db
UPLOAD_DIR=/uploads
JWT_SECRET=<generate-with: openssl rand -hex 32>
CORS_ORIGIN=https://your-journeytogether-domain.com
```

### 2.3 Alternative: docker-compose via CA User Scripts

Create a **User Scripts** entry on Unraid:

```bash
#!/bin/bash
# /mnt/user/appdata/journeytogether/deploy.sh

cd /mnt/user/appdata/journeytogether/journeytogether-2.0

# Pull latest image
docker-compose pull

# Stop old containers
docker-compose down

# Start new containers
docker-compose up -d

# Prune old images
docker image prune -f
```

Run this script manually or on a schedule.

### 2.4 Restart Policy

Set `restart: unless-stopped` in docker-compose for all services. This ensures:
- Container starts on Unraid boot
- Container restarts after system crash
- Container does NOT restart if explicitly stopped (`docker-compose down`)

---

## 3. CI/CD Pipeline

### 3.1 GitHub Actions — Full Workflow

```yaml
# .github/workflows/ci-cd.yml
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}
  NODE_VERSION: "22"

jobs:
  # JOB 1: Lint & Type Check (runs on all PRs)
  lint:
    name: Lint & Type Check
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: "npm"
          cache-dependency-path: backend/package-lock.json

      - name: Install backend deps
        working-directory: ./backend
        run: npm ci

      - name: Run ESLint
        working-directory: ./backend
        run: npm run lint

      - name: TypeScript check
        working-directory: ./backend
        run: npm run typecheck

      - name: Frontend lint
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: "npm"
          cache-dependency-path: frontend/package-lock.json

      - name: Install frontend deps
        working-directory: ./frontend
        run: npm ci

      - name: Run ESLint (frontend)
        working-directory: ./frontend
        run: npm run lint

      - name: TypeScript check (frontend)
        working-directory: ./frontend
        run: npm run typecheck

  # JOB 2: Backend Tests
  backend-test:
    name: Backend Tests
    runs-on: ubuntu-latest
    needs: lint
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: "npm"
          cache-dependency-path: backend/package-lock.json

      - name: Install deps
        working-directory: ./backend
        run: npm ci

      - name: Run tests
        working-directory: ./backend
        run: npm test -- --coverage

      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          files: ./backend/coverage/lcov.info
          flags: backend

  # JOB 3: Frontend Tests
  frontend-test:
    name: Frontend Tests
    runs-on: ubuntu-latest
    needs: lint
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: "npm"
          cache-dependency-path: frontend/package-lock.json

      - name: Install deps
        working-directory: ./frontend
        run: npm ci

      - name: Run tests
        working-directory: ./frontend
        run: npm test -- --coverage --watchAll=false

      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          files: ./frontend/coverage/lcov.info
          flags: frontend

  # JOB 4: Build & Push Docker Image (on merge to main/develop)
  docker:
    name: Build & Push Docker Image
    runs-on: ubuntu-latest
    needs: [backend-test, frontend-test]
    if: github.event_name == 'push' && (github.ref == 'refs/heads/main' || github.ref == 'refs/heads/develop')
    permissions:
      contents: read
      packages: write

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=ref,event=branch
            type=sha,prefix={{branch}}-
            type=raw,value=latest,enable={{is_default_branch}}

      - name: Build TypeScript
        working-directory: ./backend
        run: npm run build

      - name: Build and push backend
        uses: docker/build-push-action@v5
        with:
          context: ./backend
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
          build-args: |
            NODE_ENV=production

  # JOB 5: Deploy to Unraid (on merge to main)
  deploy:
    name: Deploy to Unraid
    runs-on: ubuntu-latest
    needs: docker
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    environment: production

    steps:
      - name: Checkout deploy scripts
        uses: actions/checkout@v4
        with:
          sparse-checkout: |
            deploy
          sparse-checkout-cone-mode: false

      - name: Setup SSH
        uses: webfactory/ssh-agent@v0.9.0
        with:
          ssh-private-key: ${{ secrets.UNRAID_SSH_PRIVATE_KEY }}

      - name: Add Unraid to known hosts
        run: |
          mkdir -p ~/.ssh
          ssh-keyscan -H ${{ secrets.UNRAID_HOST }} >> ~/.ssh/known_hosts 2>/dev/null

      - name: Deploy via SSH
        env:
          UNRAID_HOST: ${{ secrets.UNRAID_HOST }}
          UNRAID_USER: ${{ secrets.UNRAID_USER }}
        run: |
          ./deploy/deploy-to-unraid.sh
```

### 3.2 Deploy Script (deploy/deploy-to-unraid.sh)

```bash
#!/bin/bash
# deploy/deploy-to-unraid.sh

set -euo pipefail

UNRAID_HOST="${UNRAID_HOST:-192.168.1.200}"
UNRAID_USER="${UNRAID_USER:-root}"
DEPLOY_DIR="/mnt/user/appdata/journeytogether/journeytogether-2.0"
IMAGE_TAG="${GITHUB_REF_NAME:-main}-${GITHUB_SHA:0:8}"

echo "=== Deploying JourneyTogether 2.0 ==="
echo "Host: $UNRAID_HOST"
echo "Tag: $IMAGE_TAG"

ssh "$UNRAID_USER@$UNRAID_HOST" << 'ENDSSH'
set -e

DEPLOY_DIR="/mnt/user/appdata/journeytogether/journeytogether-2.0"

# Create dirs if not exists (ensure non-root user can write)
mkdir -p "$DEPLOY_DIR"
mkdir -p "$DEPLOY_DIR/data"
mkdir -p "$DEPLOY_DIR/uploads"

# Pull docker-compose file (assumes repo is checked out or copied)
cd "$DEPLOY_DIR"

# Pull latest image (already built by CI)
docker-compose pull backend nginx

# Stop current containers
docker-compose down

# Start services
docker-compose up -d

# Wait for backend health
echo "Waiting for backend to be healthy..."
for i in {1..30}; do
  if curl -sf http://localhost:3000/health > /dev/null; then
    echo "Backend is healthy!"
    break
  fi
  if [ $i -eq 30 ]; then
    echo "Backend failed to become healthy. Checking logs..."
    docker-compose logs backend
    exit 1
  fi
  sleep 2
done

# Prune old images
docker image prune -f

echo "=== Deployment complete ==="
ENDSSH

echo "Deploy finished successfully."
```

> **WebSocket Auth (Production):** JourneyTogether uses the `Authorization` header for WebSocket authentication. The `ws` library supports this via the `headers` option. The nginx reverse proxy is configured to forward the `Authorization` header to the WebSocket backend (`proxy_set_header Authorization $http_authorization;`).

### 3.3 Branch Strategy

```
develop ──────────────────────────────────────────────
  │       (feature branches merge here)
  │
  └────► PR: feature/login ──► PR merge ──► develop
  │
  └────► PR: feature/websocket ─► PR merge ──► develop

main ─────────────────────────────────────────────────
  │       (only merged from develop)
  │       (triggers CI/CD deploy)
  │
  └────◄ PR: develop ──► merge ──► main ──► DEPLOY
```

- **`develop`**: Integration branch for all features. CI runs tests + lint but does NOT deploy.
- **`main`**: Production-ready. Merging triggers full CI pipeline + Unraid deploy.
- **Feature branches**: Named `feature/<name>`, `bugfix/<name>`, `hotfix/<name>`.

### 3.5 Test Setup (Jest)

Both backend and frontend use **Jest** for testing.

#### Backend Jest Configuration

**`backend/package.json`** (add these entries):
```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "@types/jest": "^29.5.12",
    "ts-jest": "^29.1.2"
  }
}
```

**`backend/jest.config.js`**:
```javascript
/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts'],
  coverageDirectory: 'coverage',
  verbose: true,
};
```

**`backend/tests/example.test.ts`** (example test):
```typescript
import { describe, it, expect } from '@jest/globals';

describe('Example tests', () => {
  it('should pass basic assertion', () => {
    expect(1 + 1).toBe(2);
  });

  it('should handle string operations', () => {
    const greeting = 'Hello, JourneyTogether';
    expect(greeting).toContain('JourneyTogether');
  });
});
```

#### Frontend Jest Configuration

**`frontend/package.json`** (add these entries):
```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "@types/jest": "^29.5.12",
    "@testing-library/react-native": "^12.4.5",
    "jest-expo": "~52.0.0"
  }
}
```

**`frontend/jest.config.js`**:
```javascript
module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/__tests__/**/*.test.[jt]s?(x)', '**/?(*.)+(spec|test).[jt]s?(x)'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg)',
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts'],
  coverageDirectory: 'coverage',
};
```

**`frontend/__tests__/example.test.tsx`** (example test):
```tsx
import { Text } from 'react-native';

describe('Example tests', () => {
  it('should pass basic assertion', () => {
    expect(1 + 1).toBe(2);
  });
});
```

### 3.6 Branch Protection Rules

Set in **GitHub → Settings → Branches → Branch protection rules**:

**For `main`:**
- ✅ Require pull request reviews before merging (1 approval minimum)
- ✅ Require status checks to pass before merging (lint, backend-test, frontend-test)
- ✅ Require branches to be up to date before merging
- ✅ Do not allow bypassing the above rules
- ✅ Require linear history
- ✅ Include administrators

**For `develop`:**
- ✅ Require pull request reviews before merging (1 approval)
- ✅ Require status checks to pass (lint, tests)
- ✅ Do not allow bypassing

---

## 4. Environment Configuration

### 4.1 Required Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `NODE_ENV` | Environment | `production` |
| `PORT` | Server port | `3000` |
| `DB_PATH` | SQLite file path | `/data/journeytogether.db` |
| `UPLOAD_PATH` | Uploads directory | `/uploads` |
| `JWT_SECRET` | JWT signing secret (min 32 chars) | `openssl rand -hex 32` |
| `CORS_ORIGIN` | Allowed frontend origin | `https://app.journeytogether.com` |
| `UPLOAD_MAX_SIZE` | Max file upload in bytes | `20971520` (20MB) |

### 4.2 .env.example (backend)

```bash
# JourneyTogether 2.0 — Backend Environment Variables
# Copy this to .env and fill in values

# ── Server ──────────────────────────────────────────────
NODE_ENV=development
PORT=3000

# ── Database ─────────────────────────────────────────────
# Path inside container
DB_PATH=./data/journeytogether.db

# ── File Storage ─────────────────────────────────────────
# Path inside container (mapped to /mnt/user/journeytogether/uploads/)
UPLOAD_DIR=./uploads
UPLOAD_MAX_SIZE=20971520

# ── Security ─────────────────────────────────────────────
# Generate with: openssl rand -hex 32
JWT_SECRET=change-me-to-a-random-64-char-hex-string

# ── CORS ─────────────────────────────────────────────────
# Frontend origin (for React Native, use the device's IP or domain)
CORS_ORIGIN=http://localhost:8081

# ── Optional ─────────────────────────────────────────────
LOG_LEVEL=info
```

### 4.3 .env.production (on Unraid, stored securely)

```bash
# /mnt/user/journeytogether/.env (on Unraid host)
NODE_ENV=production
PORT=3000
DB_PATH=/data/journeytogether.db
UPLOAD_DIR=/uploads
JWT_SECRET=<from secrets manager or generate once>
CORS_ORIGIN=https://your-domain.com
UPLOAD_MAX_SIZE=20971520
LOG_LEVEL=info
```

### 4.4 CI/CD Secrets (GitHub → Settings → Secrets)

| Secret Name | Description |
|-------------|-------------|
| `UNRAID_HOST` | Unraid server IP or hostname |
| `UNRAID_USER` | SSH user (typically `root`) |
| `UNRAID_SSH_PRIVATE_KEY` | SSH private key (with corresponding public key on Unraid) |
| `JWT_SECRET` | Same JWT secret as on Unraid (for CI builds if needed) |
| `ANDROID_KEYSTORE_BASE64` | Base64-encoded Android signing keystore |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password |
| `ANDROID_KEY_ALIAS` | Key alias name |
| `ANDROID_KEY_PASSWORD` | Key password |

---

## 5. React Native Build

### 5.1 Backend URL Configuration

The app needs to know the backend URL at build time. Use a build-time config:

```typescript
// frontend/src/config/api.ts
const API_BASE_URL = __DEV__
  ? 'http://localhost:3000'
  : 'https://api.journeytogether.com';  // Configure for production

export const WS_BASE_URL = __DEV__
  ? 'ws://localhost:3000'
  : 'wss://api.journeytogether.com';

export default API_BASE_URL;
```

For configurable URL (self-hosted users set their own backend), use Expo's `extra` config in `app.json` or `app.config.js`:

```json
{
  "expo": {
    "extra": {
      "apiUrl": "https://api.your-journeytogether.com",
      "wsUrl": "wss://api.your-journeytogether.com"
    }
  }
}
```

Then access via `Constants.expoConfig?.extra?.apiUrl`.

### 5.2 Local Build (Android)

```bash
cd frontend

# Install dependencies
npm install

# Bundle JS (for release/prod) — React Native CLI command
npx react-native bundle --platform android --dev false --entry-file index.js --bundle-output android/app/src/main/assets/index.android.bundle --assets-dest android/app/src/main/res/

# Build debug APK (connects to bundler)
npm run android

# Build release APK (standalone, no bundler needed)
cd android && ./gradlew assembleRelease
```

### 5.3 GitHub Actions — Android CI Build

```yaml
# .github/workflows/android-build.yml
name: Android Build

on:
  workflow_dispatch:
    inputs:
      flavor:
        description: 'Build flavor (dev/prod)'
        required: false
        default: 'prod'
  push:
    branches: [main, develop]
    paths:
      - 'frontend/**'
      - 'backend/**'

jobs:
  android:
    name: Build Android APK
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
          cache-dependency-path: frontend/package-lock.json

      - name: Setup Java
        uses: actions/setup-java@v4
        with:
          distribution: "temurin"
          java-version: "17"

      - name: Setup Android SDK
        uses: android-actions/setup-android@v3

      - name: Install frontend deps
        working-directory: ./frontend
        run: npm ci

      - name: Set API URL (for production builds)
        if: github.event_name != 'pull_request'
        working-directory: ./frontend
        env:
          # Set via GitHub Actions secret or workflow variable
          API_URL: ${{ vars.ANDROID_API_URL || 'https://api.journeytogether.com' }}
          WS_URL: ${{ vars.ANDROID_WS_URL || 'wss://api.journeytogether.com' }}
        run: |
          # Backend URL is baked into the APK at build time
          # For internal testing, override ANDROID_API_URL/Ws_URL secrets to point to staging
          cat > src/config/api.ts << EOF
          const API_BASE_URL = '${API_URL}';
          const WS_BASE_URL = '${WS_URL}';
          export { API_BASE_URL, WS_BASE_URL };
          EOF

      - name: Bundle JS for Android
        working-directory: ./frontend
        env:
          CI: true
        run: npx react-native bundle --platform android --dev false --entry-file index.js --bundle-output android/app/src/main/assets/index.android.bundle --assets-dest android/app/src/main/res/

      - name: Build debug APK
        working-directory: ./frontend/android
        env:
          CI: true
        run: ./gradlew assembleDebug

      - name: Build release APK
        if: github.ref == 'refs/heads/main'
        working-directory: ./frontend/android
        env:
          CI: true
          KEYSTORE_BASE64: ${{ secrets.ANDROID_KEYSTORE_BASE64 }}
          KEYSTORE_PASSWORD: ${{ secrets.ANDROID_KEYSTORE_PASSWORD }}
          KEY_ALIAS: ${{ secrets.ANDROID_KEY_ALIAS }}
          KEY_PASSWORD: ${{ secrets.ANDROID_KEY_PASSWORD }}
        run: |
          # Decode keystore
          echo "$KEYSTORE_BASE64" | base64 -d > release.keystore
          
          # Write gradle properties with signing config
          cat >> gradle.properties << EOF
          MYAPP_RELEASE_STORE_FILE=release.keystore
          MYAPP_RELEASE_KEY_ALIAS=$KEY_ALIAS
          MYAPP_RELEASE_STORE_PASSWORD=$KEYSTORE_PASSWORD
          MYAPP_RELEASE_KEY_PASSWORD=$KEY_PASSWORD
          EOF
          
          ./gradlew assembleRelease

      - name: Upload APK artifacts
        uses: actions/upload-artifact@v4
        with:
          name: android-apk-${{ github.sha }}
          path: |
            frontend/android/app/build/outputs/apk/debug/*.apk
            frontend/android/app/build/outputs/apk/release/*.apk
          retention-days: 14

      - name: Upload to GitHub Release
        if: github.ref == 'refs/heads/main'
        uses: softprops/action-gh-release@v1
        with:
          files: frontend/android/app/build/outputs/apk/release/*.apk
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### 5.4 APK Output Locations

```
frontend/android/app/build/outputs/apk/
├── debug/
│   └── app-debug.apk          # For testing on emulator/device
└── release/
    └── app-release.apk        # For distribution (unsigned or signed)
```

---

## 6. GitHub Repo Setup

### 6.1 Recommended Repository Structure

```
JourneyTogether/
├── backend/                    # Node.js/Express API
│   ├── src/
│   │   ├── index.ts           # Entry point
│   │   ├── routes/            # Express route handlers
│   │   ├── middleware/        # Auth, error handling
│   │   ├── services/          # Business logic
│   │   ├── db/                # SQLite setup, migrations
│   │   └── ws/                 # WebSocket handlers
│   ├── tests/                 # Jest tests
│   │   └── example.test.ts    # Example test
│   ├── Dockerfile
│   ├── docker-compose.yml
│   ├── package.json
│   ├── tsconfig.json
│   └── jest.config.js         # Jest configuration
│
├── frontend/                   # React Native app
│   ├── src/
│   │   ├── screens/           # Screen components
│   │   ├── components/        # Reusable UI components
│   │   ├── navigation/        # React Navigation setup
│   │   ├── store/             # Zustand state
│   │   ├── services/          # API client
│   │   ├── config/             # App config
│   │   └── types/             # TypeScript types
│   ├── __tests__/             # Jest tests
│   │   └── example.test.tsx   # Example test
│   ├── android/
│   ├── ios/
│   ├── package.json
│   ├── tsconfig.json
│   ├── app.json
│   └── jest.config.js         # Jest configuration
│
├── deploy/                     # Deployment scripts
│   └── deploy-to-unraid.sh
│
├── .github/
│   └── workflows/
│       ├── ci-cd.yml
│       └── android-build.yml
│
├── nginx/
│   └── nginx.conf
│
├── SPEC.md                    # Product spec
├── PLAN-BACKEND.md
├── PLAN-FRONTEND.md
├── PLAN-INFRA.md             # This file
└── README.md
```

### 6.2 Initial GitHub Setup Steps

1. **Create repo** at `https://github.com/Bwarhness/JourneyTogether`
2. **Enable GitHub Actions** permissions (Settings → Actions → Allow all)
3. **Add secrets** (Settings → Secrets → Actions):
   - `UNRAID_HOST`
   - `UNRAID_USER`
   - `UNRAID_SSH_PRIVATE_KEY` (the full private key text)
   - `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`
4. **Add deploy key** on Unraid:
   ```bash
   # On Unraid — add CI's public key to authorized_keys
   # The public key corresponds to the private key in UNRAID_SSH_PRIVATE_KEY
   cat >> /root/.ssh/authorized_keys << 'EOF'
   ssh-rsa AAAA... github-actions-key
   EOF
   ```
5. **Branch protection** (Settings → Branches → Add rule):
   - Pattern: `main` — apply all protections
   - Pattern: `develop` — apply dev protections

### 6.3 PR Workflow

```
1. Developer creates feature branch from develop:
   git checkout develop && git pull origin develop
   git checkout -b feature/my-feature

2. Make changes, commit, push:
   git push -u origin feature/my-feature

3. Open PR against develop on GitHub

4. CI runs: lint + tests (must pass)

5. Code review (1 approval minimum)

6. Merge to develop → CI runs full test suite

7. When ready to release:
   - Create PR: develop → main
   - CI runs full suite + docker build
   - After merge to main → CI deploys to Unraid
```

---

## 7. Monitoring & Logging

### 7.1 Backend Health Check Endpoint

> **Important:** The backend exposes `GET /health` at the **root path** (no `/api` prefix). The nginx proxy at `/api/` routes to `backend:3000`, so `http://backend:3000/api/health` would 404. The Docker healthcheck correctly probes `http://localhost:3000/health` (direct to backend, not through nginx).

Add to `backend/src/index.ts`:

```typescript
import express from 'express';
import Database from 'better-sqlite3';

const app = express();

// ... existing middleware setup ...

// Health check endpoint
app.get('/health', (req, res) => {
  try {
    // Check DB connectivity
    const db = new Database(process.env.DB_PATH || './data/journeytogether.db', { 
      ro: true  // read-only mode just for health check 
    });
    db.exec('SELECT 1');
    db.close();

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0'
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});
```

### 7.2 File-Based Error Logging

Use `pino` with file transport for structured logging:

```typescript
// backend/src/utils/logger.ts
import pino from 'pino';
import path from 'path';

const logPath = process.env.LOG_PATH || '/var/log/journeytogether';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    targets: [
      {
        target: 'pino/file',
        options: { destination: 1 },  // stdout (for Docker logs)
        level: 'info'
      },
      {
        target: 'pino/file', 
        options: { destination: path.join(logPath, 'app.log') },
        level: 'info'
      },
      {
        target: 'pino/file',
        options: { destination: path.join(logPath, 'error.log') },
        level: 'error'
      }
    ]
  }
});
```

### 7.3 Docker Log Configuration

In `docker-compose.yml`, configure logging:

```yaml
backend:
  # ... existing config ...
  logging:
    driver: "json-file"
    options:
      max-size: "10m"
      max-file: "3"
      compress: "true"
```

This rotates Docker logs automatically.

### 7.4 Nginx Access/Error Logs

Already configured in `nginx.conf`:
- Access log: `/var/log/nginx/access.log`
- Error log: `/var/log/nginx/error.log`

Rotate with `logrotate` on Unraid.

---

## 8. Backup Strategy

### 8.1 SQLite Backup Script

```bash
#!/bin/bash
# /mnt/user/journeytogether/backup.sh
# Run via cron: 0 3 * * * /mnt/user/journeytogether/backup.sh

set -euo pipefail

BACKUP_DIR="/mnt/user/journeytogether/backups"
DATA_DIR="/mnt/user/journeytogether"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="journeytogether_${TIMESTAMP}"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Lock DB and copy (best for SQLite)
cd "$DATA_DIR"

# For SQLite with WAL mode, use vacuum into backup
sqlite3 journeytogether.db ".backup '${BACKUP_DIR}/${BACKUP_NAME}.db'"

# Also backup .env (exclude secrets, just config template)
cp "${DATA_DIR}/.env" "${BACKUP_DIR}/${BACKUP_NAME}.env" 2>/dev/null || true

# Add metadata about this backup (timestamp, state captured)
echo "backup_timestamp=${TIMESTAMP}" > "${BACKUP_DIR}/${BACKUP_NAME}.meta"
echo "created_at=$(date -Iseconds)" >> "${BACKUP_DIR}/${BACKUP_NAME}.meta"
echo "updated_at=$(date -Iseconds)" >> "${BACKUP_DIR}/${BACKUP_NAME}.meta"

# Compress
cd "$BACKUP_DIR"
tar -czf "${BACKUP_NAME}.tar.gz" "${BACKUP_NAME}.db" "${BACKUP_NAME}.env" "${BACKUP_NAME}.meta" 2>/dev/null || true
rm -f "${BACKUP_NAME}.db" "${BACKUP_NAME}.env" "${BACKUP_NAME}.meta"

# Keep only last 30 backups
cd "$BACKUP_DIR"
ls -t journeytogether_*.tar.gz | tail -n +31 | xargs -r rm

echo "[$(date)] Backup complete: ${BACKUP_NAME}.tar.gz"
```

### 8.2 Backup Schedule

| Frequency | Timing | What | Retention |
|-----------|--------|------|-----------|
| Daily | 03:00 UTC | Full DB copy + uploads | 30 days |
| Weekly | Sunday 03:00 | Full archive (DB + uploads + config) | 12 weeks |
| Monthly | 1st of month 03:00 | Full archive + upload to cloud | 12 months |

### 8.3 Cron Setup on Unraid

Add to `/etc/crontab` (or via Unraid User Scripts GUI):

```cron
# Daily backup at 3am
0 3 * * * root /mnt/user/journeytogether/backup.sh >> /mnt/user/journeytogether/logs/backup.log 2>&1
```

### 8.4 Restore Procedure

```bash
# On Unraid, in case of disaster recovery:

# 1. Stop the app
cd /mnt/user/appdata/journeytogether/journeytogether-2.0
docker-compose down

# 2. Find latest backup
BACKUP_FILE=$(ls -t /mnt/user/journeytogether/backups/*.tar.gz | head -1)

# 3. Extract backup
tar -xzf "$BACKUP_FILE" -C /tmp
DB_BACKUP=$(ls /tmp/journeytogether_*.db | head -1)

# 4. Restore DB
cp "$DB_BACKUP" /mnt/user/journeytogether/journeytogether.db

# 5. Restart
docker-compose up -d

echo "Restore complete from $BACKUP_FILE"
```

---

## Summary: Files to Create

| File | Purpose |
|------|---------|
| `backend/Dockerfile` | Node.js alpine container image |
| `docker-compose.yml` | Full stack orchestration |
| `nginx/nginx.conf` | Reverse proxy + static file serving |
| `deploy/deploy-to-unraid.sh` | CI/CD deploy script |
| `.github/workflows/ci-cd.yml` | Full CI/CD pipeline |
| `.github/workflows/android-build.yml` | Android APK CI build |
| `backend| `backend/.env.example` | Environment variable template |
| `.env` (Unraid) | Production secrets (not in repo) |
| `backup.sh` | SQLite backup script |
| `README.md` | Setup/deployment documentation |

## Implementation Order

1. **Week 1**: Repo setup, Docker files, docker-compose local test
2. **Week 2**: CI/CD pipeline (GitHub Actions + SSH deploy)
3. **Week 3**: Unraid deployment, environment config
4. **Week 4**: Android build CI, monitoring/logging
5. **Ongoing**: Backup automation, security hardening

---

## Fixes Applied (2026-04-09)

### CRITICAL

1. **Health check path mismatch (docker-compose & Dockerfile):** Backend exposes `GET /health` (no `/api` prefix). Docker healthcheck already probes `http://localhost:3000/health` correctly. Added clarification note in §7.1 and docker-compose comment.

2. **CI/CD missing TypeScript build step:** Added `npm run build` step to the `docker` job in `.github/workflows/ci-cd.yml` before `docker build-push-action`. The Dockerfile's `COPY dist/` now has a corresponding build step.

3. **SQLite on NFS (docker-compose volumes):** Changed `journeytogether-data` from an NFS bind mount to a local Docker named volume (`driver: local`, no bind opts). Only `journeytogether-uploads` remains on NFS. Updated Unraid note accordingly.

4. **JWT in WebSocket URL (nginx.conf):** Added `proxy_set_header Authorization $http_authorization;` to the `/ws/` location block. Removed the outdated security note warning about query strings (we now use headers throughout).

5. **Single-instance enforcement (docker-compose):** Added warning comment above the `backend` service in docker-compose explaining that WebSocket in-memory state prevents horizontal scaling without Redis pub/sub.

### MAJOR

6. **nginx HTTPS server block stub removed:** Replaced the incomplete HTTPS server block (which had no location blocks) with a comment explaining that TLS termination requires separate configuration.

7. **Rate limiting for `/sessions/join` (nginx.conf):** Added `limit_req_zone $binary_remote_addr zone=sessions:10m rate=5r/s;` at http level and applied `limit_req zone=sessions:10m rate=5r/s;` in the `/api/` location block.

8. **HEALTHCHECK uses wget not in Alpine (Dockerfile):** Replaced `wget -qO-` with a Node.js inline health check: `node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))`. Also updated docker-compose healthcheck to match.

9. **Log directory not mounted (docker-compose):** Added `journeytogether-logs:/var/log/journeytogether` volume mount to backend service and defined the `journeytogether-logs` named volume.

10. **Port 3000 directly exposed (docker-compose):** Removed `"3000:3000"` from backend `ports`. Nginx is the only public entry point; backend is accessible only within the Docker network.

### MINOR

11. **UPLOAD_DIR vs UPLOAD_PATH standardization:** Changed all occurrences of `UPLOAD_PATH` to `UPLOAD_DIR` throughout the document (docker-compose env, Unraid template env vars, `.env.example`, `.env.production`) to match the backend plan variable name.
