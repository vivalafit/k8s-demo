# k8s-demo-app

Демо‑сервіс на Node.js + Express, який показує повний шлях “код → Docker → Kubernetes”: робота з ConfigMap/Secret, probes, Service та Ingress.

## Функціональність

- `/api/status` повертає статус, режим (`APP_MODE`), версію (`1.0.0`) та поточний timestamp.
- `/api/items` віддає статичний список об’єктів із підтримкою `?filter=` (substring search).
- `/api/slow` симулює затримку через `SLOW_MS` або `?ms=`.
- `/api/error` імітує `error/off/probabilistic` поведінку залежно від `ERROR_MODE`.
- `/healthz` (liveness) завжди відповідає `ok`.
- `/ready` (readiness) повертає `503` поки не мине `READINESS_DELAY_MS`, далі `200`.
- Кожен запит логуються з методом, шляхом, статусом і часом обробки; є стартові логи та попередження, якщо `SECRET_TOKEN` не заданий.

## Змінні середовища

| Змінна | За замовчуванням | Опис |
| --- | --- | --- |
| `PORT` | `8080` | HTTP‑порт сервісу. |
| `APP_MODE` | `dev` | Відображається у `/api/status`. |
| `SLOW_MS` | `2000` | Затримка за замовчуванням для `/api/slow`. |
| `ERROR_MODE` | `off` | `off` / `always` / `probabilistic`. |
| `READINESS_DELAY_MS` | `5000` | Скільки мс /ready лишається неготовим. |
| `SECRET_TOKEN` | _(required)_ | Секрет; лише попередження в логах, якщо відсутній. |

## Локальний запуск

```bash
# встановлюємо залежності
npm install
# запускаємо сервіс (можна npm start)
npm run dev
# швидко перевіряємо статус
curl http://localhost:8080/api/status
```

## Docker

```bash
# збираємо контейнер
docker build -t k8s-demo-app:1.0.0 .
# запускаємо образ з пробросом порту та секретом
docker run -p 8080:8080 --env SECRET_TOKEN=local k8s-demo-app:1.0.0
```

## Kubernetes‑маніфести

Папка `k8s/` містить:

1. `namespace.yaml` — ізоляція середовища `k8s-demo`.
2. `configmap.yaml` — неконфіденційні env (режим, затримки, error mode).
3. `secret.yaml` — `SECRET_TOKEN` у base64.
4. `deployment.yaml` — образ, кількість реплік, probes, ресурси.
5. `service.yaml` — ClusterIP для доступу до pod-ів.
6. `ingress.yaml` — дружній домен `k8s-demo.local`.

Застосування всієї папки:

```bash
# застосовуємо всі маніфести (можна одразу папку)
kubectl apply -f k8s/
```

Після змін ConfigMap/Secret: `kubectl apply -f k8s/<файл>.yaml && kubectl rollout restart deployment k8s-demo-api -n k8s-demo`.

---

## Що було пройдено на лекції

### 1. Локальний сервіс
```bash
# ставимо залежності
npm install
# запускаємо dev-режим (можна npm start)
npm run dev
# запитуємо ключові ендпоінти
curl http://localhost:8080/api/status
curl http://localhost:8080/api/items?filter=a
curl http://localhost:8080/api/slow
curl http://localhost:8080/api/error
curl http://localhost:8080/ready
# перезапуск із кастомними env
APP_MODE=prod ERROR_MODE=always SLOW_MS=3000 npm start
# перевіряємо, що env подіяли
curl http://localhost:8080/api/status
curl http://localhost:8080/api/slow
```
> Можна міняти поведінку локально через `APP_MODE`, `SLOW_MS`, `ERROR_MODE`, `READINESS_DELAY_MS`.

### 2. Docker
```bash
# збираємо prod-образ
docker build -t k8s-demo-app:1.0.0 .
# ганяємо контейнер локально з секретом
docker run --rm -p 8080:8080 -e SECRET_TOKEN=local k8s-demo-app:1.0.0
```

