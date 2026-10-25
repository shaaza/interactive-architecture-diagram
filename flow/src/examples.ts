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

// Details shown when a box or arrow is clicked. Edge keys are a step number,
// or "From->To" where two arrows share a number.
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
    platform: Web (Next.js storefront)
    auth: Session cookie
  GW:
    type: gateway
    description: Public entry point. Terminates TLS, authenticates and routes to services.
    product: Kong 3.6
    auth: Session token, verified with the Auth service
    rateLimit: 100 requests/min per user
    owner: Platform team
    deploy:
      platform: AWS ECS Fargate
      region: eu-west-1
      replicas: 3
      image: registry.example.com/edge/gateway:3.6.1
      url: https://api.shop.example.com
  Auth:
    type: service
    description: Validates session tokens and returns the user's identity.
    language: Go 1.22
    framework: net/http
    owner: Identity team
    repo: https://github.com/example/auth-service
    deploy:
      platform: AWS ECS Fargate
      region: eu-west-1
      replicas: 2
      resources: { cpu: 0.5 vCPU, memory: 512 MiB }
  Orders:
    type: service
    description: Owns the order lifecycle from creation to fulfilment.
    language: Kotlin
    framework: Spring Boot 3
    owner: Checkout team
    repo: https://github.com/example/order-service
    deploy:
      platform: Kubernetes (EKS)
      cluster: prod-eu-1
      namespace: checkout
      replicas: 4
      image: registry.example.com/checkout/orders:2025.10.3
      env:
        DB_POOL_SIZE: 20
        EVENTS_TOPIC: orders.v1
  Redis:
    type: cache
    engine: Redis 7 (ElastiCache)
    ttl: 30 minutes
    eviction: allkeys-lru
  DB:
    type: database
    description: Primary order store.
    engine: PostgreSQL
    version: "16.4"
    storage: 500 GiB gp3
    backups: Daily snapshots, 7-day point-in-time recovery
    deploy:
      platform: AWS RDS Multi-AZ
      region: eu-west-1
      instance: db.r6g.xlarge
  Q:
    type: queue
    broker: Amazon SQS (FIFO)
    topic: order-events.fifo
    retention: 4 days
  Mail:
    type: worker
    language: TypeScript (Node 20)
    trigger: SQS messages from order-events.fifo
    concurrency: 10
    owner: Growth team
    deploy:
      platform: AWS Lambda
      region: eu-west-1
      memory: 256 MiB

edges:
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
  "2":
    method: POST
    endpoint: /internal/sessions/verify
    protocol: HTTP/2 (mTLS)
    request:
      body: { token: string }
  "3":
    response:
      status: 200 OK
      body:
        userId: string
        scopes: [orders:write]
        expiresAt: ISO 8601 timestamp
  "4":
    method: POST
    endpoint: /internal/orders
    protocol: gRPC
    headers:
      x-user-id: <userId>
      x-request-id: <trace id>
    request:
      body:
        userId: string
        cartId: string
        paymentMethodId: string
    response:
      status: 201 Created
      body: { orderId: string, status: PENDING }
  "5":
    protocol: PostgreSQL wire protocol
    description: Inserts the order and its line items in one transaction.
    request:
      query: INSERT INTO orders (id, user_id, status, total_cents) VALUES ($1, $2, 'PENDING', $3)
  Orders->Q:
    protocol: SQS SendMessage
    request:
      MessageGroupId: <orderId>
      body:
        type: OrderPlaced
        orderId: string
        userId: string
        totalCents: integer
  GW->User:
    response:
      status: 201 Created
      headers:
        Location: /v1/orders/<orderId>
      body: { orderId: string, status: PENDING }
  "7":
    protocol: SQS ReceiveMessage (batch of 10)
    description: Sends the order confirmation email through the mail provider.`,

  'OAuth login (PKCE)': `nodes:
  Browser:
    type: client
    platform: Any modern browser
  App:
    type: service
    description: Server-rendered web app acting as the OAuth client.
    language: TypeScript
    framework: Next.js 14
    deploy:
      platform: Vercel
      url: https://app.example.com
  AS:
    type: external
    name: Authorization server
    vendor: Auth0
    docs: https://auth0.com/docs/get-started/authentication-and-authorization-flow/authorization-code-flow-with-pkce
  API:
    type: service
    language: Python 3.12
    framework: FastAPI
    deploy:
      platform: Google Cloud Run
      region: europe-west1
      url: https://api.example.com

edges:
  "3":
    method: GET
    endpoint: /authorize
    request:
      query:
        response_type: code
        client_id: <client id>
        redirect_uri: https://app.example.com/callback
        scope: openid profile
        code_challenge: <base64url SHA-256 of verifier>
        code_challenge_method: S256
        state: <random>
  "6":
    method: POST
    endpoint: /oauth/token
    headers:
      Content-Type: application/x-www-form-urlencoded
    request:
      body:
        grant_type: authorization_code
        code: <auth code>
        code_verifier: <original random string>
        redirect_uri: https://app.example.com/callback
    response:
      status: 200 OK
      body:
        access_token: JWT
        id_token: JWT
        expires_in: 3600
  "8":
    method: GET
    endpoint: /me
    headers:
      Authorization: Bearer <access token>
    response:
      status: 200 OK
      body: { sub: string, name: string, email: string }`,

  'Event pipeline fan-out': `nodes:
  K:
    type: queue
    name: orders topic
    broker: Apache Kafka (MSK)
    topic: orders
    partitions: 12
    retention: 7 days
  Inv:
    type: service
    owner: Fulfilment team
    deploy: { platform: Kubernetes (EKS), replicas: 3, consumerGroup: inventory }
  Bill:
    type: service
    owner: Payments team
    deploy: { platform: Kubernetes (EKS), replicas: 2, consumerGroup: billing }
  An:
    type: worker
    name: Analytics
    trigger: Kafka consumer group analytics
  PSP:
    type: external
    vendor: Stripe
    docs: https://docs.stripe.com/api/payment_intents

edges:
  "1":
    protocol: Kafka produce (acks=all)
    request:
      key: <orderId>
      value: { type: OrderPlaced, orderId: string, totalCents: integer }
  Bill->PSP:
    method: POST
    endpoint: /v1/payment_intents
    headers:
      Authorization: Bearer sk_live_...
      Idempotency-Key: <orderId>
    request:
      body: { amount: integer, currency: eur, customer: string, confirm: true }
  "4":
    method: POST
    endpoint: /webhooks/stripe
    headers:
      Stripe-Signature: t=<timestamp>,v1=<signature>
    request:
      body: { type: payment_intent.succeeded, data: { object: { id: string, amount: integer } } }`,
};

export interface Example {
  diagram: string;
  details: string;
}

export const EXAMPLES: Record<string, Example> = Object.fromEntries(
  Object.entries(DIAGRAMS).map(([name, diagram]) => [name, { diagram, details: DETAILS[name] ?? '' }]),
);

export const DEFAULT_EXAMPLE = 'Checkout request';
