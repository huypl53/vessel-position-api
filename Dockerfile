# syntax=docker/dockerfile:1.4
# Use the official Puppeteer image (includes all dependencies and Chromium)
FROM --platform=linux/amd64 ghcr.io/puppeteer/puppeteer:latest

# Switch to root to copy files and set permissions
USER root

# Set the working directory
WORKDIR /app

# Install additional dependencies
RUN apt-get update && apt-get install -y \
    chromium \
    postgresql-client \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Build TypeScript
RUN npm run build

# Create logs directory
RUN mkdir -p /app/logs

# Set ownership to pptruser
RUN chown -R pptruser:pptruser /app

# Switch to pptruser for running the app
USER pptruser

# Expose port
EXPOSE 5001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:5001/health || exit 1

# Start script
COPY --chown=pptruser:pptruser docker-entrypoint.sh /app/
RUN chmod +x /app/docker-entrypoint.sh

ENTRYPOINT ["/app/docker-entrypoint.sh"]
