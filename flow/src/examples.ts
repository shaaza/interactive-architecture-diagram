// Sample diagrams offered in the "Load example" menu.

export const EXAMPLES: Record<string, string> = {
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

export const DEFAULT_EXAMPLE = 'Checkout request';
