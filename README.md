# CitrineOS + Everest Full Stack on Railway

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/template/TEMPLATE_ID)

One-click deployment of the complete [CitrineOS](https://github.com/citrineos/citrineos-core) EV charging infrastructure stack on [Railway](https://railway.com).

## Architecture

```
                          ┌──────────────────┐
            CHARGE POINTS │   nginx proxy    │ OPERATORS / DRIVERS
          ───────────────▶│   (public edge)  │◀────────────────────
          OCPP WS 1.6/2.x│   :8080          │  REST API
                          └────────┬─────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              │ Railway Private Network                  │
              │                                          │
              │  /ws/ocpp201/ ──▶ :8081  ┌────────────┐ │
              │  /ws/ocpp16/  ──▶ :8082  │ CitrineOS  │ │
              │  /ws/certs/   ──▶ :8083  │   Core     │ │
              │  /*           ──▶ :8080  │ (OCPP Hub) │ │
              │                          └─────┬──────┘ │
              │                                │        │
              │  ┌───────────┐  ┌──────────┐   │        │
              │  │ Operator  │  │  Hasura   │───┘        │
              │  │    UI     │  │ (GraphQL) │            │
              │  │ (Next.js) │  │          │            │
              │  └───────────┘  └────┬─────┘            │
              │                      │                   │
              │  ┌───────────┐  ┌────┴─────┐            │
              │  │  Payment  │  │PostgreSQL│            │
              │  │ (FastAPI) │  │(PostGIS) │            │
              │  └───────────┘  └──────────┘            │
              │                                          │
              │  ┌───────┐ ┌────────┐ ┌───────┐        │
              │  │ OCPI  │ │RabbitMQ│ │ MinIO │        │
              │  └───────┘ └────────┘ └───────┘        │
              │                                          │
              │  ┌───────┐ ┌────────┐ ┌───────────┐    │
              │  │ Redis │ │Directus│ │  Everest   │    │
              │  └───────┘ └────────┘ │(Simulator) │    │
              │                       └───────────┘    │
              └────────────────────────────────────────┘
```

**Key design decision:** Railway exposes one public port per service. The **nginx reverse proxy** is the single public entry point for charge points, routing WebSocket connections by path (`/ws/ocpp201/`, `/ws/ocpp16/`) to CitrineOS Core's internal ports. All other services communicate over Railway's private network. This avoids the multi-port limitation entirely.

## Services

| Service | Image / Build | Port(s) | Public? | Purpose |
|---------|--------------|---------|---------|---------|
| **nginx** | `nginx:1.27-alpine` | 8080 | **Yes** | Reverse proxy — single public entry for OCPP WS + REST |
| **citrineos-core** | Built from [citrineos-core](https://github.com/citrineos/citrineos-core) | 8080-8083, 8443-8444 | No | OCPP central system (HTTP + WebSocket) |
| **ocpp-db** | `postgis/postgis:16-3.5` (Railway plugin) | 5432 | No | PostgreSQL + PostGIS database |
| **amqp-broker** | `rabbitmq:3-management` (Railway plugin) | 5672, 15672 | No | AMQP message broker |
| **graphql-engine** | `hasura/graphql-engine:v2.40.3.cli-migrations-v3` | 8080 | Optional | GraphQL API over PostgreSQL |
| **minio** | `minio/minio` | 9000, 9001 | No | S3-compatible object storage |
| **redis** | `redis:7-alpine` | 6379 | No | Caching and session store |
| **citrineos-ocpi** | Built from [citrineos-ocpi](https://github.com/citrineos/citrineos-ocpi) | 8085 | No | OCPI protocol bridge |
| **citrineos-payment** | Built from [citrineos-payment](https://github.com/citrineos/citrineos-payment) | 9010 | **Yes** | Stripe payment processing + driver UI |
| **operator-ui** | Built from [citrineos-operator-ui](https://github.com/citrineos/citrineos-operator-ui) | 3000 | **Yes** | Operator dashboard |
| **directus** | `ghcr.io/citrineos/citrineos-directus:latest` | 8055 | Optional | Content management for scan-and-charge |
| **everest** | `ghcr.io/everest/everest-demo/manager` | 8888 | No | OCPP charge point simulator |
| **extensions-service** | Custom (Node.js) | 3001 | No | Example extension — RabbitMQ consumer + Core API |

## Solving the Multi-Port Problem

Railway exposes **one port per service**. CitrineOS Core needs multiple ports:
- `:8080` — REST/Data API
- `:8081` — OCPP 2.0.1 / 2.1 WebSocket
- `:8082` — OCPP 1.6 WebSocket
- `:8083` — Certificate management WebSocket

**Solution:** An nginx reverse proxy runs as the single public-facing service with path-based routing:

| Path | Routes to | Protocol |
|------|-----------|----------|
| `/ws/ocpp201/{chargeBoxId}` | `citrineos-core:8081` | WebSocket |
| `/ws/ocpp16/{chargeBoxId}` | `citrineos-core:8082` | WebSocket |
| `/ws/certificates/` | `citrineos-core:8083` | WebSocket |
| `/*` | `citrineos-core:8080` | HTTP |

Charge points connect to: `wss://your-nginx-domain.railway.app/ws/ocpp201/CP001`

WebSocket timeouts set to 24h for persistent OCPP connections.

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

- **nginx** — Single public entry for charge points (OCPP WS) and REST API consumers
- **Operator UI** — Dashboard for charge point operators
- **Payment** — Payment frontend for EV drivers
- **Hasura** — GraphQL console (disable in production)

All other services (PostgreSQL, RabbitMQ, Redis, MinIO, Core, OCPI, Directus, Everest) are internal-only.

## Health Checks

Every service includes a health check:

| Service | Health Check |
|---------|-------------|
| nginx | `GET /nginx-health` |
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
| extensions-service | `GET /health` |

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
5. Connect a charge point to `wss://<nginx-domain>/ws/ocpp201/<chargeBoxId>`
6. (Optional) The Everest simulator auto-connects to Core on the private network

## OCPP Versions

CitrineOS supports:
- **OCPP 1.6** — Legacy charge points → connect via `/ws/ocpp16/`
- **OCPP 2.0.1** — Current standard (default) → connect via `/ws/ocpp201/`
- **OCPP 2.1** — Latest standard → connect via `/ws/ocpp201/`

Set `OCPP_VERSION` on the Everest service to configure the simulator (`1.6`, `2.0.1`, or `2.1`).

## Security Notes

Security profiles 0 and 1 (no TLS / basic auth) work out of the box. Profiles 2/3 (mTLS) require TLS termination at the client level — Railway terminates TLS at the edge, so mTLS passthrough is not natively supported. For production mTLS, consider a TCP proxy or VPN overlay.

## Production Checklist

- [ ] Change all default passwords (`POSTGRES_PASSWORD`, `RABBITMQ_DEFAULT_PASS`, `MINIO_ROOT_PASSWORD`)
- [ ] Set `HASURA_GRAPHQL_ADMIN_SECRET` and disable the console
- [ ] Configure real Stripe keys on the payment service
- [ ] Set `NEXTAUTH_SECRET` to a strong random value
- [ ] Disable Everest simulator (remove the service or stop it)
- [ ] Set `CONFIG_CITRINEOS_WIPE_FILE_ON_START=false` on Core
- [ ] Set `HASURA_GRAPHQL_DEV_MODE=false`

## Extensions Service — Building Custom Integrations

The `extensions-service/` directory contains a minimal working example of a CitrineOS extension that:

1. **Consumes OCPP events** from RabbitMQ (TransactionEvent, StatusNotification, MeterValues, BootNotification)
2. **Calls CitrineOS Core APIs** to query station data
3. **Exposes health + metrics endpoints** for Railway monitoring

### How It Works

```
RabbitMQ (citrineos exchange)
    │
    ├── TransactionEvent ──▶ extensions-service ──▶ Core Data API
    ├── StatusNotification ─▶ extensions-service
    ├── MeterValues ────────▶ extensions-service
    └── BootNotification ───▶ extensions-service
```

CitrineOS Core publishes all OCPP messages to RabbitMQ using the `citrineos` exchange with `headers` routing. The extensions service binds to specific message types via header matching.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AMQP_URL` | `amqp://guest:guest@amqp-broker.railway.internal:5672` | RabbitMQ connection string |
| `AMQP_EXCHANGE` | `citrineos` | Exchange name (must match Core config) |
| `QUEUE_NAME` | `extensions-service` | Queue name for this service |
| `CITRINEOS_API_URL` | `http://citrineos-core.railway.internal:8080` | Core API base URL |
| `PORT` | `3001` | HTTP server port |

### Extending

To add your own business logic:

1. **Add routing keys** — Edit `ROUTING_KEYS` array in `src/index.js` to subscribe to additional OCPP actions
2. **Add handlers** — Create handler functions for new actions in the switch statement
3. **Call Core APIs** — Use `callCoreAPI(path)` to interact with CitrineOS:
   - `GET /data/monitoring/chargingStations` — List all stations
   - `POST /ocpp/{stationId}/remoteStart` — Remote start a transaction
   - `GET /data/transactions` — List transactions
   - See [CitrineOS API docs](https://citrineos.github.io/) for full API reference

4. **Add dependencies** — Install additional packages:
   ```bash
   cd extensions-service
   npm install axios ioredis  # example: HTTP client + Redis
   ```

### Example Use Cases

- **Fleet alerts**: Notify when a station goes offline (StatusNotification → Faulted)
- **Billing**: Calculate costs on TransactionEvent.Ended, post to external billing system
- **Load balancing**: Monitor MeterValues, adjust charging profiles via SetChargingProfile
- **Access control**: Custom authorization logic before RemoteStart
- **Analytics**: Stream events to a data warehouse (BigQuery, ClickHouse, etc.)

## Deployment Steps

1. Fork this repository
2. Go to [Railway Dashboard](https://railway.com/dashboard) → New Project → Deploy from GitHub
3. For each service directory, create a Railway service pointed at the corresponding subdirectory:
   - Set **Root Directory** to the service folder (e.g., `citrineos-core`, `nginx`, `redis`)
   - Railway will detect the `railway.toml` and `Dockerfile` automatically
4. Add Railway plugins for **PostgreSQL** (PostGIS) and optionally **Redis** if you prefer managed
5. Set required environment variables (see table above)
6. Wait for all services to become healthy (~3-5 minutes)
7. Test: connect a charge point or use the Everest simulator

### Recommended Deploy Order

1. PostgreSQL (plugin) + Redis + RabbitMQ + MinIO (infrastructure, no deps)
2. CitrineOS Core (depends on Postgres + RabbitMQ + MinIO)
3. Hasura GraphQL Engine (depends on Core being healthy for migrations)
4. Directus, OCPI, Payment, Operator UI (depend on Core + Postgres)
5. Extensions Service (depends on RabbitMQ + Core)
6. Everest (depends on Core WebSocket port)
7. nginx (depends on Core being up for proxy)

## Links

- [CitrineOS Documentation](https://citrineos.github.io/)
- [CitrineOS GitHub](https://github.com/citrineos)
- [EVerest](https://github.com/EVerest/everest)
- [Railway Documentation](https://docs.railway.com)

## License

Apache-2.0 — matching CitrineOS upstream.