### 3. Minikube та контекст kubectl
```bash
# підіймаємо кластер
minikube start --memory=4096 --cpus=2 --driver=docker
# дивимось доступні профілі
minikube profile list
# звіряємося з kubectl контекстами
kubectl config get-contexts
# перемикаємось на minikube
kubectl config use-context minikube
# перевіряємо стан нод
kubectl get nodes
# дивимося системні поди у всіх namespaces
kubectl get pods -A
# як зупинити та видалити профіль
minikube stop
minikube delete
```

### 4. Namespace / ConfigMap / Secret
```bash
# створюємо namespace
kubectl apply -f k8s/namespace.yaml
# додаємо ConfigMap з налаштуваннями
kubectl apply -f k8s/configmap.yaml
# додаємо Secret із SECRET_TOKEN
kubectl apply -f k8s/secret.yaml
# перевіряємо, що namespace існує
kubectl get ns k8s-demo
# дивимося, що ConfigMap і Secret доступні
kubectl get configmap,secret -n k8s-demo
```

### 5. Deployment + Service
```bash
# створюємо Deployment
kubectl apply -f k8s/deployment.yaml
# створюємо Service
kubectl apply -f k8s/service.yaml
# дивимося всі ключові ресурси
kubectl get deployment,rs,pods,svc -n k8s-demo
# розбираємо Deployment детально
kubectl describe deployment k8s-demo-api -n k8s-demo
# проброс порту через Service
kubectl port-forward svc/k8s-demo-api -n k8s-demo 8080:80
curl http://localhost:8080/api/status
# перевіряємо IP pod-ів / на якій ноді
kubectl get pods -o wide -n k8s-demo
# видаляємо pod аби побачити самовідновлення ReplicaSet
kubectl delete pod <pod-name> -n k8s-demo
```

### 6. Probes/Readiness
```bash
# стежимо за READY-статусом
kubectl get pods -n k8s-demo
# дивимося події readiness/liveness
kubectl describe pod <pod-name> -n k8s-demo
# читаємо логи всіх реплік
kubectl logs deployment/k8s-demo-api -n k8s-demo -f
# змінюємо ConfigMap (наприклад READINESS_DELAY_MS)
kubectl apply -f k8s/configmap.yaml
# перезапускаємо Deployment, щоб підтягнути нові env
kubectl rollout restart deployment k8s-demo-api -n k8s-demo
```

### 7. Ingress
```bash
# вмикаємо Ingress Controller
minikube addons enable ingress
# збираємо образ усередині Minikube
minikube image build -t maxnavrotsky/k8s-demo-app:1.0.0 .
# застосовуємо Ingress-маніфест
kubectl apply -f k8s/ingress.yaml
# додаємо домен у /etc/hosts
echo "127.0.0.1 k8s-demo.local" | sudo tee -a /etc/hosts
# тримаємо tunnel активним
sudo minikube tunnel
# дивимося Ingress
kubectl get ingress -n k8s-demo
# тестуємо дружній URL
curl http://k8s-demo.local/api/status
```

### 8. Debug flow
```bash
# загальний знімок namespace
kubectl get all -n k8s-demo
# дивимося конкретні pod-и
kubectl get pods -n k8s-demo
# події та стан pod-а
kubectl describe pod <pod-name> -n k8s-demo
# логи конкретної pod-и
kubectl logs pod/<pod-name> -n k8s-demo
# дивимося Service
kubectl get svc -n k8s-demo
kubectl describe svc k8s-demo-api -n k8s-demo
# аналізуємо Ingress
kubectl get ingress -n k8s-demo
kubectl describe ingress k8s-demo-ingress -n k8s-demo
# логи Ingress Controller
kubectl logs -n ingress-nginx deploy/ingress-nginx-controller
# всі події в namespace
kubectl get events -n k8s-demo --sort-by=.metadata.creationTimestamp
```

> Для швидкої перевірки всього неймспейсу: `kubectl get all -n k8s-demo`. Це показує pod-и, Service, Deployment та ReplicaSet у поточному стані.
