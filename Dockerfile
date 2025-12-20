# ---- Base image ----
FROM node:20-slim

# ---- Set working directory ----
WORKDIR /opt/render/project/src

# ---- Install dependencies ----
# Copy only package files first for better caching
COPY package.json package-lock.json* ./

RUN npm install

# ---- Copy app source ----
COPY . .

# ---- Generate Prisma client ----
RUN npx prisma generate

# ---- Build the app (Vite) ----
RUN npm run build

# ---- Expose port (Render expects 10000) ----
EXPOSE 10000

# ---- Start the server ----
CMD ["node", "build/server/index.js"]
