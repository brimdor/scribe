FROM node:20-alpine

# Install git and build tools for native modules
RUN apk add --no-cache git python3 make g++

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev for build)
RUN npm ci

# Copy source
COPY . .

# Build frontend
RUN npm run build

# Rebuild native modules for Alpine
RUN npm rebuild better-sqlite3

# Expose port
EXPOSE 8787

# Change ownership to node user (node:1001 already exists in Alpine)
RUN chown -R node:node /app

# Run as non-root user
USER node

CMD ["node", "server/index.js"]
