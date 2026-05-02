FROM node:24-alpine AS base

FROM base AS deps
RUN apk add --no-cache libc6-compat git
WORKDIR /app

ARG OPERATOR_UI_VERSION=main
RUN git clone --depth 1 --branch ${OPERATOR_UI_VERSION} https://github.com/citrineos/citrineos-operator-ui.git /app/source

WORKDIR /app/source
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/source /app/source
WORKDIR /app/source

ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WS_URL
ARG NEXT_PUBLIC_CITRINE_CORE_URL
ARG NEXT_PUBLIC_FILE_SERVER_URL
ARG NEXT_PUBLIC_LOGO_URL=https://d1h8867rcwtfcw.cloudfront.net/logo-collapsed.svg

RUN npm run build

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/source/public ./public
RUN mkdir .next && chown nextjs:nodejs .next

COPY --from=builder --chown=nextjs:nodejs /app/source/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/source/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
