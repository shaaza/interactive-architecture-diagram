// Sample diagrams offered in the "Load example" menu.

const DIAGRAMS: Record<string, string> = {
  'Checkout request': `flowchart LR
  User((Shopper))
  GW[API gateway]
  subgraph Services
    Auth[Auth service]
    Orders[Order service]
  end
  subgraph Data
    Redis[(Session cache)]
    DB[(Postgres)]
    Q[[Order events queue]]
  end
  Mail[Email worker]

  %% Unnumbered edges are static architecture and stay visible
  Auth --- Redis

  User -->|1. POST /checkout| GW
  GW -->|2. Verify session| Auth
  Auth -->|3. Session OK| GW
  GW -->|4. Create order| Orders
  Orders -->|5. INSERT order| DB
  Orders -->|6. Publish OrderPlaced| Q
  GW -->|6. 201 Created| User
  Q -.->|7. Consume| Mail

  %% 1: The shopper submits their cart to the public API gateway.
  %% 2: The gateway checks the session token before any order data is touched.
  %% 6: Two things happen at once: the event is published and the shopper gets a response.
  %% 7: Email runs asynchronously, so a slow mail provider never blocks checkout.`,

  'OAuth login (PKCE)': `flowchart TB
  Browser([Browser])
  App[Web app]
  AS[Authorization server]
  API[Resource API]

  Browser -->|1. Click Sign in| App
  App -->|2. Redirect with code_challenge| Browser
  Browser -->|3. GET /authorize| AS
  AS -->|4. Redirect with auth code| Browser
  Browser -->|5. Callback with code| App
  App -->|6. POST /token + code_verifier| AS
  AS -->|7. Access + ID token| App
  App -->|8. GET /me with bearer token| API
  API -->|9. Profile JSON| App

  %% 2: The app keeps the code_verifier and sends only its hash, the code_challenge.
  %% 6: The server hashes the verifier and checks it matches the original challenge.`,

  'Event pipeline fan-out': `flowchart LR
  P[Checkout API] -->|1. OrderPlaced| K{{Kafka topic: orders}}
  K -->|2. Consume| Inv[Inventory]
  K -->|2. Consume| Bill[Billing]
  K -->|2. Consume| An[Analytics]
  Inv -->|3. Reserve stock| WH[(Warehouse DB)]
  Bill -->|3. Charge card| PSP[Payment provider]
  An -->|3. Append| DW[(Warehouse)]
  PSP -.->|4. Webhook: charge.succeeded| Bill
  Bill -->|5. PaymentConfirmed| K

  %% 2: Each consumer group reads the same event independently, in parallel.
  %% 4: The payment provider confirms asynchronously through a webhook.`
};

