# LogisTech – Technical Architecture Document

**Project Work Universitario**  
**Ruolo:** Senior Cloud & Infrastructure Architect  
**Data:** Marzo 2026  
**Versione:** 2.0 (Revisione Operativa)

---

## Executive Summary

Il presente documento descrive l'architettura tecnico-infrastrutturale di **LogisTech**, nuova azienda di logistica progettata per competere nel mercato italiano B2C della consegna pacchi. L'analisi si basa su parametri tecnici quantificabili: throughput, latenza, banda, capacità computazionale, ridondanza e scalabilità.

**Baseline unica di dimensionamento:**

- **700.000 ordini/giorno** (target competitivo)
- **850.000 pacchi/giorno** (rapporto 1,21 pacchi/ordine)
- **10-12 Fulfillment Center** sul territorio nazionale
- **35.000-40.000 operatori logistici** (hub + flotta mobile)
- **40.000 dispositivi IoT per FC** (scanner, robot, sensori)

**Contesto mercato italiano 2025:**

- Mercato totale: ~2,4M pacchi/giorno (tutti gli operatori)
- Amazon Italia: ~28,4% quota nazionale
- Crescita settore: +5,7% anno su anno

LogisTech adotta un'architettura ibrida Cloud-Edge che integra **AWS Region eu-south-1 Milano** con infrastruttura on-premise nei magazzini per garantire latenze sub-20ms per robotica e gestire picchi stagionali con elasticità automatica.

---

## 1. Obiettivi di Business e Perimetro del Progetto

### 1.1 Obiettivi di Business

- Conquistare **15-20% quota mercato italiano** entro 5 anni (equivalente a 700K-950K ordini/giorno)
- Competere con operatori consolidati su **velocità consegna** (1-2 giorni standard, same-day per aree urbane)
- Garantire **SLA delivery >95%** on-time
- Mantenere **costi operativi competitivi** vs benchmark di settore

### 1.2 Perimetro Operativo

**Geografia:**
- Territorio nazionale italiano
- Copertura urbana: 60+ città principali
- Copertura rurale: zone interne Appennino e isole con partner carrier

**Infrastruttura Fisica:**
- 10-12 Fulfillment Center strategici (Milano, Roma, Torino, Napoli, Bologna, Firenze, Bari, Palermo, Verona, Padova, Genova, Catania)
- 60+ hub di smistamento secondari
- Flotta mobile: 15.000-18.000 autisti DSP + 3.000-5.000 autisti Flex

**Servizi al Cliente:**
- Tracking real-time pacchi
- Notifiche proattive (ordine spedito, in consegna, consegnato)
- Finestre di consegna modificabili (slot delivery 1h)
- Proof of Delivery digitale (firma + foto)

---

## 2. Assunzioni di Carico e Baseline Quantitativa

### 2.1 Volumi Operativi Giornalieri (Baseline)

| Metrica | Valore Target | Derivazione |
|---------|--------------|-------------|
| **Ordini elaborati/giorno** | 700.000 | Baseline unica |
| **Pacchi spediti/giorno** | 850.000 | 700K × 1,21 (multi-item) |
| **Ordini/ora media** | 29.167 | 700K / 24h |
| **Ordini/minuto media** | 486 | 700K / 1440 min |
| **Ordini/secondo media** | 8,1 | 700K / 86.400 sec |
| **Picco orario (sera 19-22)** | +60% → 13 ord/sec | Peak capacity |
| **Picco stagionale (Natale)** | +80% → 1,26M ord/giorno | Black Friday, Prime Day |

**Nota metodologica:** Tutti i calcoli successivi derivano da questa baseline. I picchi sono espressi come moltiplicatori della baseline (es. +60% = 700K × 1,6 = 1,12M ordini/giorno).

### 2.2 Richieste API al Secondo

**Derivazione da baseline 700K ordini/giorno:**

- Ogni ordine genera **mediamente 15 API calls** nel ciclo di vita (creazione, tracking, routing, WMS, notifiche)
- Totale API calls/giorno: 700K × 15 = **10,5M API calls/giorno**
- API calls/secondo media: 10,5M / 86.400 = **~122 req/sec**
- Considerando pattern non uniforme e overhead infrastrutturale: **throughput API layer target 500-700 req/sec** (4-6× media per gestire picchi orari)
- Capacità picco: **2.000 req/sec** (con auto-scaling)

**Breakdown per endpoint:**

| Endpoint | % Traffico | Req/Sec Normale | Req/Sec Picco |
|----------|-----------|-----------------|---------------|
| **GET /tracking/status** | 55% | 275-385 | 1.100 |
| **POST /orders/create** | 10% | 50-70 | 200 |
| **POST /deliveries/scan** | 20% | 100-140 | 400 |
| **GET /routing/calculate** | 8% | 40-56 | 160 |
| **POST /wms/inventory** | 7% | 35-49 | 140 |

### 2.3 Eventi IoT e Telemetria

**Per FC (40.000 dispositivi):**

- Scanner barcode: 24.000 unità × 1 evento/30sec = 800 eventi/sec
- Robot AMR: 30.000 unità × 1 telemetria/10sec = 3.000 eventi/sec
- Sensori nastri: 5.000 unità × 1 lettura/5sec = 1.000 eventi/sec
- **Totale per FC: ~4.800 eventi/sec**

**Per 12 FC: 57.600 eventi/sec → ~58K eventi/sec**

**Banda upstream:** 58K eventi/sec × 0,5 KB/evento = 29 MB/sec ≈ **232 Mbps throughput telemetria totale**

### 2.4 Volume Dati Storage

**Derivazione da baseline 700K ordini/giorno:**

| Fonte Dati | Dimensione Record | Volume Giorno | Volume Anno | Tier Storage |
|-----------|------------------|---------------|-------------|-------------|
| **Ordini clienti** | 2 KB/ordine | 1,4 GB | 511 GB | Aurora hot |
| **Eventi tracking pacchi** | 500 byte × 5 eventi/pacco | 2,1 GB | 767 GB | DynamoDB hot 90d → S3 cold |
| **Log applicativi** | 500 byte/log | 2,5 GB | 912 GB | CloudWatch → S3 IA |
| **Telemetria IoT** | 200 byte/evento | 100 GB | 36,5 TB | Kinesis → S3 Parquet |
| **Video sorveglianza** | 1 Mbps × 1.440 cam × 12 FC | 15 TB | 5,4 PB | S3 Glacier Deep Archive |
| **Backup database** | Incrementale 10% daily Aurora | 2 TB | 730 TB | EBS Snapshots + S3 cross-region |

**Totale stimato:**
- Dati operativi hot: **~105 GB/giorno** → **~38 TB/anno**
- Dati cold (backup, video, archivi): **~17 TB/giorno** → **~6,2 PB/anno**

---

## 3. Requisiti Non Funzionali

### 3.1 SLA e Disponibilità

| Servizio | Uptime Target | Downtime Massimo/Anno | Strategia HA |
|----------|--------------|----------------------|-------------|
| **API Gateway** | 99,95% | 4,38 ore | Multi-AZ Active-Active |
| **Order Processing** | 99,9% | 8,76 ore | Multi-AZ + DR Warm Standby |
| **Tracking Service** | 99,95% | 4,38 ore | Multi-AZ + Global Table DynamoDB |
| **WMS (magazzino)** | 99,5% | 43,8 ore | Multi-AZ + Edge autonomia 4h |
| **Database Aurora** | 99,99% | 52,6 minuti | Multi-AZ + Cross-Region Replica |

### 3.2 Latenze Target (SLA Operativi)

| Operazione | Latenza Target | Percentile | Motivazione |
|-----------|---------------|-----------|-------------|
| **Scansione barcode + DB update** | <200ms | p99 | Evitare congestione nastri fisici |
| **API tracking status (GET)** | <100ms | p95 | UX app clienti e autisti |
| **Routing calculation (POST)** | <500ms | p95 | Assegnazione dinamica consegne |
| **Query inventario WMS** | <150ms | p90 | Prevenire errori picking |
| **Event ingestion (Kafka/SQS)** | <50ms | p99 | Sincronizzazione code digitali-fisiche |
| **Robot AMR control loop** | <12ms | p99 | Collision avoidance real-time |

### 3.3 Resilienza e Fault Tolerance

**Recovery Objectives per Tier:**

| Service Tier | RTO Target | RPO Target | Strategy |
|--------------|-----------|-----------|----------|
| **Tier 1 (Mission-Critical)** | 15 min | Near-Zero (<1 min) | Active-Active Multi-Region |
| **Tier 2 (Business-Critical)** | 4 ore | 2 ore | Warm Standby DR |
| **Tier 3 (Non-Critical)** | 24 ore | 4 ore | Backup/Restore da S3 |

**Esempi:**
- Tier 1: API Gateway, Order Processing, Tracking
- Tier 2: Database Aurora, WMS
- Tier 3: Analytics Redshift, Log storici

### 3.4 Sicurezza e Compliance

**Principi Architetturali:**

1. **Zero Trust Network:** Nessuna fiducia implicita, autenticazione e autorizzazione per ogni richiesta
2. **Defense in Depth:** Multiple layer di sicurezza (WAF, Security Groups, NACLs, IAM, Encryption)
3. **Least Privilege:** Permessi minimi necessari per funzione specifica
4. **Audit Trail:** Log completi di tutte le operazioni critiche (retention 7 anni)

**Implementazione:**

