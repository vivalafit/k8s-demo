# k8s-demo-app

Demo Node.js + Express service that shows how to containerize and deploy a simple API to Kubernetes with ConfigMaps, Secrets, health probes, Services, and Ingress.

## Features

- `/api/status` reports status, mode, version (`1.0.0`), and timestamp.
- `/api/items` serves a static catalog with optional `?filter=` substring search.
- `/api/slow` simulates latency using `SLOW_MS` or `?ms=` override.
- `/api/error` simulates deterministic or probabilistic failures via `ERROR_MODE`.
- `/healthz` (liveness) always returns `ok`.
- `/ready` (readiness) flips from `503` to `200` after `READINESS_DELAY_MS`, mimicking a DB connection bootstrapping phase.
- Structured request logs with response time, plus startup logs and an optional secret warning.

## Environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `8080` | HTTP port. |
| `APP_MODE` | `dev` | Included in `/api/status`. |
| `SLOW_MS` | `2000` | Default delay for `/api/slow`. |
| `ERROR_MODE` | `off` | `off`, `always`, or `probabilistic`. |
| `READINESS_DELAY_MS` | `5000` | Delay before `/ready` returns `ready`. |
| `SECRET_TOKEN` | _(required)_ | Opaque secret, only used to warn if missing. |

## Local development

```bash
npm install
npm run dev  # or npm start
curl http://localhost:8080/api/status
```

## Docker quickstart

```bash
docker build -t k8s-demo-app:1.0.0 .
docker run -p 8080:8080 --env SECRET_TOKEN=local k8s-demo-app:1.0.0
```

## Kubernetes manifests

`k8s/` contains ready-to-apply examples:

1. `namespace.yaml`
2. `configmap.yaml`
3. `secret.yaml`
4. `deployment.yaml`
5. `service.yaml`
6. `ingress.yaml`

Apply them with `kubectl apply -f k8s/` (after creating your own `SECRET_TOKEN`). Use `kubectl get/describe/logs` to inspect pods and Services. For Ingress testing on kind/minikube, add `k8s-demo.local` to `/etc/hosts`, then `curl http://k8s-demo.local/api/status`.
