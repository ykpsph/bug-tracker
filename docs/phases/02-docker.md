# Phase 2 — Docker & Docker Compose

<img src="/docs/images/image.png" width="400" alt="alt text"><img src="/docs/images/image-1.png" width="400" alt="alt text">

## Overview

The Bug Tracker application is currently containerized using Docker. Docker is used to package the frontend and backend applications into isolated, reproducible environments, while Docker Compose is used to run the complete application stack locally.

### Current Architecture

```text
┌─────────────────┐
│ React Frontend  │
│    Container    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Spring Boot API │
│    Container    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   PostgreSQL    │
│    Container    │
└─────────────────┘
```

## What Was Implemented

### Backend Dockerfile

```dockerfile
# Stage 1: Build
FROM maven:3.9.6-eclipse-temurin-17-alpine AS build
WORKDIR /app

# Önce pom.xml'i kopyala (dependency caching için)
COPY pom.xml .
RUN mvn dependency:go-offline

# Kaynak kodları kopyala ve build et
COPY src ./src
RUN mvn clean package -DskipTests

# Stage 2: Runtime
FROM eclipse-temurin:17-jre-alpine
WORKDIR /app

# Non-root user oluştur (güvenlik best practice)
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

# Build edilmiş jar'ı kopyala
COPY --from=build /app/target/*.jar app.jar

EXPOSE 8081
ENTRYPOINT ["java", "-jar", "app.jar"]
```

The Spring Boot backend is packaged into its own Docker image.

The Dockerfile is responsible for:

* Building the application with Maven
* Packaging the Spring Boot application
* Creating the runtime container
* Exposing the application port
* Passing configuration through environment variables

### Frontend Dockerfile

```Dockerfile
# Stage 1: Build
FROM node:20-alpine AS build
WORKDIR /app

# Önce package.json'ı kopyala (dependency caching için)
COPY package*.json ./
RUN npm install

# Kaynak kodları kopyala ve build et
COPY . .
RUN npm run build

# Stage 2: Runtime
FROM nginx:alpine

# Build edilmiş dosyaları kopyala
COPY --from=build /app/dist /usr/share/nginx/html

# Nginx config'ini kopyala
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
```

The React frontend is containerized separately from the backend.

The frontend Dockerfile:

* Installs the required Node.js dependencies
* Builds the React/Vite application
* Creates the frontend container
* Exposes the required HTTP port

Keeping the frontend and backend in separate images allows them to be developed, deployed and scaled independently.

### Docker Compose

Docker Compose is used to run the complete application stack with a single configuration.

The Compose setup currently includes:

* React frontend
* Spring Boot backend
* PostgreSQL database

The services communicate through the Docker Compose network, while PostgreSQL uses a persistent volume so that database data is not lost when the container is recreated.

## Configuration

Application configuration is provided through environment variables rather than being hardcoded into the application.

Examples include:

```text
DB_URL
DB_USERNAME
DB_PASSWORD
DB_DDL_AUTO
LOG_LEVEL
SERVER_PORT
VITE_API_URL
```

Sensitive values should not be committed to the repository. An `.env.example` file can be used to document the required configuration without exposing real credentials.

## Running the Application

Build and start all services:

```bash
docker compose up --build
```

Run in detached mode:

```bash
docker compose up -d
```

Check running containers:

```bash
docker compose ps
```

View logs:

```bash
docker compose logs
```

Stop the application:

```bash
docker compose down
```

To stop the containers while keeping the database volume:

```bash
docker compose down
```

To remove the containers and associated volumes:

```bash
docker compose down -v
```

The last command should be used carefully because removing the PostgreSQL volume also removes the persisted database data.

## Next Phase

The next step is to move from running the application with Docker Compose to orchestrating the application with Kubernetes.

The Kubernetes phase will introduce Deployments, Services, ConfigMaps, Secrets, Persistent Volumes, health probes, resource management and rolling updates.