- **IAM:** Role-based access control (RBAC) con AWS IAM, MFA obbligatorio per utenti privilegiati
- **Encryption at rest:** KMS per RDS, DynamoDB, S3, EBS (chiavi managed per servizio)
- **Encryption in transit:** TLS 1.3 per tutte le comunicazioni API, mTLS per inter-service communication
- **Secret Management:** AWS Secrets Manager per credenziali DB, API key, certificati
- **WAF:** AWS WAF su CloudFront e ALB per protezione OWASP Top 10
- **DDoS Protection:** AWS Shield Standard (incluso) + Shield Advanced per Tier 1
- **Network Segmentation:** VPC isolation, subnet private per DB/compute, subnet pubbliche solo per ALB
- **Vulnerability Scanning:** AWS Inspector per scanning EC2/container, Snyk per dependency scanning

**Compliance:**

- **GDPR:** Data residency Italia (Region eu-south-1), encryption, data retention policies, right to erasure
- **PCI-DSS:** Payment processing via Stripe/PayPal (no card data stored), tokenization
- **ISO 27001:** Framework sicurezza informazioni (target certificazione anno 2)

---

## 4. Architettura Target End-to-End

### 4.1 Panoramica High-Level

**Modello Ibrido Cloud-Edge:**

```
┌─────────────────────────────────────────────────────────────┐
│                      FRONTEND LAYER                         │
│  - App Autisti (React Native, 50K install)                 │
│  - WebApp Clienti (React SPA, 100K concurrent users)       │
│  - Dashboard Hub Ops (Angular, 3K operatori)               │
└────────────────────┬────────────────────────────────────────┘
                     │ HTTPS/REST/GraphQL
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                    API GATEWAY LAYER                        │
│  AWS API Gateway + Kong (500-1.000 istanze)                │
│  - Authentication (Cognito JWT)                             │
│  - Rate Limiting (10K req/sec burst)                        │
│  - Request/Response transformation                          │
└────────────────────┬────────────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        ▼                         ▼
┌─────────────────┐      ┌─────────────────┐
│ BACKEND LAYER   │      │ MESSAGING LAYER │
│ (Microservizi)  │◄────►│ (Event Bus)     │
│                 │      │                  │
│ - Routing       │      │ - Kafka MSK     │
│ - Tracking      │      │ - SQS           │
│ - WMS           │      │ - EventBridge   │
│ - Notification  │      │ - SNS           │
│ - Auth          │      │                  │
│ - Analytics     │      │                  │
└────────┬────────┘      └─────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│                       DATA LAYER                            │
│  - PostgreSQL Aurora (ordini ACID)                          │
│  - DynamoDB (tracking NoSQL)                                │
│  - Redis ElastiCache (session cache)                        │
│  - S3 + Redshift (data lake + BI)                           │
└─────────────────────────────────────────────────────────────┘

         ▲ AWS Direct Connect 10-100 Gbps
         │ Latency: 10-15ms
         ▼
┌─────────────────────────────────────────────────────────────┐
│                    EDGE LAYER (per FC)                      │
│  - AWS Outposts (local compute)                             │
│  - IoT Greengrass (gateway aggregazione)                    │
│  - Panorama Appliance (computer vision)                     │
│  - Local DB cache (PostgreSQL read replica)                 │
│                                                              │
│  40.000 IoT devices: scanner, robot AMR, sensori           │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Frontend Layer

**App Autisti (Driver Mobile Application):**

- **Stack:** React Native 0.72 (iOS + Android, single codebase)
- **Offline-first:** Redux Persist + SQLite local DB, sync differenziale quando online
- **Maps:** Mapbox SDK con offline maps pre-download per zone rurali
- **Real-time:** WebSocket nativo + MQTT fallback per push notifications
- **Concurrent users:** 10K autisti attivi simultaneamente
- **GPS update frequency:** Ogni 10 secondi → 1K update/sec → Kinesis stream
- **Offline buffer size:** Max 500 eventi (SQLite 50 MB), batch sync quando online

**WebApp Clienti (Customer Tracking Portal):**

- **Stack:** React 18 + Next.js 14 (SSR per SEO)
- **UI Library:** Tailwind CSS + shadcn/ui components
- **Real-time tracking:** Socket.io client, polling fallback 15s
- **CDN Strategy:** CloudFront per static assets (TTL 1 anno), API responses cacheable (TTL 10s)
- **Concurrent users:** 100K clienti tracking simultaneo
- **Page load time:** <2s p95

**Dashboard Hub Operations:**

- **Stack:** Angular 17 + RxJS (reactive data streams)
- **Charting:** Apache ECharts (real-time time-series)
- **3D visualization:** Three.js per digital twin magazzino
- **Concurrent operators:** 3K supervisori hub
- **Dashboard refresh rate:** 10 secondi via WebSocket stream
- **KPI metriche:** Throughput pacchi/ora, SLA compliance %, equipment health, labor productivity

### 4.3 API Gateway Layer

**Tecnologia:** AWS API Gateway (managed) + Kong (self-hosted per custom logic)

**Responsabilità:**
- Single entry point per tutte le API
- Autenticazione JWT (Cognito token validation)
- Rate limiting per prevenire abuse (1.000 req/min per utente, 10.000 req/sec burst totale)
- Request/response transformation
- CORS handling per webapp
- Logging centralizzato (CloudWatch Logs)

**Configurazione:**

| Parametro | Valore | Motivazione |
|-----------|--------|-------------|
| **Throttling limit** | 10.000 req/sec burst | Protezione backend da spike improvvisi |
| **Steady-state rate** | 5.000 req/sec | Throughput normale 500-700 req/sec, margine 7× |
| **Request timeout** | 29 secondi | Lambda max timeout 30s, buffer 1s |
| **Payload size limit** | 10 MB | Upload foto POD/firma digitale |
| **Caching TTL** | 10-300 secondi | Variabile per endpoint (tracking 10s, static 300s) |

**Dimensionamento:**
- API Gateway: managed service, auto-scaling
- Kong self-hosted: 50-100 istanze M5.large (2 vCPU, 8 GB RAM) per custom logic

### 4.4 Backend Microservizi

**Principi Architetturali:**

1. **Domain-Driven Design (DDD):** Ogni microservizio possiede bounded context autonomo
2. **Event-Driven Architecture:** Comunicazione asincrona via Kafka/EventBridge per disaccoppiamento
3. **Database per microservizio:** Polyglot persistence (SQL per ordini, NoSQL per tracking, Graph per inventory)
4. **API Gateway centralizzato:** Single entry point per autenticazione, rate limiting, logging
5. **Observability:** CloudWatch + X-Ray per tracing distribuito

#### 4.4.1 Microservizio Routing (Route Optimization Engine)

**Responsabilità:**
- Calcolo percorsi ottimali per autisti (TSP - Traveling Salesman Problem variant)
- Assegnazione dinamica consegne in base a traffico real-time
- Ricalcolo route on-the-fly per nuovi ordini urgenti

**Stack tecnologico:**
- **Linguaggio:** Python 3.11 (scikit-learn, OR-Tools Google)
- **Framework:** FastAPI (async, type hints, OpenAPI auto-gen)
- **Algoritmo:** Google OR-Tools CP-SAT Solver (Constraint Programming)
- **Container:** Docker, deployment su ECS Fargate
- **Scaling:** HPA target 70% CPU, min 10 pods, max 100 pods

**Infrastruttura:**

| Componente | Spec | Quantità |
|-----------|------|----------|
| **ECS Fargate Task** | 4 vCPU, 8 GB RAM | 50 task (picco 200) |
| **Redis Cache** | r6g.xlarge (13 GB RAM) | 3 nodi cluster mode |
| **External API** | Google Maps Directions API | 1M request/day quota |

**Compute time:** <500ms per route 150 fermate (target SLA)

#### 4.4.2 Microservizio Tracking (Telemetry & Status Management)

**Responsabilità:**
- Ingestione eventi da scanner, GPS, IoT sensors
- Aggiornamento stato pacco in tempo reale
- API query tracking per clienti e dashboard

**Stack tecnologico:**
- **Linguaggio:** Node.js 20 (event-driven, non-blocking I/O)
- **Framework:** Express.js + Socket.io (WebSocket)
- **Database:** DynamoDB (chiave primaria: package_id, sort key: timestamp)
- **Caching:** Redis con TTL 300s per hot tracking queries

**Event ingestion pipeline:**

```
Scanner/GPS → API Gateway → Kinesis Data Streams → Lambda Consumer
→ DynamoDB BatchWriteItem → DynamoDB Streams Trigger
→ Lambda WebSocket Push → API Gateway WebSocket Connections
→ Cliente App (riceve update real-time)
```

**Infrastruttura:**

| Metrica | Valore | Configurazione |
|---------|--------|---------------|
| **Eventi/secondo** | 5K normali, 50K picco | Kinesis 50 shards (1 MB/s/shard) |
| **DynamoDB write** | 500 WCU base, 5K max | On-demand pricing con reserved capacity |
| **Lambda concurrency** | 1.000 concurrent exec | Provisioned concurrency 500 warm |
| **WebSocket connections** | 5K simultanee | API Gateway WebSocket 1M messages/day |

#### 4.4.3 Microservizio WMS (Warehouse Management System)

**Responsabilità:**
- Gestione inventory magazzino (stoccaggio, picking, packing)
- Assegnazione task operatori (wave picking)
- Controllo nastri trasportatori e robot AMR

**Stack tecnologico:**
- **Linguaggio:** Java 17 + Spring Boot 3 (robustezza enterprise)
- **Framework:** Spring Cloud (service discovery, config server)
- **Database:** PostgreSQL Aurora (transazioni ACID)
- **Message Queue:** RabbitMQ (task queue operatori)

**Workflow picking:**

1. Ordine arriva → WMS calcola bin location ottimale (algoritmo SLOTTING)
2. Task pubblicato su RabbitMQ queue `picking-tasks`
3. Operatore con scanner preleva messaggio → scan bin → scan articolo
4. Evento "picked" pubblicato → WMS aggiorna inventory (-1)
5. Se ordine multi-item, task successivo nella stessa wave
6. Quando ordine completo, pacco va su nastro trasportatore → scan out

**Infrastruttura per FC:**

| Componente | Spec | Quantità |
|-----------|------|----------|
| **ECS Service** | c6i.2xlarge (8 vCPU, 16 GB) | 10 container (HPA max 50) |
| **PostgreSQL Aurora** | db.r6g.2xlarge (8 vCPU, 64 GB) | 1 writer + 3 read replicas |
| **RabbitMQ** | m5.large (2 vCPU, 8 GB) | 3 nodi cluster HA |

### 4.5 Messaging e Event Bus

**Strategia Multi-Tool:** Non esiste un messaging unico. Ogni tecnologia ha ruolo specifico.

#### 4.5.1 Apache Kafka su Amazon MSK

**Use cases:**
- Event streaming per tracking pacchi (topic: `package-tracking`)
- Eventi IoT sensori magazzino (topic: `iot-telemetry`)
- Order processing pipeline (topic: `order-created`, `order-shipped`)
- Change Data Capture (CDC) da Aurora a DynamoDB (topic: `db-changes`)

**Configurazione cluster:**

| Parametro | Valore | Motivazione |
|-----------|--------|-------------|
| **Broker nodes** | 6 nodi kafka.m5.2xlarge | 8 vCPU, 32 GB RAM per high-throughput |
| **Replication factor** | 3 | Tolleranza failure 2 broker simultanei |
| **Partitions per topic** | 12-24 partitions | Parallelizzazione consumer, target 500 msg/sec/partition |
| **Retention period** | 7 giorni hot, 90 giorni S3 | Compliance audit trail |
| **Compression** | Snappy | Riduzione bandwidth 50%, CPU overhead minimo |

**Topic design example:**

- **Topic:** `package-tracking`
- **Partitions:** 12
- **Replication:** 3
- **Retention:** 7 giorni
- **Key:** package_id (garantisce ordine eventi per stesso pacco)

**Consumer groups:**
- `tracking-service`: 12 consumer instances (1 per partition) → write DynamoDB
- `analytics-service`: 6 consumer instances → aggregate metrics → Redshift
- `notification-service`: 3 consumer instances → filter eventi critici → SNS push

#### 4.5.2 Amazon SQS (Simple Queue Service)

**Use cases:**
- Task queue operatori (picking, packing) → decoupling WMS da worker
- Dead Letter Queue (DLQ) per eventi falliti Kafka
- Retry queue con exponential backoff per API esterne (Google Maps)

**Configurazione:**

| Parametro | Valore | Motivazione |
|-----------|--------|-------------|
| **Queue type** | Standard | Throughput illimitato, best-effort ordering |
| **Message retention** | 4 giorni | Retry window per task falliti |
| **Visibility timeout** | 30 secondi | Worker processing time, poi message torna in queue |
| **Max message size** | 256 KB | Payload task picking (bin location, articoli) |
| **DLQ threshold** | 3 receive count | Dopo 3 fallimenti → routing to DLQ per debug |

#### 4.5.3 Amazon EventBridge

**Use cases:**
- Event routing cross-service (Routing Service → WMS Service)
- Scheduled events (cron job: batch analytics ogni ora)
- Integration con servizi AWS (S3 → Lambda, DynamoDB Streams → Lambda)

**Throughput:** 10.000 eventi/sec per event bus

#### 4.5.4 Amazon SNS (Simple Notification Service)

**Use cases:**
- Notifiche push app mobile (ordine spedito, in consegna, consegnato)
- Notifiche email clienti
- Notifiche SMS urgenti
- Fan-out pattern (1 evento → N subscriber)

**Volume:** 2M notifiche/giorno (media 1 per ordine)

### 4.6 Data Layer

#### 4.6.1 PostgreSQL Aurora (Ordini e Transazioni ACID)

**Use cases:**
- Ordini clienti (transazioni ACID)
- Anagrafica utenti
- Fatturazione e pagamenti
- Inventory master data

**Schema design esempio:**

```sql
-- Tabella ordini (partitioned by created_date per performance)
CREATE TABLE ordini (
    ordine_id BIGSERIAL PRIMARY KEY,
    cliente_id BIGINT NOT NULL REFERENCES clienti(cliente_id),
    data_creazione TIMESTAMP NOT NULL DEFAULT NOW(),
    stato VARCHAR(50) NOT NULL CHECK (stato IN 
        ('pending', 'processing', 'shipped', 'delivered', 'cancelled')),
    totale_eur DECIMAL(10,2) NOT NULL,
    indirizzo_consegna_id BIGINT NOT NULL REFERENCES indirizzi(indirizzo_id),
    tracking_id UUID UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
) PARTITION BY RANGE (data_creazione);

