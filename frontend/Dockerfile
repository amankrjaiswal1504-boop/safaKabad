# SafaKabad web app: build with Vite, serve with nginx (which also proxies /api).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
# Same-origin API through the nginx proxy by default.
ARG VITE_API_URL=/api
ARG VITE_WHATSAPP_NUMBER=
ARG VITE_WHATSAPP_MESSAGE="Hi SafaKabad, I need help with scrap pickup"
ENV VITE_API_URL=$VITE_API_URL VITE_WHATSAPP_NUMBER=$VITE_WHATSAPP_NUMBER VITE_WHATSAPP_MESSAGE=$VITE_WHATSAPP_MESSAGE
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
