FROM node:20-bookworm-slim

# Create app directory
WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=8080

# Copy server package definitions
COPY server/package*.json ./server/

# Install production dependencies only
RUN cd server && npm ci --omit=dev

# Copy server source code
COPY server/src ./server/src

# Copy built frontend assets
COPY client/dist ./client/dist

# Expose Cloud Run default port
EXPOSE 8080

# Working directory for running server
WORKDIR /app/server

# Start server
CMD ["node", "src/server.js"]
