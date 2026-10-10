FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --fetch-retries=5 --fetch-retry-factor=2 \
      --fetch-retry-mintimeout=10000 --fetch-retry-maxtimeout=120000 \
      --fetch-timeout=300000 --ignore-scripts
COPY . .
ARG VITE_GOOGLE_CLIENT_ID
ARG VITE_SITE_URL
ARG VITE_ONESIGNAL_APP_ID
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
ENV VITE_SITE_URL=$VITE_SITE_URL
ENV VITE_ONESIGNAL_APP_ID=$VITE_ONESIGNAL_APP_ID
RUN npm run build

FROM nginx:stable-alpine
ENV NGINX_ENVSUBST_FILTER='^ADMIN_URL$'
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
