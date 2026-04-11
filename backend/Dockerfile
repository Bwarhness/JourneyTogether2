FROM node:22-alpine

WORKDIR /app

# Install build dependencies for sharp (native module)
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    curl

# Copy package files
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source and build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Remove dev dependencies from node_modules (already omitted)
# but keep production deps

# Create upload directory
RUN mkdir -p /app/uploads

# Runtime environment
ENV NODE_ENV=production
ENV PORT=4000
ENV DATABASE_PATH=/app/data.db
ENV UPLOAD_DIR=/app/uploads

EXPOSE 4000

CMD ["node", "dist/index.js"]
