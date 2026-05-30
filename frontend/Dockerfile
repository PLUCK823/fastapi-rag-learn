# ============================================================
# 阶段 1: 构建 React 应用
# ============================================================
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts ./
COPY index.html ./
COPY src/ ./src/
COPY public/ ./public/

RUN npm run build

# ============================================================
# 阶段 2: Nginx 提供静态文件 + 反向代理 API
# ============================================================
FROM nginx:alpine

# 复制构建产物
COPY --from=builder /app/dist /usr/share/nginx/html

# 复制 nginx 配置
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
