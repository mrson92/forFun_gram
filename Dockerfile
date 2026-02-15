# 1단계: 빌드용 컨테이너 (잠시 빌려 쓰기)
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
RUN npm install -D tailwindcss postcss autoprefixer 
RUN npm install recharts lucide-react
COPY . .
# 여기서 실제 웹 파일(HTML/JS)로 변환합니다.
RUN npx vite build

# 2단계: 실제 서비스용 컨테이너 (가벼운 웹서버)
FROM nginx:alpine
# 빌드된 결과물만 쏙 빼서 옮깁니다.
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]