-- Partition per mese (retention 2 anni, poi archivio S3)
CREATE TABLE ordini_2026_01 PARTITION OF ordini
    FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

-- Index per performance query frequenti
CREATE INDEX idx_ordini_cliente ON ordini(cliente_id, data_creazione DESC);
CREATE INDEX idx_ordini_tracking ON ordini(tracking_id);
CREATE INDEX idx_ordini_stato ON ordini(stato) 
    WHERE stato IN ('processing', 'shipped');
```

**Configurazione:**

| Parametro | Valore | Motivazione |
|-----------|--------|-------------|
| **Instance type** | db.r6g.2xlarge | 8 vCPU, 64 GB RAM per workload OLTP |
| **Storage** | 2 TB GP3 (12K IOPS) | Crescita stimata 500 GB/anno ordini |
| **Read replicas** | 3 replicas cross-AZ | Distribuzione read queries (80% read, 20% write) |
| **Backup retention** | 7 giorni automated | RPO <1h, RTO <4h (Tier 2) |
| **Multi-AZ** | Yes | Failover automatico <60s |

**Connection pool tuning (HikariCP):**

```properties
spring.datasource.hikari.maximum-pool-size=100
spring.datasource.hikari.minimum-idle=10
spring.datasource.hikari.connection-timeout=30000
spring.datasource.hikari.idle-timeout=600000
spring.datasource.hikari.max-lifetime=1800000
```

#### 4.6.2 DynamoDB (Tracking e Eventi)

**Use cases:**
- Tracking pacchi (chiave primaria: package_id, sort key: timestamp)
- Eventi IoT sensori (alta throughput write, bassa latency read)
- Session storage app mobile (TTL auto-expiration)

**Schema design esempio:**

```json
{
  "package_id": "PKG-2026-03-08-123456",
  "timestamp": "2026-03-08T19:45:30Z",
  "event_type": "scan",
  "location_id": "FC-MIL-01",
  "scanner_id": "SCAN-4523",
  "operator_id": "OP-8821",
  "gps_lat": 45.4642,
  "gps_lon": 9.1900,
  "status": "in_transit",
  "ttl": 1741478730
}
```

**Access patterns:**
- Query 1: `GET /tracking/{package_id}` → GetItem (latency <10ms)
- Query 2: `GET /tracking/{package_id}/history` → Query con sort key range (latency <50ms)
- Query 3: `GET /fc/{location_id}/packages` → GSI (Global Secondary Index) su location_id (latency <100ms)

**Configurazione:**

| Parametro | Valore | Motivazione |
|-----------|--------|-------------|
| **Capacity mode** | On-Demand | Auto-scaling per picchi imprevedibili |
| **WCU provisioned (base)** | 200 WCU | Cost optimization (normale 30 write/sec) |
| **WCU max (picco)** | 2.000 WCU | Peak handling (174 write/sec × 2 item size) |
| **RCU (read)** | 1.000 RCU | 1.000 read/sec strongly consistent |
| **TTL** | Enabled (30 giorni) | Auto-delete eventi vecchi, riduce storage cost |
| **Point-in-time recovery** | Enabled | RPO <1 secondo per disaster recovery |

#### 4.6.3 Redis ElastiCache (In-Memory Caching)

**Use cases:**
- Session storage utenti (JWT token cache)
- Hot tracking queries (top 10% pacchi consultati 80% volte)
- Rate limiting API Gateway
- Pub/Sub real-time notifications

**Architettura cluster:**
- Cluster mode enabled: 3 nodi r6g.xlarge (13 GB RAM ciascuno)
- Replication: 1 master + 2 replicas per shard
- Multi-AZ: Automatic failover enabled
- Encryption: In-transit (TLS) + at-rest (KMS)

**Configurazione:**

| Parametro | Valore | Motivazione |
|-----------|--------|-------------|
| **Instance type** | r6g.xlarge | 4 vCPU, 13 GB RAM per high-throughput |
| **Cluster nodes** | 3 nodi (1 master, 2 replicas) | HA con automatic failover <60s |
| **Max memory policy** | allkeys-lru | Eviction automatica key meno usate |
| **TTL default** | 300 secondi | Bilanciamento freshness vs DB load |
| **Max connections** | 65.000 | Supporto 10K client simultanei |

**Cache strategy (Cache-Aside Pattern):**

```python
def get_tracking(package_id):
    # 1. Prova cache
    cache_key = f"tracking:{package_id}"
    cached = redis.get(cache_key)
    if cached:
        return json.loads(cached)  # Cache hit (latency 1ms)
    
    # 2. Cache miss → query DynamoDB
    item = dynamodb.get_item(Key={'package_id': package_id})
    if item:
        # 3. Popola cache per future richieste
        redis.setex(cache_key, 300, json.dumps(item))
        return item  # Latency 10ms
    
    return None  # Tracking non trovato
