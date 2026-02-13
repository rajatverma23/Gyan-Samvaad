# Use official Node.js LTS image
FROM node:20-slim

# Install system dependencies for FFmpeg and other required packages
RUN apt-get update && \
    apt-get install -y \
        ffmpeg \
        fonts-liberation \
        libasound2 \
        libatk-bridge2.0-0 \
        libatk1.0-0 \
        libcups2 \
        libdbus-1-3 \
        libdrm2 \
        libgbm1 \
        libgtk-3-0 \
        libnspr4 \
        libnss3 \
        libx11-xcb1 \
        libxcomposite1 \
        libxdamage1 \
        libxrandr2 \
        libxss1 \
        libxtst6 \
        lsb-release \
        xdg-utils \
        wget \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install Node.js dependencies
RUN npm install

# Copy the source code
COPY src/ ./src/

# Create necessary directories
RUN mkdir -p /app/audio /app/temp

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3333

# Expose the port your app runs on
EXPOSE 3333

# Start the application
CMD ["node", "src/app.js"]