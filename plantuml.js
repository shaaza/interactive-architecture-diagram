// const definition = `
// @startuml
// Karthik -> Shaaz: Hello
// Shaaz -> Someone: Yo
// Someone -> Karthik: Sup
// @enduml
// `

// used by default
const definition = `
@startuml
--description: User initiates deployment through Shuttle CLI
--schema: { command: "shuttle deploy", project_path: "string" }
User -> ShuttleCLI: shuttle deploy

--description: CLI authenticates with control service using device auth
--schema: { device_code: "string", client_id: "string" }
ShuttleCLI -> ControlService: POST /device-auth/token

--description: Control service returns authentication token
--schema: { device_auth_token: "string", expires_in: "number" }
ControlService -> ShuttleCLI: device_auth_token

--description: CLI uploads project archive to control service
--schema: { project_id: "string", archive: "binary", auth_token: "string" }
ShuttleCLI -> ControlService: POST /projects/{project}/deployments/archives

--description: Control service confirms archive upload
--schema: { status: "success", upload_id: "string" }
ControlService -> ShuttleCLI: upload_success

--description: Control service initiates build process
--schema: { project_id: "string", archive_id: "string", build_config: "object" }
ControlService -> BuilderService: build_request

--description: Builder service completes build
--schema: { build_id: "string", status: "success", image_uri: "string" }
BuilderService -> ControlService: build_complete

--description: Control service provisions AWS resources
--schema: { project_id: "string", resource_config: "object", aws_credentials: "object" }
ControlService -> AWS: provision_resources

--description: AWS confirms resource provisioning
--schema: { status: "ready", resource_ids: "array", endpoints: "object" }
AWS -> ControlService: resources_ready

--description: Control service orchestrates deployment
--schema: { build_id: "string", project_id: "string", resource_config: "object" }
ControlService -> Orchestrator: deploy

--description: Orchestrator confirms deployment start
--schema: { deployment_id: "string", status: "started", timestamp: "string" }
Orchestrator -> ControlService: deployment_started

--description: Control service sets up proxy routing
--schema: { project_id: "string", domain: "string", target: "string" }
ControlService -> ProxyService: configure_route

--description: Proxy service confirms route configuration
--schema: { status: "configured", route_id: "string", domain: "string" }
ProxyService -> ControlService: route_configured

--description: Control service monitors deployment status
--schema: { deployment_id: "string", timestamp: "string" }
ControlService -> Orchestrator: get_deployment_status

--description: Orchestrator returns current deployment status
--schema: { status: "string", progress: "number", details: "object" }
Orchestrator -> ControlService: deployment_status

--description: CLI polls for deployment status
--schema: { project_id: "string", auth_token: "string" }
ShuttleCLI -> ControlService: GET /projects/{project}/deployments/current

--description: Control service returns deployment status to CLI
--schema: { status: "string", deployment_id: "string", details: "object" }
ControlService -> ShuttleCLI: deployment_status

--description: Control service notifies CLI of deployment completion
--schema: { status: "complete", deployment_id: "string", endpoints: "object" }
ControlService -> ShuttleCLI: deployment_complete

--description: CLI notifies user of successful deployment
--schema: { status: "success", project_id: "string", endpoints: "object" }
ShuttleCLI -> User: Deployment successful

--description: User makes HTTP request to deployed service
--schema: { method: "string", path: "string", headers: "object", body: "any" }
User -> ProxyService: HTTP Request

--description: Proxy service routes request to deployed service
--schema: { target: "string", request: "object", headers: "object" }
ProxyService -> DeployedService: Route request

--description: Deployed service processes request and returns response
--schema: { status_code: "number", headers: "object", body: "any" }
DeployedService -> ProxyService: HTTP Response

--description: Proxy service forwards response to user
--schema: { status_code: "number", headers: "object", body: "any" }
ProxyService -> User: HTTP Response
@enduml`;


const lambdaDefinition = `
@startuml
--description: Lambda user invokes a function with a given request payload
--schema: { functionId: "", requestPayload: "user-data"}
User -> Frontend: Invoke

--description: Frontend asks Capacity to identify a sandbox
Frontend -> Capacity: Reserve(requestId)

--description: The Orchestration/Capacity service identifies a matching Sandbox to execute the request.
Capacity -> Host: ReserveSandbox(sandboxId)

--description: Sandbox is successfully locked for invoke
Host -> Capacity: SandboxReady()

--description: Capacity gives Frontend id of sandbox
Capacity -> Frontend: Sandbox(reservationToken)

--description: Frontend sends user's request to Sandbox
Frontend -> Host: Invoke(reqId, sandboxId, requestPayload)

--description: Host sends response to Frontend as a result of executing user code with request data
Host -> Frontend: InvokeResponse(response)

--description:
Frontend -> User: InvokeResponse(responsePayload)

--description: Host releases lock and tells Capacity that Sandbox can be reused
Host -> Capacity: SandboxReleased()
@enduml`;