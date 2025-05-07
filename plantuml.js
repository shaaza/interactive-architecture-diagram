// const definition = `
// @startuml
// Karthik -> Shaaz: Hello
// Shaaz -> Someone: Yo
// Someone -> Karthik: Sup
// @enduml
// `
const definition = `
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