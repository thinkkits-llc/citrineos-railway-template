# CitrineOS + Everest Full Stack on Railway

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/template/TEMPLATE_ID)

One-click deployment of the complete [CitrineOS](https://github.com/citrineos/citrineos-core) EV charging infrastructure stack on [Railway](https://railway.com).

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Railway Project                          │
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │ Operator UI  │───▶│   Hasura     │───▶│  PostgreSQL  │      │
│  │  (Next.js)   │    │  (GraphQL)   │    │  (PostGIS)   │      │
│  │  :3000       │    │  :8080       │    │  :5432       │      │
│  └──────────────┘    └──────────────┘    └──────┬───────┘      │
│                                                  │              │
│  ┌──────────────┐    ┌──────────────────────┐    │              │
│  │   Payment    │───▶│   CitrineOS Core     │────┘              │
│  │  (FastAPI)   │    │  (OCPP 1.6/2.0.1)   │                   │
│  │  :9010       │    │  HTTP :8080          │                   │
│  └──────────────┘    │  WS   :8081/:8082    │                   │
│                      └──────────┬───────────┘                   │
│  ┌──────────────┐               │                               │
│  │     OCPI     │───────────────┘                               │
│  │  :8085       │    ┌──────────────┐    ┌──────────────┐      │
│  └──────────────┘    │  RabbitMQ    │    │    MinIO      │      │
│                      │  :5672       │    │  :9000/:9001  │      │
│  ┌──────────────┐    └──────────────┘    └──────────────┘      │
│  │   Everest    │                                               │
│  │  (Simulator) │    ┌──────────────┐    ┌──────────────┐      │
│  │  :8888       │    │    Redis     │    │   Directus   │      │
│  └──────────────┘    │  :6379       │    │  :8055       │      │
│                      └──────────────┘    └──────────────┘      │
└─────────────────────────────────────────────────────────────────┘
```

## Services

| Service | Image / Build | Port(s) | Purpose |
|---------|--------------|---------|---------|
| **ocpp-db** | `postgis/postgis:16-3.5` | 5432 | PostgreSQL + PostGIS database |
| **amqp-broker** | `rabbitmq:3-management` | 5672, 15672 | AMQP message broker |
| **citrineos-core** | Built from [citrineos-core](https://github.com/citrineos/citrineos-core) | 8080-8083, 8443-8444 | OCPP central system |
| **graphql-engine** | `hasura/graphql-engine:v2.40.3.cli-migrations-v3` | 8080 (internal 8090) | GraphQL API over PostgreSQL |
| **minio** | `minio/minio` | 9000, 9001 | S3-compatible object storage |
| **redis** | `redis:7-alpine` | 6379 | Caching and session store |
| **citrineos-ocpi** | Built from [citrineos-ocpi](https://github.com/citrineos/citrineos-ocpi) | 8085 | OCPI protocol bridge |
| **citrineos-payment** | Built from [citrineos-payment](https://github.com/citrineos/citrineos-payment) | 9010 | Stripe payment processing |
| **operator-ui** | Built from [citrineos-operator-ui](https://github.com/citrineos/citrineos-operator-ui) | 3000 | Operator dashboard |
| **directus** | `ghcr.io/citrineos/citrineos-directus:latest` | 8055 | Content management |
| **everest** | Built from EVerest demo images | 8888 | OCPP charge point simulator |

## Environment Variables

### Required (set before deploy)

| Variable | Service | Description |
|----------|---------|-------------|
| `POSTGRES_PASSWORD` | ocpp-db | Database password |
| `STRIPE_API_KEY` | citrineos-payment | Stripe API key for payments |
| `STRIPE_ENDPOINT_SECRET_ACCOUNT` | citrineos-payment | Stripe webhook secret |
| `STRIPE_ENDPOINT_SECRET_CONNECT` | citrineos-payment | Stripe Connect webhook secret |
| `NEXTAUTH_SECRET` | operator-ui | JWT encryption secret |

### Pre-configured (auto-set via Railway reference variables)

All inter-service networking uses Railway's private networking (`*.railway.internal`). Database URLs, broker connections, and API endpoints are pre-configured using Railway reference variables — no manual wiring needed.

## Private Networking

All services communicate over Railway's private network. Public-facing services:

- **Operator UI** — Dashboard for charge point operators
- **CitrineOS Core** — OCPP WebSocket endpoint for charge points
- **Payment** — Payment frontend for EV drivers
- **Hasura** — GraphQL console (disable in production)

All other services (PostgreSQL, RabbitMQ, Redis, MinIO, Directus) are internal-only.

## Health Checks

Every service includes a health check:

| Service | Health Check |
|---------|-------------|
| ocpp-db | `pg_isready --username=citrine` |
| amqp-broker | `rabbitmq-diagnostics -q check_port_connectivity` |
| citrineos-core | TCP check on port 8080 |
| graphql-engine | `GET /healthz` |
| minio | `GET /minio/health/live` |
| redis | `redis-cli ping` |
| citrineos-payment | `GET /api/health` |
| operator-ui | TCP check on port 3000 |
| directus | `GET /server/health` |
| everest | TCP check on port 8888 |

## Volumes

| Service | Mount Point | Purpose |
|---------|-------------|---------|
| ocpp-db | `/var/lib/postgresql/data` | Database persistence |
| amqp-broker | `/var/lib/rabbitmq` | Message queue persistence |
| minio | `/data` | Object storage persistence |
| directus | `/directus/uploads` | File uploads |

## Quick Start

1. Click the **Deploy on Railway** button above
2. Set required environment variables (at minimum: `POSTGRES_PASSWORD`)
3. Wait for all services to become healthy (~3-5 minutes)
4. Access the Operator UI at the generated public domain
5. (Optional) Connect an EVerest simulator or real charge point to the OCPP WebSocket endpoint

## OCPP Versions

CitrineOS supports:
- **OCPP 1.6** — Legacy charge points
- **OCPP 2.0.1** — Current standard (default)
- **OCPP 2.1** — Latest standard

Set `OCPP_VERSION` on the Everest service to configure the simulator (`1.6`, `2.0.1`, or `2.1`).

## Production Notes

- Change all default passwords (`POSTGRES_PASSWORD`, `RABBITMQ_DEFAULT_PASS`, `MINIO_ROOT_PASSWORD`)
- Set `HASURA_GRAPHQL_ADMIN_SECRET` and disable the console (`HASURA_GRAPHQL_ENABLE_CONSOLE=false`)
- Configure real Stripe keys on the payment service
- Set `NEXTAUTH_SECRET` to a strong random value
- Consider disabling Everest simulator in production

## Links

- [CitrineOS Documentation](https://citrineos.github.io/)
- [CitrineOS GitHub](https://github.com/citrineos)
- [EVerest](https://github.com/EVerest/everest)
- [Railway Documentation](https://docs.railway.com)

## License

Apache-2.0 — matching CitrineOS upstream.
