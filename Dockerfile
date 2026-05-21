FROM node:22-bookworm-slim

WORKDIR /app

# Install build dependencies for better-sqlite3
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies first for caching 
COPY package*.json ./
RUN npm install

# Copy application files
COPY . .

# Build the Vite frontend and Backend Server
RUN npm run build

# Expose port 3000
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
