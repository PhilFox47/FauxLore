FROM node:22-bookworm-slim

WORKDIR /app

# Build dependencies for better-sqlite3, plus the shared libraries Chromium needs.
# GameStoryLog is a client-rendered SPA, so its pages are read via headless Chromium
# (bundled by Puppeteer during npm install); the slim base image lacks these libs.
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libglib2.0-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Keep Chromium inside the image at a predictable path (the default cache lives in
# $HOME, which varies by runtime user). Puppeteer reads this at install and launch.
ENV PUPPETEER_CACHE_DIR=/app/.cache/puppeteer

# Install dependencies first for caching
COPY package*.json ./
RUN npm install

# Puppeteer's postinstall normally fetches Chromium; do it explicitly so a failure
# surfaces here at build time rather than as a broken lookup at runtime.
RUN npx puppeteer browsers install chrome \
    && node -e "const p=require('puppeteer');console.log('Chromium at:',p.executablePath())"

# Copy application files
COPY . .

# Build the Vite frontend and Backend Server
RUN npm run build

# Expose port 3000
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
