# ============================================================
# 阶段 1: 构建 React 应用
# ============================================================
FROM node:22.14.0-alpine3.21 AS builder

WORKDIR /app

# 装依赖（利用 BuildKit cache mount 加速 npm）
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# 构建
COPY tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts ./
COPY index.html ./
COPY src/ ./src/
COPY public/ ./public/

RUN npm run build

# ============================================================
# 阶段 2: Nginx 提供静态文件 + 反向代理 API
# ============================================================
FROM nginx:1.27.5-alpine3.21

# 复制构建产物
COPY --from=builder /app/dist /usr/share/nginx/html

# 复制 nginx 配置（覆盖默认 server block）
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 安全加固：以 nginx 用户运行（alpine nginx 镜像内置 nginx 用户）
RUN chown -R nginx:nginx /usr/share/nginx/html /var/cache/nginx /var/log/nginx && \
    touch /var/run/nginx.pid && \
    chown nginx:nginx /var/run/nginx.pid

USER nginx

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
    CMD wget -qO- http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
