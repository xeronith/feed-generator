# Step 1: Build the application
FROM node:20-alpine AS builder

# Install dependencies required for building native modules
RUN apk add --no-cache python3 make g++

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Install project dependencies
RUN npm install

# Copy the rest of the application code to the working directory
COPY . .

# Build the project
RUN npm run build

# Step 2: Create a clean production image
FROM node:20-alpine AS runner

# Install dependencies
RUN apk add --no-cache tini

# Set the working directory
WORKDIR /app

# Copy the node_modules folder from the builder stage
COPY --from=builder /app/node_modules ./node_modules

# Copy the dist folder from the builder stage
COPY --from=builder /app/dist ./dist

# Copy only the necessary files for production
COPY --from=builder /app/package*.json ./

# Create data folder
RUN mkdir ./data

ENV NODE_ENV=production
ENV FEEDGEN_PORT=3000
ENV FEEDGEN_HOSTNAME="example.com"
ENV FEEDGEN_FIREHOSE_ENABLED=true
ENV FEEDGEN_LOCAL_FIREHOSE=true
ENV FEEDGEN_MAX_INTERVAL=1

EXPOSE 3000

# Start the application
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
