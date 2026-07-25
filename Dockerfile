FROM node:22-bookworm-slim

WORKDIR /app

# Build dependencies for better-sqlite3, plus Chromium.
#
# GameStoryLog is a client-rendered SPA, so its pages are read via headless Chromium.
# We install Debian's chromium package rather than hand-listing Puppeteer's shared
# libraries: apt resolves the whole dependency tree (libcairo, pango, nss, ...),
# which a curated list inevitably gets wrong as Chromium's requirements shift.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    ca-certificates \
    fonts-liberation \
    chromium \
    && rm -rf /var/lib/apt/lists/*

# Use the apt-installed Chromium and skip Puppeteer's own download: one browser,
# with its shared libraries guaranteed by the package manager.
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Install dependencies first for caching
COPY package*.json ./
RUN npm install

# Fail the build here, not at runtime, if the browser cannot actually start.
RUN "$PUPPETEER_EXECUTABLE_PATH" --headless --no-sandbox --disable-gpu --dump-dom about:blank > /dev/null \
    && echo "Chromium OK: $($PUPPETEER_EXECUTABLE_PATH --version)"

# Copy application files
COPY . .

# Build the Vite frontend and Backend Server
RUN npm run build

# Expose port 3000
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
