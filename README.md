# Bug Tracker Application

A full-stack bug tracking system with Spring Boot backend and React frontend.

## Features

- 📊 Dashboard with bug statistics and charts
- 🐛 Create, read, update, and delete bugs
- 🎯 Filter bugs by status and priority
- 📱 Responsive design with sidebar navigation
- 🔐 Mock authentication (any credentials work)
- 📈 Visual charts using Chart.js

## Technology Stack

### Backend
- Java 17
- Spring Boot 3.2.0
- Spring Data JPA
- PostgreSQL 15
- Maven

### Frontend
- React 18
- Tailwind CSS
- Chart.js
- React Hook Form
- Axios

## Quick Start with Docker

```bash
# Clone the repository
git clone <repository-url>
cd bug-tracker

# Build and run with Docker Compose
docker-compose up --build

# Access the application
# Frontend: http://localhost:3001
# Backend API: http://localhost:8081/api