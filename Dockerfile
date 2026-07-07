# Dukaan AI — Express dashboard + Telegram bot (single process).
# No build step: all dependencies are runtime, so we install with --omit=dev.
FROM node:20-slim

WORKDIR /app

# Install dependencies first for better layer caching.
COPY package*.json ./
RUN npm install --omit=dev

# Copy the rest of the app.
COPY . .

# App binds to process.env.PORT (default 3000).
EXPOSE 3000

CMD ["npm", "start"]
