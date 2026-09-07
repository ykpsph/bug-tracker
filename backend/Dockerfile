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