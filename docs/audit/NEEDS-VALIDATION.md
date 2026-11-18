# Needs validation

These three records are the only findings still open, and no code change can close them: each is a deployment fact only you can observe. All 14 confirmed findings are already fixed and deployed at `6b505b1`. Resolving these three takes about five minutes total.

## wave2/proxy-host-header-trust

Source trace. packages/core/src/node-server.js:79 reads first(x-forwarded-host) and first(x-forwarded-proto) whenever TRUST_PROXY is set, taking the leftmost comma-separated element. That value becomes request.url and feeds three security-relevant consumers: checkOrigin's comparison target at apps/admin/src/api.js:182, the Secure cookie flag derivation at api.js:150-153, and the certificate WhatsApp fileUrl at apps/admin/src/certificates.js:518. The public web app consumes only url.pathname, so it is not exposed.

Blocker. Render's edge behavior for client-supplied X-Forwarded-Host and X-Forwarded-Proto is a deployment property: if the edge overwrites the headers, the trust is sound; if it appends the client value ahead of its own, first() picks the attacker's value and the origin comparison target, the Secure flag, and the AttCos-fetched URL all become client-steerable behind a valid session. The run policy forbade contacting the deployed endpoint.

Owner check. Run from your own machine:

curl -sS -D - -X POST -H "X-Forwarded-Host: probe.invalid" -H "X-Forwarded-Proto: http" -H "Origin: http://probe.invalid" -d "{}" https://tnec-placement-admin.onrender.com/api/admin/login

A 403 origin rejection means the edge overwrote the headers and the trust is sound. Any other response means the client value survived. A second observation settles the Secure flag at the same time: log in over curl with a spoofed X-Forwarded-Proto: http and inspect the Set-Cookie line.

Independent of the result, the hardening stands: pin the derived host against ADMIN_URL and PUBLIC_WEB_URL in toRequest and derive the Secure flag from the same allowlist, so no proxy behavior is ever load-bearing for a security decision.

## wave2/trust-proxy-secure-cookie

Source trace. secureFor at apps/admin/src/api.js:149-152 sets the cookie's Secure flag from url.protocol, which under TRUST_PROXY comes from first(x-forwarded-proto) because Render terminates TLS in front of a plain-HTTP Node process. Without TRUST_PROXY the socket is never encrypted and the flag never sets. .env.example ships TRUST_PROXY=0; README.md documents TRUST_PROXY=1 for both Render services, and the working dashboard implies it is set, because an unset value would make checkOrigin reject every dashboard write.

Blocker. The actual TRUST_PROXY value on each Render service and the live Set-Cookie flags are deployment properties, and the run policy forbade contacting the deployed login endpoint.

Owner check. Option A: npm run render -- env list both and confirm TRUST_PROXY appears in each service's list; the masked names are enough. Option B: log into the dashboard in a browser, open devtools, and read the tnec_admin Set-Cookie line: it should read HttpOnly; Secure; SameSite=Strict; Max-Age. A missing Secure confirms the issue; its presence closes it.

## wave2/direct-port-reachability

Source trace. startServer at packages/core/src/node-server.js:119 binds 0.0.0.0 by default and neither app passes a host; both servers take PORT from the environment (apps/web/server.js:94, apps/admin/server.js:54). Under TRUST_PROXY every x-forwarded header is trusted from whatever peer connects, so an attacker reaching the process port directly, bypassing the TLS edge, controls the origin comparison target, the Secure flag, and the certificate URL completely.

Blocker. Whether Render publishes the raw TCP port of a web service alongside its HTTPS route is a platform property; the standard service shape routes only through the edge, which would close the path.

Owner check. In the Render dashboard, confirm no direct TCP port is published for tnec-placement-test (srv-dbt6h3tg1s2s738toue0) or tnec-placement-admin (srv-dbt6h3tg1s2s738touf0); each service should show only its onrender.com HTTPS route. If a direct port is ever published, bind to the edge interface or gate the proxy-header trust on the remote address.
