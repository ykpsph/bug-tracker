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

# Non-root user (nginx zaten non-root çalışıyor)
# Nginx default olarak 'nginx' user'ı ile çalışır

# Build edilmiş dosyaları kopyala
COPY --from=build /app/dist /usr/share/nginx/html

# Nginx config'ini kopyala
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]