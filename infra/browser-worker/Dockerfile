FROM mcr.microsoft.com/playwright:v1.47.0-focal

# Install Node.js and npm
RUN apt-get update && apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    npm install -g pnpm && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies (generate lockfile if needed)
RUN pnpm install

# Copy source
COPY src ./src
COPY tsconfig.json ./

# Build
RUN pnpm build

# Create non-root user
RUN groupadd -r browser && useradd -r -g browser browser
USER browser

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

EXPOSE 3000

CMD ["node", "dist/index.js"]
