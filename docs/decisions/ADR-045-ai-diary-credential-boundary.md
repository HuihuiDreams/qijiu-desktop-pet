# ADR-045: Keep AI diary provider credentials outside distributed clients

## Status

Proposed

## Date

2026-08-12

## Context

The planned Hub feature generates a diary through DeepSeek. DeskPet is a
publicly distributed Electron application, so every resource included in an
installer, including a CI-injected environment variable, can be extracted or
observed at runtime. Moving a provider key from renderer code to the main
process does not make it secret.

The feature also accepts user-authored task and event data, then turns that
data into a billable third-party request. The service must therefore prevent
arbitrary renderers from making requests or selecting privileged pet actions.

## Decision

1. Do not package, obfuscate, split, or CI-inject a shared DeepSeek API Key
   into DeskPet. The key is stored only in a controlled server-side secret
   manager and used only by the AI diary proxy.
2. The client calls the proxy over HTTPS using a short-lived, revocable
   credential associated with an authenticated user. The proxy enforces per
   user quotas, concurrency limits, request-size limits, timeouts, and
   revocation. Client-side debouncing is not a security control.
3. Do not release the AI diary feature until that authenticated proxy exists.
   A missing or unavailable proxy disables the feature with a user-safe error;
   it must never fall back to a bundled shared provider key.
4. Hub IPC remains a local trust boundary: the main process authorizes the
   current Hub window sender, validates all payloads, persists the task result,
   and derives an allowlisted reward event before notifying the pet renderer.

## Alternatives Considered

### CI-injected shared provider key in the installer

- Rejected: CI protects the key before release, but cannot protect it after the
  installer reaches users. Obfuscation and a small provider quota only reduce
  the impact after compromise.

### Direct renderer-to-provider request

- Rejected: exposes the credential and lets an untrusted renderer create
  billable requests without a server-side control point.

### Direct main-process-to-provider request with a bundled key

- Rejected: main-process placement improves API isolation but does not prevent
  extraction of a credential shipped in a desktop application.

## Consequences if Accepted

- The AI diary feature has a new backend and authentication prerequisite.
- The upstream API Key can be rotated or revoked without shipping a client
  update, and the proxy can apply product-wide abuse controls.
- Hub implementation must add negative tests for spoofed senders, invalid
  payloads, repeated completion, unavailable proxy, and quota rejection.
