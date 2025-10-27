#!/bin/bash
set -e

echo "Waiting for database to be ready..."
until pg_isready -h postgres -p 5432 -U postgres; do
  echo "Database is unavailable - sleeping"
  sleep 2
done

echo "Database is ready!"

echo "Running Prisma migrations..."
npx prisma migrate deploy || echo "Migration failed, continuing anyway..."

echo "Starting application..."
npm start
