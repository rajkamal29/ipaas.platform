FROM node:24.18.0-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json .npmrc ./
RUN npm ci

COPY angular.json tsconfig*.json ./
COPY src ./src
COPY public ./public
RUN npm run build:production

FROM nginx:stable-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/ipaas-ui/browser /usr/share/nginx/html

EXPOSE 80
