# Use official Node.js LTS image with Python
FROM node:20-slim

# Install Python and system dependencies
RUN apt-get update && \
    apt-get install -y \
        python3 \
        python3-pip \
        python3-venv \
        chromium \
        ffmpeg \
        fonts-liberation \
        libappindicator3-1 \
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
        nano \
        tmux \
    && rm -rf /var/lib/apt/lists/*

# Set environment variable for Puppeteer to use system Chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Create app directory
WORKDIR /app

# Copy package.json and package-lock.json
# COPY package*.json ./

# Install Node.js dependencies
RUN npm install

# Set up Python virtual environment
RUN python3 -m venv /app/venv
ENV PATH="/app/venv/bin:$PATH"
# ENV ELEVENLABS_API_KEY="7e10ba7c36b325b00ff32a301b6f09d571e64dbb753b078d156874bffa6db8d8"
# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application code
# COPY . .

# # Create audio directory for file storage
# RUN mkdir -p /app/audio

# Expose the port your app runs on
EXPOSE 3333

# Start the bot
# CMD ["node", "index.js"]
CMD ["bash"]