// Details shown when a box or arrow is clicked. Every box and arrow in each
// example has an entry. Edge keys are a step number, or "From->To" where two
// arrows share a number or the arrow is unnumbered. All values are mock data.
const DETAILS: Record<string, string> = {
  'Checkout request': `types:
  # Extend or override the built-in types (service, gateway, database, queue, ...)
  worker:
    label: Background worker
    fields: [language, trigger, concurrency, owner]

nodes:
  User:
    type: client
    name: Shopper
    description: A signed-in shopper on the web storefront.
    platform: Web (Next.js 14 storefront)
    auth: Session cookie, exchanged for a bearer token by the storefront
    deploy:
      platform: Vercel
      regions: [cdg1, iad1]
      url: https://shop.example.com

  GW:
    type: gateway
    description: Public entry point. Terminates TLS, authenticates and routes to services.
    product: Kong Gateway 3.6
    auth: Session token, verified with the Auth service
    rateLimit: 100 requests/min per user
    owner: Platform team
    timeout: 10 s upstream
    deploy:
      platform: AWS ECS Fargate
      region: eu-west-1
      cluster: edge-prod
      replicas: 3
      image: registry.example.com/edge/gateway:3.6.1
      resources: { cpu: 1 vCPU, memory: 2 GiB }
      url: https://api.shop.example.com
      healthCheck: GET /status every 10 s

  Auth:
    type: service
    description: Validates session tokens and returns the user's identity and scopes.
    language: Go 1.22
    framework: net/http + chi
    owner: Identity team
    repo: https://github.com/example/auth-service
    slo: 99.95% of verifications under 25 ms
    deploy:
      platform: AWS ECS Fargate
      region: eu-west-1
      cluster: core-prod
      replicas: 2
      image: registry.example.com/identity/auth:1.18.0
      resources: { cpu: 0.5 vCPU, memory: 512 MiB }
      env:
        SESSION_CACHE_URL: rediss://sessions.abc123.euw1.cache.amazonaws.com:6379
        TOKEN_ISSUER: https://auth.shop.example.com

  Orders:
    type: service
    description: Owns the order lifecycle from creation to fulfilment.
    language: Kotlin 1.9
    framework: Spring Boot 3.2
    owner: Checkout team
    repo: https://github.com/example/order-service
    slo: 99.9% of creates under 300 ms
    deploy:
      platform: Kubernetes (EKS)
      cluster: prod-eu-1
      namespace: checkout
      replicas: 4
      autoscaling: 4 to 12 pods at 65% CPU
      image: registry.example.com/checkout/orders:2025.10.3
      resources: { cpu: 1 vCPU, memory: 1.5 GiB }
      env:
        DB_POOL_SIZE: 20
        EVENTS_QUEUE_URL: https://sqs.eu-west-1.amazonaws.com/123456789012/order-events.fifo

  Redis:
    type: cache
    description: Holds active sessions so token checks avoid the database.
    engine: Redis 7.1 (ElastiCache)
    ttl: 30 minutes, refreshed on use
    eviction: allkeys-lru
    deploy:
      platform: AWS ElastiCache
      region: eu-west-1
      nodeType: cache.r7g.large
      shards: 2
      replicasPerShard: 1
      encryption: In transit and at rest

  DB:
    type: database
    description: Primary order store.
    engine: PostgreSQL
    version: "16.4"
    storage: 500 GiB gp3, 6000 IOPS
    backups: Daily snapshots, 7-day point-in-time recovery
    deploy:
      platform: AWS RDS Multi-AZ
      region: eu-west-1
      instance: db.r6g.xlarge
      readReplicas: 1
      endpoint: orders-prod.cluster-abc123.eu-west-1.rds.amazonaws.com

  Q:
    type: queue
    description: Order events for asynchronous consumers, in order per order ID.
    broker: Amazon SQS (FIFO)
    topic: order-events.fifo
    partitions: Message group per order ID
    retention: 4 days
    deadLetterQueue: order-events-dlq.fifo after 5 attempts
    deploy:
      platform: AWS SQS
      region: eu-west-1
      visibilityTimeout: 60 s
      encryption: SSE-SQS

  Mail:
    type: worker
    description: Sends order confirmation emails.
    language: TypeScript (Node 20)
    trigger: SQS messages from order-events.fifo
    concurrency: 10
    owner: Growth team
    mailProvider: Postmark
    deploy:
      platform: AWS Lambda
      region: eu-west-1
      memory: 256 MiB
      timeout: 30 s
      reservedConcurrency: 10

edges:
  Auth->Redis:
    protocol: RESP3 over TLS
    description: Auth reads and refreshes sessions in the cache. Static, not part of the flow.
    request:
      commands: [GET session:<token>, EXPIRE session:<token> 1800]

  "1":
    method: POST
    endpoint: /v1/checkout
    protocol: HTTPS
    description: Submits the shopper's cart for payment and order creation.
    headers:
      Authorization: Bearer <session token>
      Content-Type: application/json
      Idempotency-Key: <uuid>
    request:
      body:
        cartId: string
        paymentMethodId: string
        shippingAddressId: string
    response:
      status: 201 Created (see step 6)
      errors:
        401: Session missing or expired
        409: Same Idempotency-Key with a different body
        422: Cart empty or items out of stock

  "2":
    method: POST
    endpoint: /internal/sessions/verify
    protocol: HTTP/2 with mTLS
    description: The gateway asks Auth to check the session token.
    headers:
      Content-Type: application/json
      x-request-id: <trace id>
    request:
      body: { token: string }
    timeout: 200 ms

  "3":
    description: Auth confirms the session and returns who the shopper is.
    response:
      status: 200 OK
      headers:
        Cache-Control: no-store
      body:
        userId: string
        scopes: [orders:write]
        expiresAt: ISO 8601 timestamp
      errors:
        401: Token unknown or expired

  "4":
    method: POST
    endpoint: /internal/orders
    protocol: gRPC (orders.v1.OrderService/CreateOrder)
    description: The gateway forwards the checkout to the order service with the verified user ID.
    headers:
      x-user-id: <userId>
      x-request-id: <trace id>
      idempotency-key: <uuid from step 1>
    request:
      body:
        userId: string
        cartId: string
        paymentMethodId: string
        shippingAddressId: string
    response:
      status: 201 Created
      body: { orderId: string, status: PENDING, totalCents: integer }
    timeout: 2 s

  "5":
    protocol: PostgreSQL wire protocol
    description: Inserts the order and its line items in one transaction.
    request:
      statements:
        - BEGIN
        - INSERT INTO orders (id, user_id, status, total_cents) VALUES ($1, $2, 'PENDING', $3)
        - INSERT INTO order_items (order_id, sku, quantity, price_cents) VALUES ...
        - COMMIT
    response:
      rowsInserted: 1 order, 1 or more items
    isolation: READ COMMITTED

  Orders->Q:
    protocol: SQS SendMessage
    description: Publishes the OrderPlaced event once the transaction commits.
    request:
      QueueUrl: https://sqs.eu-west-1.amazonaws.com/123456789012/order-events.fifo
      MessageGroupId: <orderId>
      MessageDeduplicationId: <orderId>-placed
      body:
        type: OrderPlaced
        version: 1
        orderId: string
        userId: string
        totalCents: integer
        placedAt: ISO 8601 timestamp
    response:
      MessageId: string

  GW->User:
    protocol: HTTPS
    description: The shopper gets the new order straight away; email follows asynchronously.
    response:
      status: 201 Created
      headers:
        Location: /v1/orders/<orderId>
        Content-Type: application/json
      body: { orderId: string, status: PENDING, totalCents: integer }

  "7":
    protocol: SQS ReceiveMessage (long polling, batches of 10)
    description: The worker picks up OrderPlaced and sends the confirmation email.
    request:
      MaxNumberOfMessages: 10
      WaitTimeSeconds: 20
    response:
      body: OrderPlaced event (see step 6)
    onFailure: Message returns to the queue; dead-lettered after 5 attempts`,

  'OAuth login (PKCE)': `nodes:
  Browser:
    type: client
    description: The user's browser. Holds no tokens, only the app's session cookie.
    platform: Any modern browser
    auth: HttpOnly session cookie set by the web app

  App:
    type: service
    name: Web app
    description: Server-rendered web app acting as the OAuth client. Stores tokens server-side.
    language: TypeScript
    framework: Next.js 14 with NextAuth.js
    owner: Web team
    repo: https://github.com/example/web-app
    deploy:
      platform: Vercel
      regions: [fra1]
      url: https://app.example.com
      env:
        AUTH_ISSUER: https://login.example.com
        AUTH_CLIENT_ID: app-web-prod

  AS:
    type: external
    name: Authorization server
    description: Hosted identity provider that signs users in and issues tokens.
    vendor: Auth0
    docs: https://auth0.com/docs/get-started/authentication-and-authorization-flow/authorization-code-flow-with-pkce
    sla: 99.99% uptime
    deploy:
      tenant: example-prod (EU region)
      url: https://login.example.com

  API:
    type: service
    name: Resource API
    description: Returns the signed-in user's profile. Validates access tokens locally with the issuer's JWKS.
    language: Python 3.12
    framework: FastAPI
    owner: Accounts team
    repo: https://github.com/example/profile-api
    deploy:
      platform: Google Cloud Run
      region: europe-west1
      minInstances: 1
      maxInstances: 20
      url: https://api.example.com

edges:
  "1":
    method: GET
    endpoint: /login
    protocol: HTTPS
    description: The user clicks Sign in; the app starts a new login.
    headers:
      Cookie: (none yet)

  "2":
    protocol: HTTPS
    description: The app makes a random code_verifier, keeps it server-side, and redirects with its hash.
    response:
      status: 302 Found
      headers:
        Location: https://login.example.com/authorize?response_type=code&client_id=app-web-prod&code_challenge=<S256 hash>&...
        Set-Cookie: login_state=<state>; HttpOnly; Secure; SameSite=Lax; Max-Age=600

  "3":
    method: GET
    endpoint: /authorize
    protocol: HTTPS
    description: The browser follows the redirect to the sign-in page.
    request:
      query:
        response_type: code
        client_id: app-web-prod
        redirect_uri: https://app.example.com/callback
        scope: openid profile email
        code_challenge: <base64url SHA-256 of verifier>
        code_challenge_method: S256
        state: <random>

  "4":
    protocol: HTTPS
    description: After sign-in, the server redirects back with a one-time code.
    response:
      status: 302 Found
      headers:
        Location: https://app.example.com/callback?code=<auth code>&state=<state>
    codeLifetime: 60 s, single use

  "5":
    method: GET
    endpoint: /callback
    protocol: HTTPS
    description: The app checks state against its cookie before using the code.
    headers:
      Cookie: login_state=<state>
    request:
      query: { code: <auth code>, state: <state> }

  "6":
    method: POST
    endpoint: /oauth/token
    protocol: HTTPS (back channel)
    description: The app proves it started the login by sending the original verifier.
    headers:
      Content-Type: application/x-www-form-urlencoded
    request:
      body:
        grant_type: authorization_code
        client_id: app-web-prod
        code: <auth code>
        code_verifier: <original random string>
        redirect_uri: https://app.example.com/callback

  "7":
    description: The server hashes the verifier, matches it to the challenge and issues tokens.
    response:
      status: 200 OK
      headers:
        Cache-Control: no-store
      body:
        access_token: JWT (RS256)
        id_token: JWT (RS256)
        refresh_token: opaque string
        token_type: Bearer
        expires_in: 3600
      errors:
        400 invalid_grant: Code expired, reused, or verifier does not match

  "8":
    method: GET
    endpoint: /me
    protocol: HTTPS
    description: The app calls the API on the user's behalf.
    headers:
      Authorization: Bearer <access token>
      Accept: application/json

  "9":
    response:
      status: 200 OK
      headers:
        Content-Type: application/json
      body: { sub: string, name: string, email: string, picture: url }
      errors:
        401: Token missing, expired or for the wrong audience`,

  'Event pipeline fan-out': `nodes:
  P:
    type: service
    name: Checkout API
    description: Publishes an event for every order placed.
    language: Kotlin
    framework: Spring Boot 3.2
    owner: Checkout team
    repo: https://github.com/example/checkout-api
    deploy:
      platform: Kubernetes (EKS)
      cluster: prod-eu-1
      namespace: checkout
      replicas: 4

  K:
    type: queue
    name: orders topic
    description: The order event stream every downstream team reads from.
    broker: Apache Kafka 3.6 (Amazon MSK)
    topic: orders
    partitions: 12, keyed by order ID
    retention: 7 days
    deploy:
      platform: Amazon MSK
      region: eu-west-1
      brokers: 3 x kafka.m7g.large
      replicationFactor: 3
      schema: Avro, registered in Glue Schema Registry

  Inv:
    type: service
    name: Inventory
    description: Reserves stock for each order line.
    language: Java 21
    framework: Quarkus
    owner: Fulfilment team
    deploy: { platform: Kubernetes (EKS), namespace: fulfilment, replicas: 3, consumerGroup: inventory }

  Bill:
    type: service
    name: Billing
    description: Charges the customer and publishes the result.
    language: Go 1.22
    framework: Watermill
    owner: Payments team
    deploy: { platform: Kubernetes (EKS), namespace: payments, replicas: 2, consumerGroup: billing }

  An:
    type: worker
    name: Analytics
    description: Streams order events into the data warehouse.
    language: Python 3.12
    trigger: Kafka consumer group analytics
    concurrency: 12 (one per partition)
    owner: Data team
    deploy: { platform: AWS Fargate, replicas: 1, consumerGroup: analytics }

  WH:
    type: database
    name: Warehouse DB
    description: Stock levels and reservations per warehouse.
    engine: PostgreSQL
    version: "15.6"
    storage: 200 GiB gp3
    backups: Daily, 14-day retention
    deploy: { platform: AWS RDS, region: eu-west-1, instance: db.m6g.large }

  PSP:
    type: external
    name: Payment provider
    description: Card payments.
    vendor: Stripe
    docs: https://docs.stripe.com/api/payment_intents
    sla: 99.99% API uptime

  DW:
    type: database
    name: Warehouse
    description: Analytics data warehouse.
    engine: Snowflake
    version: Enterprise edition
    storage: Managed
    backups: 1-day Time Travel, 7-day Fail-safe
    deploy: { platform: Snowflake on AWS, region: eu-central-1, warehouse: ANALYTICS_XS }

edges:
  "1":
    protocol: Kafka produce (acks=all, idempotent producer)
    description: The checkout API publishes OrderPlaced after the order commits.
    request:
      key: <orderId>
      headers: { eventType: OrderPlaced, schemaVersion: 3 }
      value: { orderId: string, customerId: string, totalCents: integer, items: "[{ sku, quantity }]" }

  K->Inv:
    protocol: Kafka consume (group inventory)
    description: Inventory reads every OrderPlaced event.
    offsets: Committed after stock is reserved
    onFailure: Retried 3 times, then sent to orders.inventory.dlq

  K->Bill:
    protocol: Kafka consume (group billing)
    description: Billing reads every OrderPlaced event.
    offsets: Committed after the charge request is accepted
    onFailure: Retried 3 times, then sent to orders.billing.dlq

  K->An:
    protocol: Kafka consume (group analytics)
    description: Analytics reads every event, in batches.
    batch: Up to 500 records or 5 s
    offsets: Committed after each batch loads

  Inv->WH:
    protocol: PostgreSQL wire protocol
    description: Reserves stock for each line, failing if any item is short.
    request:
      statement: UPDATE stock SET reserved = reserved + $2 WHERE sku = $1 AND available - reserved >= $2
    isolation: SERIALIZABLE

  Bill->PSP:
    method: POST
    endpoint: /v1/payment_intents
    protocol: HTTPS
    description: Creates and confirms a payment for the order total.
    headers:
      Authorization: Bearer sk_live_...
      Idempotency-Key: <orderId>
      Content-Type: application/x-www-form-urlencoded
    request:
      body: { amount: integer, currency: eur, customer: string, confirm: true, metadata: { orderId: string } }
    response:
      status: 200 OK
      body: { id: pi_..., status: processing }

  An->DW:
    protocol: Snowpipe Streaming
    description: Appends each batch to the raw orders table.
    request:
      table: RAW.ORDERS_EVENTS
      columns: [event_id, order_id, payload VARIANT, received_at]

  "4":
    method: POST
    endpoint: /webhooks/stripe
    protocol: HTTPS
    description: The payment provider confirms asynchronously through a webhook.
    headers:
      Stripe-Signature: t=<timestamp>,v1=<signature>
      Content-Type: application/json
    request:
      body: { type: payment_intent.succeeded, data: { object: { id: string, amount: integer, metadata: { orderId: string } } } }
    response:
      status: 200 OK (any other status is retried for up to 3 days)

  "5":
    protocol: Kafka produce (acks=all)
    description: Billing publishes the confirmed payment for downstream services.
    request:
      key: <orderId>
      headers: { eventType: PaymentConfirmed, schemaVersion: 1 }
      value: { orderId: string, paymentIntentId: string, amountCents: integer, confirmedAt: ISO 8601 timestamp }`,
};

export interface Example {
  diagram: string;
  details: string;
}

export const EXAMPLES: Record<string, Example> = Object.fromEntries(
  Object.entries(DIAGRAMS).map(([name, diagram]) => [name, { diagram, details: DETAILS[name] ?? '' }]),
);

export const DEFAULT_EXAMPLE = 'Checkout request';