```

#### 4.6.4 S3 + Redshift (Data Lake + BI)

**S3 Data Lake:**

- **Raw data:** Kinesis Firehose → S3 Parquet (eventi IoT, tracking, log)
- **Processed data:** EMR Spark jobs → S3 aggregazioni giornaliere
- **Storage tiering:** S3 Standard (hot) → S3 IA (warm 90d) → Glacier (cold 1y) → Glacier Deep Archive (7y)

**Redshift Cluster:**

- **Instance type:** ra3.4xlarge (12 vCPU, 96 GB RAM, 128 TB storage managed)
- **Nodes:** 3 nodi cluster
- **Use case:** Business Intelligence, analytics dashboard, reporting
- **Query performance:** <5s per query su 30 giorni storico (1M+ records)
- **ETL:** AWS Glue per caricamento S3 → Redshift

### 4.7 Edge Computing On-Premise (12 FC Italia)

#### 4.7.1 AWS Outposts (Per FC)

**Hardware configuration:**

- **Form factor:** 42U Rack (2-3 rack per FC grande)
- **CPU:** 4th Gen Intel Xeon Scalable (tot. 80 cores per rack)
- **RAM:** 1 TB per rack
- **Storage:** 28 TB NVMe SSD per rack
- **Network:** Dual 100 Gbps uplink Direct Connect + backup 10 Gbps

**Workload on-premise:**

- **Local WMS logic:** Picking, packing task assignment (latenza <10ms)
- **Conveyor control:** Start/stop nastri, jam detection (latenza <20ms)
- **Robot AMR orchestration:** Path planning, collision avoidance (latenza <12ms)
- **Local DB cache:** Read replica PostgreSQL per query inventario locale
- **Video analytics:** AWS Panorama Appliance per computer vision real-time

**Autonomia Operativa (WAN Outage):**

**Obiettivo:** 4 ore autonomia operativa durante WAN outage per FC.

**Scenario:** Perdita connettività WAN (Direct Connect failure).

**Comportamento sistema:**

1. Local Outposts continua a operare: WMS locale assegna task picking, nastri funzionano
2. IoT Greengrass buffer locale: Eventi telemetria salvati su disco locale (capacity 1 TB → 24h buffer)
3. Sync differenziale quando WAN torna: Batch upload eventi bufferizzati a Kinesis central
4. Operazioni degradate: No nuovi ordini da cloud, no routing optimization real-time, no analytics dashboard aggiornate

#### 4.7.2 Dispositivi IoT per FC

| Categoria Dispositivo | Quantità/FC | Totale 12 FC | Specifiche Tecniche |
|----------------------|-------------|--------------|---------------------|
| **Scanner barcode palmari** | 2.000 | ~24.000 | WiFi 5GHz, 4G fallback, batteria 12h |
| **Terminali picking stazioni** | 500 | ~6.000 | Display touchscreen 10", CPU ARM |
| **Robot AMR autonomi** | 2.500 | ~30.000 | 5G MEC, sensori LiDAR, latenza <12ms |
| **Telecamere computer vision** | 120 | ~1.500 | AWS Panorama, NVIDIA Jetson Xavier |
| **Sensori nastri trasportatori** | 400 | ~5.000 | RFID reader, weight sensor, jam detect |
| **Gateway IoT aggregatori** | 25 | ~300 | AWS IoT Greengrass, CPU dual-core |

**Calcolo concorrenza picco:**

- 40.000 endpoint IoT/magazzino generano ~500 eventi/secondo cumulativi
- Banda upstream aggregata: 500 eventi/sec × 1KB/evento = 500 KB/sec ≈ 4 Mbps/magazzino
- **Per 12 magazzini:** 4 Mbps × 12 = **48 Mbps throughput telemetria totale**

**Infrastruttura IoT richiesta:**

- **AWS IoT Core:** capacity planning per 500K dispositivi MQTT simultanei
- **Message broker:** Apache Kafka cluster 6 nodi con replication factor 3
- **Time-series DB:** InfluxDB o Amazon Timestream per storage eventi (retention 90 giorni hot, 2 anni cold)

#### 4.7.3 Rete e Banda

**AWS Direct Connect (Fibra Dedicata per FC):**

| Parametro | Valore | Motivazione |
|-----------|--------|-------------|
| **Primary Link** | Dedicated Connection 100 Gbps fiber | Direct Connect Location Milano → FC |
| **Latency target** | 10-15ms RTT | Region eu-south-1 ↔ FC |
| **Routing** | BGP peering con AWS | private VIF per VPC access |
| **Redundancy** | Dual Direct Connect links per FC | 2× 100 Gbps in LAG (Link Aggregation Group) |

**Bandwidth allocation per FC:**

| Traffico | Bandwidth | Pattern |
|----------|-----------|---------|
| **IoT telemetry upstream** | 5-10 Gbps | Continuo (40K device × 1 KB/sec) |
| **Video sorveglianza upstream** | 10-20 Gbps | Continuo (120 cam × 1 Mbps × 120) |
| **API calls backend (WMS, tracking)** | 2-5 Gbps | Burst (picchi 10 Gbps) |
| **Database replication (Aurora → Outposts)** | 1-2 Gbps | Periodico (ogni 5 min) |
| **Software updates (OTA)** | 5 Gbps | Notturno (01:00-05:00) |
| **Totale** | 25-40 Gbps normale, 60 Gbps picco | Utilizzo 40-60% capacità 100 Gbps |

**Backup Connectivity (5G/LTE per FC):**

- **Secondary Link:** 5G NR business line da carrier primario (TIM/Vodafone)
- **Bandwidth:** 1-5 Gbps (shared, best-effort)
- **Latency:** 20-50ms (vs 10-15ms fibra)
- **Use case:** Backup durante Direct Connect maintenance, failover automatico BGP

**Autisti Mobili:**

- **Primary:** 4G LTE multi-carrier (TIM, Vodafone, WindTre roaming automatico)
- **Secondary:** 5G NR in aree urbane coperte (Milano, Roma, Torino)
- **Tertiary:** Satellite LEO (Project Kuiper-like) per zone rurali remote (latenza ~100ms, 100 Mbps-1 Gbps)

**App mobile con modalità offline:**

- Cache locale SQLite, sync differenziale quando rete disponibile
- Edge computing su veicolo: mini-gateway Raspberry Pi con buffer Redis, upload batch 4G
- Backup connectivity multi-layer: 4G LTE (primary) → 5G NR (secondary) → Satellite LEO (tertiary)

### 4.8 Sistema di Autenticazione (SSO, JWT)

**Stack tecnologico:**

- AWS Cognito User Pools per gestione utenti
- JWT (JSON Web Token) per stateless authentication
- SSO SAML 2.0 per dashboard operatori (integrazione Active Directory aziendale)
- OAuth 2.0 per app mobile (Authorization Code Flow con PKCE)

**Flusso autenticazione app mobile:**

1. Utente apre app → Redirect a Cognito Hosted UI
2. Login con email/password (o social login Google/Facebook)
3. Cognito valida credenziali → genera JWT token
4. App riceve token (access token validity 1h, refresh token 30 giorni)
5. Ogni API call include header: `Authorization: Bearer <access_token>`
6. API Gateway valida JWT signature (Cognito public key)
7. Se valido, forward request a backend microservizio
8. Se expired, app usa refresh token per ottenere nuovo access token

**Configurazione AWS Cognito:**

| Componente | Configurazione | Motivazione |
|-----------|---------------|-------------|
| **User Pool** | Separate pool per clienti/autisti/ops | Segregazione permessi per ruolo |
| **MFA (Multi-Factor Auth)** | Enabled per dashboard ops | Security compliance operatori hub |
| **Password policy** | Min 12 char, uppercase, numero, simbolo | Prevenzione account takeover |
| **JWT token validity** | Access 1h, Refresh 30 giorni | Bilanciamento security vs UX |
| **Identity Federation** | Google, Facebook, Apple Sign-In | Riduzione friction signup clienti |

---

## 5. Decisioni Architetturali Chiave e Trade-off

### 5.1 Compute: ECS Fargate (Scelta Primaria)

**Decisione:** ECS Fargate come piattaforma compute primaria per microservizi.

**Rationale:**

- ✅ **Serverless containers:** No gestione cluster, auto-scaling automatico
- ✅ **Cost-effective:** Pay-per-use (vs EC2 over-provisioning)
- ✅ **Security:** Task isolation, no shared kernel
- ✅ **Integration AWS:** Native integration con ALB, CloudWatch, IAM

**Trade-off:**

- ❌ **Cold start:** 10-30s per nuovo task (mitigato con provisioned capacity per Tier 1)
- ❌ **Limited instance types:** Solo predefined CPU/memory combinations (vs EC2 flessibilità totale)

**Quando usare EC2 invece:**

- Workload con GPU (ML training) → P5e instances
- Database managed (Aurora, Redis, Kafka MSK) → Istanze dedicate ottimizzate

**Quando usare Kubernetes (EKS):**

- Se necessità multi-cloud (portabilità workload) → Attualmente non priorità LogisTech
- Se complessità orchestrazione avanzata (service mesh, advanced networking) → Overhead non giustificato per scala attuale

### 5.2 Messaging: Kafka come Backbone Primario

**Decisione:** Apache Kafka (MSK) come event streaming backbone primario.

**Rationale:**

- ✅ **High-throughput:** 500 msg/sec/partition, totale 12 partitions = 6.000 msg/sec per topic
- ✅ **Durability:** Replication factor 3, retention 7 giorni
- ✅ **Ordering guarantee:** Partitioning per key (package_id) garantisce ordine eventi
- ✅ **Replay capability:** Consumer può rileggere eventi storici per recovery

**Trade-off:**

- ❌ **Complessità operativa:** Gestione cluster, monitoring, tuning performance
- ❌ **Costo:** 6 broker kafka.m5.2xlarge = ~€4.000/mese (vs SQS pay-per-message)

**Quando usare SQS invece:**

- Task queue semplici (picking operatori) → No ordering requirement
- Dead Letter Queue (DLQ) → Gestione eventi falliti
- Integrazione semplice con Lambda → Trigger asincrono

**Quando usare EventBridge invece:**

- Event routing cross-service → Schema registry + filtering
- Scheduled events → Cron job integrato

### 5.3 Database: Aurora (SQL) vs DynamoDB (NoSQL)

**Decisione:** Polyglot persistence con 2 database primari.

**Aurora PostgreSQL per ordini:**

**Rationale:**

- ✅ **ACID transactions:** Ordini richiedono strong consistency
- ✅ **Relational model:** Join complessi (ordine + cliente + indirizzo + payment)
- ✅ **Mature ecosystem:** ORM (Hibernate), migration tools (Flyway), monitoring

**Trade-off:**

- ❌ **Write scaling limit:** Single writer node, max ~10.000 write TPS
- ❌ **Costo:** db.r6g.2xlarge = ~€1.000/mese per writer + replicas

**DynamoDB per tracking:**

**Rationale:**

- ✅ **Horizontal scaling:** Unlimited write capacity con on-demand mode
- ✅ **Sub-10ms latency:** Read <5ms, write <10ms p99
- ✅ **Serverless:** Zero gestione cluster
- ✅ **TTL automatico:** Auto-delete eventi vecchi (cost optimization)

**Trade-off:**

- ❌ **Eventual consistency:** Default eventually consistent (mitigato con strongly consistent reads quando necessario)
- ❌ **Query limitations:** No join, no complex aggregations (delegate a Redshift per analytics)

### 5.4 Edge Computing: AWS Outposts vs Cloud-Only

**Decisione:** Hybrid cloud-edge con AWS Outposts nei 12 FC.

**Rationale:**

- ✅ **Latenza robotica:** <12ms richiesta per collision avoidance → impossibile con WAN
- ✅ **Autonomia operativa:** 4h autonomia durante WAN outage → continuità business
- ✅ **Data sovereignty:** Telemetria sensibile processata localmente, solo aggregazioni in cloud
- ✅ **Bandwidth optimization:** Computer vision processing edge (120 cam × 1 Mbps) → upload solo alert vs full stream

**Trade-off:**

- ❌ **CAPEX:** Hardware Outposts ~€250K per FC → €3M totale 12 FC
- ❌ **Complessità operativa:** Gestione hardware on-premise, upgrade firmware, failure hardware
- ❌ **Latency WAN residua:** 10-15ms Region ↔ FC comunque presente per sync DB

**Quando cloud-only sarebbe sufficiente:**

- Se latenza robotica <50ms accettabile → Cloud-only più semplice
- Se no requisito autonomia operativa → Elimina Outposts CAPEX
- Se FC solo 2-3 (vs 12) → Costo Outposts non giustificato

### 5.5 Multi-Region DR: Active-Passive vs Active-Active

**Decisione:** Active-Passive (eu-south-1 Primary → eu-west-1 Standby DR).

**Rationale:**

- ✅ **Cost-effective:** Warm standby 20% capacity in DR region vs 100% active-active
- ✅ **Complexity reduction:** No data conflict resolution tra region
- ✅ **RTO 20 minuti sufficiente:** Tier 2 services accettano RTO 4h, Tier 1 hanno Multi-AZ (RTO <5min)

**Trade-off:**

- ❌ **RPO 15 minuti:** S3 CRR asincrona → possibile perdita dati recenti (accettabile per LogisTech)
- ❌ **Manual failover:** Necessità operatore per promotion DR → vs active-active automatico

**Quando active-active sarebbe necessario:**

- Se RTO requirement <5 minuti per TUTTI i servizi → Active-active obbligatorio
- Se necessità geo-distribution utenti (es. Europa + USA) → Route 53 latency routing
- Se no tolerance perdita dati (RPO=0) → Sync replication cross-region

---

## 6. Dimensionamento Infrastrutturale

### 6.1 Compute Layer (Region eu-south-1)

| Server Role | Instance Type | Qty Normale | Qty Picco | Workload |
|------------|--------------|-------------|-----------|----------|
| **Microservizi (ECS Fargate)** | 4 vCPU, 8 GB RAM | 300-500 task | 800-1.000 task | API logic, routing, tracking, WMS |
| **Database Aurora (writer)** | db.r6g.2xlarge (8 vCPU, 64 GB) | 1 | 1 | OLTP transazionale ordini |
| **Database Aurora (read replica)** | db.r6g.xlarge (4 vCPU, 32 GB) | 3 | 5 | Offload read queries |
| **Redis Cache** | r6g.xlarge (4 vCPU, 13 GB) | 3 nodi | 6 nodi | In-memory key-value |
| **Kafka MSK broker** | kafka.m5.2xlarge (8 vCPU, 32 GB) | 6 nodi | 6 nodi | Event streaming (fixed size) |
| **Redshift Analytics** | ra3.4xlarge (12 vCPU, 96 GB) | 3 nodi | 3 nodi | Columnar DW (fixed size) |

**Totale stimato:**

- **vCPU totali:** ~3.000-4.000 vCPU (normale), ~8.000-10.000 vCPU (picco)
- **RAM totale:** ~12-18 TB RAM (normale), ~30-40 TB RAM (picco)
- **Network throughput aggregate:** ~50-100 Gbps

### 6.2 Storage Layer

| Storage Type | Capacity | IOPS | Use Case |
|-------------|----------|------|----------|
| **EBS GP3 (SSD)** | 200 TB | 1M IOPS | OS, app container, database volumes |
| **Aurora Storage** | 50 TB | Auto-scaling | Database cluster storage (ordini, inventory) |
| **S3 Standard (Hot)** | 10 TB | N/A | Hot data (immagini, log recenti) |
| **S3 Standard-IA (Warm)** | 100 TB | N/A | Warm data (log 90d, backup recenti) |
| **S3 Glacier Flexible (Cold)** | 1 PB | N/A | Cold data (compliance, audit trail) |
| **S3 Glacier Deep Archive** | 5 PB | N/A | Archive (video sorveglianza 1+ anno) |

### 6.3 Network Bandwidth

| Tratta | Bandwidth | Latency | Uso |
|--------|-----------|---------|-----|
| **Internet → CloudFront CDN** | 10-20 Gbps | <50ms | Traffic clienti webapp |
| **CloudFront → ALB (Region eu-south-1)** | 5-10 Gbps | <10ms | Backend API calls |
| **Direct Connect FC → Region** | 100 Gbps per FC | 10-15ms | Telemetria IoT, video, DB sync |
| **Inter-AZ (eu-south-1)** | 100 Gbps | <2ms | Replication Aurora, Kafka |
| **Cross-Region (eu-south-1 → eu-west-1)** | 10 Gbps | 20-30ms | DR backup, S3 CRR |

### 6.4 Dimensionamento per FC (Edge)

**Per singolo FC:**

| Componente | Quantità | Spec |
|-----------|----------|------|
| **AWS Outposts Rack** | 2-3 rack | 80 cores, 1 TB RAM, 28 TB SSD per rack |
| **Panorama Appliance (computer vision)** | 120 unit | NVIDIA Jetson Xavier, 32 GB RAM |
| **IoT Greengrass Gateway** | 25 unit | Dual-core CPU, 4 GB RAM |
| **Scanner barcode palmari** | 2.000 unit | WiFi 5GHz, 4G fallback |
| **Robot AMR autonomi** | 2.500 unit | 5G MEC, sensori LiDAR |
| **Telecamere sorveglianza** | 120 unit | 4K 30fps, AWS Panorama |

**Totale 12 FC:**

- **Outposts rack:** 24-36 rack (€3-4,5M CAPEX)
- **Robot AMR:** 30.000 unità (€150-300M CAPEX, maggior costo infrastrutturale)
- **Dispositivi IoT totali:** ~70.000 endpoint

---

## 7. Failure Scenarios e Mitigazioni

### 7.1 Scenario 1: Database Writer Saturation (Aurora Write Overload)

**Trigger:**

- Black Friday: 1,26M ordini/giorno (+80% vs baseline 700K)
- Write TPS passa da 200 (normale) a 1.600 (picco 8×)
- Aurora writer instance CPU >95%

**Sintomi:**

- Latenza write queries: 5ms → 500ms p99
- Connection pool saturation: max 5.000 conn PostgreSQL raggiunto
- Timeout applicativi: "Connection refused" errors

**Impatto Business:**

- **Severità:** CRITICAL (Tier 1)
- **RTO:** 15 minuti
- **Revenue impact:** €500K/ora (stimato su baseline €10M fatturato/giorno)

**Mitigazione Attuale:**

1. **Read replica offload:** 80% read queries su 3 read replicas
2. **Connection pooling:** PgBouncer transaction mode (100 conn fisiche, 10.000 virtuali)
3. **Query optimization:** Index tuning, prepared statements
4. **Auto-scaling read replicas:** Da 3 a 5 replicas in 10 minuti

**Mitigazione Migliorativa (Proposta):**

**Opzione A: Aurora Serverless v2**

- Auto-scaling write capacity da 0,5 ACU a 128 ACU
- Latenza scaling <30 secondi
- Costo: +30% vs provisioned, ma elimina manual capacity planning

**Opzione B: Database Sharding (Horizontal Partitioning)**

- Shard key: `cliente_id` modulo 8 → 8 Aurora cluster indipendenti
- Ogni shard gestisce 1/8 carico write → throughput 8× (12.800 write TPS totali)
- Trade-off: complessità query cross-shard, necessità sharding proxy (Vitess, Citus)

### 7.2 Scenario 2: Direct Connect Failure (WAN Outage FC)

**Trigger:**

- Taglio fibra Direct Connect accidentale (scavo stradale)
- Perdita connettività FC Milano 1 → AWS Region eu-south-1
- Durata: 2 ore (MTTR medio per riparazione fibra)

**Sintomi:**

- FC Milano 1 isolato da cloud centrale
- No nuovi ordini scaricabili
- No routing optimization real-time
- Analytics dashboard non aggiornata

**Impatto Business:**

- **Severità:** HIGH (Tier 2) - FC continua operare su ordini già assegnati
- **RTO:** 4 ore (tolleranza autonomia edge)
- **Throughput impact:** -8% (1 FC su 12 offline per nuovi ordini)

**Mitigazione Attuale:**

1. **Edge autonomia 4h:** AWS Outposts continua operare con WMS locale
2. **Dual Direct Connect:** Failover automatico BGP su secondo link 100 Gbps (SLA 99,9%)
3. **5G backup:** Connettività degradata 1-5 Gbps (vs 100 Gbps fibra) per operazioni critiche
4. **Local buffer:** IoT Greengrass buffer telemetria su disco locale 1 TB (24h capacity)

**Recovery:**

1. Fibra Direct Connect ripristinata (t+2h)
2. BGP re-peering automatico (<60s)
3. Sync differenziale: Batch upload eventi bufferizzati da Greengrass → Kinesis (15 minuti per 2h backlog)
4. Dashboard aggiornata con delay storico (gap 2h visibile in analytics)

**Lesson Learned:**

- ✅ Autonomia edge efficace per continuità operativa
- ⚠️ Considerare Satellite LEO come tertiary backup (latenza 100ms, sempre disponibile)

### 7.3 Scenario 3: DynamoDB Throttling (Tracking Event Loss)

**Trigger:**

- Cyber Monday: 50.000 eventi tracking/sec (10× normale 5.000 eventi/sec)
- DynamoDB WCU configured: 2.000 WCU max capacity
- Auto-scaling troppo lento: scaling step 50 WCU/min → 20 minuti per raggiungere capacity necessaria

**Sintomi:**

- HTTP 429 "ProvisionedThroughputExceededException"
- Eventi tracking persi (no retry infinite per evitare DLQ overflow)
- Clienti vedono tracking fermo: "In transito" senza aggiornamenti

**Impatto Business:**

- **Severità:** HIGH (Tier 1) - Impatto customer satisfaction
- **Customer impact:** 10.000 clienti vedono tracking stale (stima 1% ordini tracciati attivamente)
- **NPS impact:** -5 punti (esperienza degradata)

**Mitigazione Attuale:**

1. **DynamoDB On-Demand mode:** Auto-scaling illimitato (vs capacity provisioned)
2. **Exponential backoff:** Client retry con backoff 100ms, 200ms, 400ms, 800ms (max 4 retry)
3. **SQS buffer:** Eventi falliti dopo retry → SQS queue → reprocessing asincrono

**Mitigazione Migliorativa:**

**Opzione A: DynamoDB Global Tables**

- Replication multi-region automatica
- Write locality: Ogni region scrive localmente, replication asincrona
- Capacity: 2× write capacity aggregate (2 region × 2.000 WCU = 4.000 WCU)

**Opzione B: Kinesis Data Streams come Buffer**

- Write path: Scanner → Kinesis (illimitato write) → Lambda Consumer → DynamoDB
- Kinesis buffer: Retention 24h, backpressure naturale
- Lambda concurrency: 1.000 concurrent executions → throttling controllato verso DynamoDB

### 7.4 Scenario 4: Multi-AZ Failure (Availability Zone Outage)

**Trigger:**

- Outage completo AZ-A in Region eu-south-1 (evento raro ma documentato AWS)
- Durata: 3 ore
- Impact: 33% capacità compute persa (deployment 3 AZ uniform)

**Sintomi:**

- ALB health check failure su target group AZ-A
- Aurora writer failover automatico da AZ-A a AZ-B (60 secondi)
- CPU spike AZ-B e AZ-C: da 40% a 60% (load redistribution)

**Impatto Business:**

- **Severità:** MEDIUM (Tier 2) - Capacità residua 67% sufficiente per load normale
- **RTO:** 5 minuti (auto-scaling)
- **Performance degradation:** Latenza API +20% per 5 minuti, poi normalizzzata

**Mitigazione Attuale:**

1. **Multi-AZ deployment:** ALB + ECS + Aurora distribuiti su 3 AZ
2. **Health check aggressivo:** ALB probe ogni 10s, unhealthy threshold 3 fail (30s detection)
3. **Cross-zone load balancing:** ALB redistribuisce traffico uniformemente su AZ rimanenti
4. **Auto-scaling trigger:** CPU >70% → +50% istanze ECS in 2 minuti

**Recovery:**

1. ALB rileva AZ-A failure in 30s → redirige traffico AZ-B e AZ-C
2. Auto-scaling attivato in AZ-B e AZ-C: da 100 task a 150 task per AZ (2 minuti)
3. Aurora writer già failover automatico (60s)
4. Capacità ripristinata 100% (t+5min)

**Lesson Learned:**

- ✅ Multi-AZ efficace per high availability
- ⚠️ Monitorare CPU per region aggregate, non per AZ (false alarm)

### 7.5 Scenario 5: Robot AMR Latency Spike (Edge Network Jitter)

**Trigger:**

- Congestione rete Direct Connect durante picco IoT telemetria (60 Gbps vs 40 Gbps normale)
- Latency spike WAN: da 12ms a 50ms p99
- Robot AMR collision avoidance timeout (SLA <12ms)

**Sintomi:**

- Robot rallentano velocità: da 2 m/s a 0,5 m/s (safety mode)
- Alarm "robot stalled": +300% eventi CloudWatch
- Throughput picking: -25% (da 2.000 pacchi/ora a 1.500 pacchi/ora)

**Impatto Business:**

- **Severità:** MEDIUM (Tier 2) - Throughput ridotto ma no stop operativo
- **Productivity impact:** -25% picking rate per 30 minuti
- **Delay impact:** +15 minuti consegne (stimato su SLA 95% on-time)

**Mitigazione Attuale:**

1. **Edge computing:** Robot control logic su AWS Outposts (no WAN dependency)
2. **Local path planning:** Collision avoidance locale con latenza <5ms
3. **QoS prioritization:** Traffic shaping Direct Connect: robot control priority 1, telemetria priority 3

**Mitigazione Migliorativa (Proposta):**

**Opzione: Digital Twin + Predictive Control**

- NVIDIA Omniverse o AWS IoT TwinMaker per simulazione 3D magazzino real-time
- Predictive path planning: AI model prevede posizione robot +5 secondi nel futuro
- Edge AI inference: Model deployment su AWS Panorama Appliance (Jetson AGX Xavier) → latenza <5ms
- Benefit: Riduzione collision 80%, throughput robot +25%, tolleranza jitter rete

### 7.6 Scenario 6: Region Failure (Disaster Recovery Activation)

**Trigger:**

- Catastrofe datacenter Region eu-south-1 (evento estremamente raro)
- Perdita completa servizi AWS Milano
- Durata: >6 ore (worst case)

**Sintomi:**

- Route 53 health check failure per 3 volte consecutive (90 secondi)
- HTTP 503 "Service Unavailable" per tutti i client
- Dashboard ops non accessibile

**Impatto Business:**

- **Severità:** CRITICAL (Tier 1) - Interruzione servizio completa
- **RTO:** 20 minuti (target DR)
- **RPO:** 15 minuti (S3 CRR lag)
- **Revenue impact:** €500K/ora downtime

**Mitigazione Attuale (Active-Passive DR):**

**DR Region:** eu-west-1 Irlanda (warm standby 20% capacity)

**Infrastruttura DR pre-deployed:**

- Aurora Global Database: read replica in eu-west-1 (replica lag <1s)
- S3 Cross-Region Replication: asincrona RPO 15 minuti
- Compute: 20% capacity ECS task in eu-west-1 (scaling manuale a 100%)

**Failover Procedure (Runbook Automatizzato):**

1. **Detection (t+0):** Route 53 health check fallisce 3× consecutive (90s)
2. **DNS cutover (t+2min):** Route 53 ridirige traffico ALB eu-west-1 (TTL 60s propagazione)
3. **Database promotion (t+3min):** Aurora Global Database promuove read replica eu-west-1 a writer (60s)
4. **Compute scaling (t+5min):** Auto-scaling group eu-west-1 scala da 20% a 100% capacità (10 minuti)
5. **Validation (t+15min):** Smoke test tutti i microservizi, latenza API, throughput DB
6. **Communication (t+20min):** Status page update, notifica clienti via email/SMS

**RTO breakdown:**

- Detection: 90s
- DNS propagation: 2-5 min
- DB promotion: 60s
- Compute scaling: 10 min
- **Totale: ~15-20 minuti per servizio degradato, ~30 minuti per capacità 100%**

**Recovery (Failback a eu-south-1):**

1. Region eu-south-1 ripristinata e validata
2. Reverse replication: Aurora eu-west-1 → eu-south-1 (2h per sync completo)
3. Maintenance window: domenica 02:00-06:00 CET
4. DNS cutover reverse: Route 53 → eu-south-1
5. Monitoring 24h post-failback

**Lesson Learned:**

- ✅ DR plan testato trimestralmente (Game Day)
- ⚠️ Considerare Active-Active per RTO <5min se requirement evolve

---

## 8. Sicurezza, Compliance e Audit

### 8.1 Identity and Access Management (IAM)

**Principi:**

- **Role-Based Access Control (RBAC):** Permessi basati su ruolo (autista, operatore, manager, admin)
- **Least Privilege:** Permessi minimi necessari per funzione specifica
- **MFA obbligatorio:** Per tutti gli utenti privilegiati (ops, admin)
- **Temporary credentials:** AssumeRole per accesso temporaneo (vs long-term access keys)

**Implementazione:**

- **AWS IAM Roles:** Per servizi AWS (EC2, Lambda, ECS task assume role)
- **AWS Cognito User Pools:** Per autenticazione utenti finali (clienti, autisti)
- **SAML 2.0 SSO:** Per dashboard operatori (integrazione Active Directory aziendale)

**Esempio policy IAM (ECS Task Role per microservizio Tracking):**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem",
        "dynamodb:GetItem",
        "dynamodb:Query"
      ],
      "Resource": "arn:aws:dynamodb:eu-south-1:123456789012:table/tracking-events"
    },
    {
      "Effect": "Allow",
      "Action": [
        "kinesis:PutRecord",
        "kinesis:PutRecords"
      ],
      "Resource": "arn:aws:kinesis:eu-south-1:123456789012:stream/iot-telemetry"
    },
    {
      "Effect": "Deny",
      "Action": "s3:*",
      "Resource": "*"
    }
  ]
}
```

### 8.2 Encryption

**At Rest:**

- **RDS Aurora:** Encryption enabled (KMS key aws/rds)
- **DynamoDB:** Encryption enabled (KMS key aws/dynamodb)
- **S3:** Default encryption enabled (SSE-S3 per hot data, SSE-KMS per cold data compliance)
- **EBS:** Volumes encrypted (KMS key aws/ebs)

**In Transit:**

- **TLS 1.3:** Per tutte le comunicazioni API client ↔ ALB
- **mTLS:** Per inter-service communication microservizi (client certificate authentication)
- **VPN/Direct Connect:** Per traffico FC ↔ AWS Region

### 8.3 Secret Management

**AWS Secrets Manager:**

- Database credentials (Aurora, Redis, RabbitMQ)
- API keys terze parti (Google Maps, Stripe, Twilio)
- Certificati TLS/SSL (rotation automatica)

**Rotation automatica:**

- Database password: Ogni 90 giorni
- API keys: Ogni 180 giorni
- Certificati SSL: Ogni 365 giorni (Let's Encrypt automation)

### 8.4 Network Security

**VPC Segmentation:**

- **Public subnet:** ALB, NAT Gateway (solo ingress traffic)
- **Private subnet:** ECS tasks, RDS, ElastiCache (no direct internet)
- **Isolated subnet:** Database backup, compliance data (no internet, VPC endpoint only)

**Security Groups (Stateful Firewall):**

- **ALB Security Group:** Ingress HTTPS 443 da 0.0.0.0/0, egress verso ECS task security group
- **ECS Task Security Group:** Ingress 8080 da ALB SG, egress verso RDS SG + DynamoDB VPC endpoint
- **RDS Security Group:** Ingress 5432 da ECS Task SG, no egress

**Network ACLs (Stateless Firewall):**

- Deny known malicious IPs (blocklist aggiornata settimanalmente)
- Allow only required protocols (HTTP/HTTPS, PostgreSQL 5432, Redis 6379)

**AWS WAF (Web Application Firewall):**

- Protegge ALB e CloudFront
- Managed rule groups: OWASP Top 10, SQL injection, XSS
- Rate-based rules: 2.000 req/5min per IP (prevenzione DDoS layer 7)
- Geo-blocking: Block countries ad alto rischio fraud (opzionale)

**AWS Shield Standard (DDoS Protection):**

- Incluso gratuitamente per tutti i clienti AWS
- Protezione layer 3/4 (SYN flood, UDP reflection)

### 8.5 Vulnerability Management

**AWS Inspector:**

- Scanning automatico EC2/ECS per vulnerabilità CVE
- Frequenza: Ogni settimana
- Remediation SLA: Critical patches <7 giorni, High <30 giorni

**Dependency Scanning:**

- Snyk per scanning dipendenze npm/pip/Maven
- Integrato in CI/CD pipeline (blocca deploy se critical vulnerability)

**Penetration Testing:**

- Frequenza: Annuale (vendor esterno certificato)
- Scope: API Gateway, webapp clienti, app mobile
- Report remediation: 30 giorni

### 8.6 Logging e Audit Trail

**CloudWatch Logs:**

- Retention: 7 giorni hot (query CloudWatch Insights), poi archivio S3
- Log groups separati per service (api-gateway, tracking-service, wms-service)

**CloudTrail:**

- Enabled su tutti gli account AWS
- Log tutte le API calls AWS (chi, cosa, quando)
- Retention: 7 anni S3 (compliance GDPR)
- Integration SIEM: Export CloudTrail → S3 → Splunk/ELK

**Application Logs:**

- Format: JSON structured logs (timestamp, level, service, trace_id, message)
- Sensitive data masking: PII (email, phone) masked in logs (es. `m***@example.com`)

**Audit Eventi Critici:**

- Login utenti (successo/fallimento)
- Operazioni privilegiate (IAM role assumption, DB schema change)
- Data access (query clienti PII, export dati)
- Configuration changes (security group modification, KMS key rotation)

### 8.7 Compliance

**GDPR (General Data Protection Regulation):**

- **Data residency:** Dati clienti EU stored in Region eu-south-1 (Milano, Italia)
- **Right to erasure:** API DELETE /users/{user_id}/gdpr_delete (hard delete 30 giorni)
- **Data portability:** API GET /users/{user_id}/export (JSON format)
- **Consent management:** Opt-in esplicito per marketing communications
- **DPO (Data Protection Officer):** Designato e contattabile

**PCI-DSS (Payment Card Industry Data Security Standard):**

- **No card data stored:** Payment processing via Stripe/PayPal (tokenization)
- **Scope reduction:** LogisTech out-of-scope PCI (Stripe in-scope)

**ISO 27001 (Information Security Management):**

- Target certificazione: Anno 2
- Framework: Policies, procedures, risk assessment, incident response

---

## 9. Cost Model (TCO - Total Cost of Ownership)

### 9.1 Breakdown Costi (Stima Annuale)

**Baseline:** 700K ordini/giorno, 12 FC, 255M ordini/anno

| Categoria | Costo Mensile | Costo Annuale | % TCO | Note |
|-----------|--------------|---------------|-------|------|
| **Compute (ECS Fargate, EC2)** | €80.000 | €960.000 | 20% | 300-500 task × €60/task/mese |
| **Database (Aurora, DynamoDB, Redis)** | €60.000 | €720.000 | 15% | Aurora writer + 3 replicas + DynamoDB on-demand |
| **Storage (S3, EBS, Backup)** | €30.000 | €360.000 | 8% | Hot 10 TB + Warm 100 TB + Cold 1 PB |
| **Network (Direct Connect, Data Transfer)** | €50.000 | €600.000 | 13% | 12 FC × €4K/mese + data transfer out |
| **Messaging (Kafka MSK, SQS, SNS)** | €20.000 | €240.000 | 5% | 6 broker MSK + 2M SNS/giorno |
| **Edge (AWS Outposts CAPEX ammortizzato)** | €100.000 | €1.200.000 | 25% | €3M CAPEX / 3 anni ammortamento + manutenzione |
| **Robot AMR (CAPEX ammortizzato)** | €200.000 | €2.400.000 | 50% | 30K robot × €10K/unit = €300M / 10 anni ammortamento |
| **External API (Google Maps, Stripe, Twilio)** | €40.000 | €480.000 | 10% | 1M Maps API/day + 2M SMS/day |
| **Personnel (CloudOps team 10 FTE)** | €50.000 | €600.000 | 13% | 10 FTE × €60K/anno |
| **Security & Compliance (WAF, Shield, Inspector)** | €10.000 | €120.000 | 3% | WAF + Shield Advanced + pen testing |
| **Monitoring & Observability (CloudWatch, X-Ray)** | €15.000 | €180.000 | 4% | Logs + metrics + tracing |
| **DR & Backup (eu-west-1 warm standby)** | €30.000 | €360.000 | 8% | 20% capacity pre-deployed |
| **Contingency (10%)** | €68.500 | €822.000 | 17% | Buffer imprevisti |
| **TOTALE TCO** | **€753.500** | **€9.042.000** | **100%** | ~€35/ordine TCO IT (€9M / 255M ordini/anno) |

**Note:**

- **Robot AMR dominano TCO:** 50% del costo IT è ammortamento robot (CAPEX €300M)
- **Costo per ordine:** €35 TCO IT per ordine (include infrastruttura, non logistica operativa)
- **Scaling elastico:** Compute (+60% picco) e database (+80% picco) gestiti con auto-scaling, costi variabili

### 9.2 Ottimizzazioni Cost (Proposte)

**Reserved Instances (Compute):**

- Aurora: Reserved Instance 1 anno → risparmio 35% (€252K/anno)
- Redis: Reserved Instance 1 anno → risparmio 30% (€64K/anno)
- Kafka MSK: No reserved capacity disponibile (managed service pricing fixed)

**Savings Plans (Compute):**

- ECS Fargate: Compute Savings Plan 1 anno → risparmio 20% (€192K/anno)

**S3 Intelligent-Tiering:**

- Auto-tiering S3 Standard → IA → Glacier → Deep Archive
- Risparmio stimato: 40% su storage warm/cold (€144K/anno)

**Spot Instances (Non-Critical Workload):**

- Analytics batch job: 70% workload su Spot → risparmio 70% (€50K/anno)

**Data Transfer Optimization:**

- CloudFront caching aggressivo: riduzione data transfer out 30% (€60K/anno)

**TOTALE risparmio potenziale:** ~€762K/anno (8% TCO reduction)

---

## 10. Roadmap Evolutiva e Scalabilità Futura

### 10.1 Fase 1 (Anno 1): Foundation - Baseline 700K ordini/giorno

**Obiettivi:**

- Deploy 12 FC operativi
- Onboarding 15.000 autisti DSP
- Lancio servizio 60+ città
- Raggiungimento SLA 95% on-time delivery

**Metriche successo:**

- Throughput: 700K ordini/giorno stabile
- Uptime: 99,9% API Gateway
- Latenza: <100ms p95 tracking API

### 10.2 Fase 2 (Anno 2): Growth - Scaling a 1,2M ordini/giorno

**Obiettivi:**

- +4 FC nuovi (totale 16 FC)
- Espansione copertura: 80+ città
- Introduzione same-day delivery aree urbane

**Upgrade infrastruttura:**

- Database sharding: 8 Aurora cluster (vs 1 monolith)
- DynamoDB Global Tables: replication eu-south-1 ↔ eu-west-1
- Compute scaling: da 500 task a 1.000 task ECS

**Investimento:** €2M infra + €4M operational

### 10.3 Fase 3 (Anno 3): Optimization - AI/ML Integration

**Obiettivi:**

- Predictive routing: ML model riduce tempo consegna 15%
- Predictive maintenance robot: riduzione downtime 40%
- Dynamic pricing: surge pricing basato su domanda real-time

**Tecnologie:**

- Amazon SageMaker: Training model routing optimization
- AWS IoT TwinMaker: Digital twin magazzino 3D
- Amazon Forecast: Demand forecasting inventory

**Benefici attesi:**

- Costo delivery: -12% (routing optimization)
- Throughput robot: +25% (predictive maintenance)
- Customer satisfaction: +10 NPS (delivery accuracy)

### 10.4 Fase 4 (Anno 4-5): Expansion - Multi-Country (EU)

**Obiettivi:**

- Espansione Spagna: 8 FC, 500K ordini/giorno
- Espansione Francia: 10 FC, 800K ordini/giorno
- Architettura multi-region: 3 region AWS (Italia, Spagna, Francia)

**Sfide architetturali:**

- Data residency: 3 region separate (GDPR compliance per country)
- Cross-border routing: Integrazione carrier internazionali
- Multi-currency: Supporto EUR, GBP
- Multi-language: App mobile i18n (IT, ES, FR, EN)

**Investimento:** €15M infra (3 country × €5M) + €30M operational

---

## 11. Conclusioni

### 11.1 Sintesi Architetturale

LogisTech adotta un'**architettura ibrida cloud-edge moderna** che bilancia:

✅ **Scalabilità elastica cloud** (AWS Region eu-south-1) per gestire picchi +80%  
✅ **Latenza edge <12ms** (AWS Outposts per FC) per robotica real-time  
✅ **Resilienza Multi-AZ + DR** con RTO 15 min (Tier 1), RPO 15 min  
✅ **Polyglot persistence** (Aurora SQL + DynamoDB NoSQL + Redis cache) per workload ottimizzato  
✅ **Event-driven microservizi** (Kafka backbone) per disaccoppiamento e scalabilità

**Baseline dimensionamento unico:** 700K ordini/giorno → tutti i calcoli derivati con coerenza matematica.

### 11.2 Punti di Forza

1. **Architettura pronta per scala:** 700K → 1,5M ordini/giorno senza redesign (solo scaling orizzontale)
2. **Autonomia edge 4h:** Continuità operativa FC durante WAN outage
3. **Cost-effective:** €35 TCO IT per ordine competitivo vs benchmark settore
4. **Security by design:** Zero Trust, encryption end-to-end, compliance GDPR

### 11.3 Aree di Miglioramento Identificate

1. **Database write scaling:** Sharding o Aurora Serverless v2 per gestire >10.000 write TPS
2. **Robot latency tolerance:** Digital Twin + Predictive Control per riduzione collision 80%
3. **Active-Active DR:** Se RTO requirement evolve a <5 minuti per tutti i servizi
4. **Cost optimization:** Reserved Instances + Savings Plans → €762K/anno risparmio (8% TCO)
5. **Observability UX operativa:** Potenziare dashboard con mini-trend real-time per lettura immediata dei colli di bottiglia (throughput, latenza edge, saturazione infrastrutturale)

### 11.4 Validazione Benchmark vs Amazon Logistics Italia

| Metrica | Amazon Italia 2025 | LogisTech Target | Gap |
|---------|-------------------|------------------|-----|
| **Ordini/giorno** | ~1,2M | 700K | -42% (realistico per nuovo entrante) |
| **Quota mercato** | 28,4% | 15-20% target | Competitivo per Y5 |
| **FC operativi** | 11-12 | 10-12 | Parity |
| **Dipendenti diretti** | 19.000 | 35.000-40.000 | +89% (LogisTech meno automazione iniziale) |
| **SLA on-time** | >95% | 95% target | Parity |

**Validazione:** L'architettura LogisTech è dimensionata realisticamente per competere nel mercato italiano, con margine di crescita a 1,5M ordini/giorno (vs 700K baseline) senza redesign architetturale.

### 11.5 Dashboard Operativa HTML (Implementazione PW)

Per la consegna Project Work, la dashboard manageriale è stata implementata in frontend statico con separazione netta dei layer:

- **Struttura:** `index.html`
- **Presentazione:** `style.css`
- **Logica dati real-time simulata:** `script.js`

**Migliorie applicate rispetto al prototipo iniziale:**

1. Layout pulito con card omogenee e gerarchia KPI più leggibile per responsabile IT
2. Tre mini-grafici operativi (ultimi 30 minuti) per:
  - Trend throughput API/eventi
  - Trend latenza robot AMR
  - Indice saturazione infrastruttura
3. Badge stato sistema dinamico con soglie warning/critical
4. Aggiornamento periodico metriche (2s) su KPI, barre di carico e trend

**Copertura requisiti Dashboard in Figma (tradotti in HTML):**

- Stato code in tempo reale
- KPI principali
- Carico server
- Tempo medio/latenza risposta
- Alert critici
- Vista orientata a decision making operativo IT

---

## Appendice A: Glossario Tecnico

- **ACU (Aurora Capacity Unit):** Unità di misura capacità Aurora Serverless
- **AZ (Availability Zone):** Data center isolato all'interno di AWS Region
- **DLQ (Dead Letter Queue):** Coda per messaggi falliti dopo N retry
- **ECS (Elastic Container Service):** Orchestratore container AWS
- **Fargate:** Compute serverless per container (vs EC2 self-managed)
- **HPA (Horizontal Pod Autoscaler):** Auto-scaling Kubernetes basato su metriche
- **IOPS (Input/Output Operations Per Second):** Throughput disco
- **MSK (Managed Streaming for Kafka):** Kafka managed by AWS
- **OLTP (Online Transaction Processing):** Workload transazionale (vs OLAP analytics)
- **RPO (Recovery Point Objective):** Max data loss tollerato (es. 15 min)
- **RTO (Recovery Time Objective):** Max downtime tollerato (es. 20 min)
- **TPS (Transactions Per Second):** Throughput database
- **TTL (Time To Live):** Scadenza automatica record (cache, DynamoDB)
- **WCU/RCU (Write/Read Capacity Units):** Unità capacità DynamoDB

---

## Appendice B: Formule di Calcolo

**Ordini al secondo da giornalieri:**

```
ordini/sec = ordini/giorno / 86.400 secondi
Esempio: 700.000 / 86.400 = 8,1 ord/sec
```

**API calls totali da ordini:**

```
API_calls/giorno = ordini/giorno × API_calls/ordine
Esempio: 700.000 × 15 = 10.500.000 API calls/giorno
```

**Throughput Kafka (eventi/sec da dispositivi IoT):**

```
eventi_IoT/sec = (dispositivi_attivi × eventi/dispositivo/sec)
Esempio: 40.000 dispositivi × 0,125 eventi/sec = 5.000 eventi/sec per FC
Totale 12 FC: 5.000 × 12 = 60.000 eventi/sec
```

**Storage giornaliero da ordini:**

```
storage/giorno = ordini/giorno × dimensione_record
Esempio ordini: 700.000 × 2 KB = 1.400.000 KB = 1,4 GB/giorno
```

**Bandwidth IoT telemetria:**

```
bandwidth = eventi/sec × dimensione_evento
Esempio per FC: 5.000 eventi/sec × 0,5 KB = 2.500 KB/sec = 2,5 MB/sec = 20 Mbps
```

---

**Fine Documento**

*Versione 2.0 - Revisione Operativa Marzo 2026*