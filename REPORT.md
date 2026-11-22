# Звіт: розгортання `k8s-demo` у Docker та Kubernetes

## Мета роботи

Запустити демонстраційний Node.js-сервіс локально та в контейнері, розгорнути його в Minikube, перевірити HTTP-ендпоінти й дослідити ConfigMap, Secret, liveness та readiness probes.

> У звіті наведені отримані під час роботи виводи команд. Значення timestamp у відповідях API змінюється при кожному запиті. Команди для повторного експерименту з ConfigMap і діагностики Pod наведено окремо, щоб зафіксувати поведінку в конкретному кластері.

## 1. Локальний запуск і перевірка API

У каталозі проєкту встановлено залежності та запущено сервер:

```powershell
npm install
npm run dev
```

Сервіс слухає порт `8080`. Перевірено шість ендпоінтів:

| Запит | Отриманий результат |
| --- | --- |
| `GET /api/status` | `{"status":"ok","appMode":"dev","version":"1.0.0","timestamp":"2026-11-22T16:40:29.649Z"}` |
| `GET /api/items?filter=a` | `[{"id":1,"name":"Item A"}]` |
| `GET /api/slow` | `{"status":"ok","delayMs":2000}`; відповідь надходить із затримкою 2 секунди |
| `GET /api/error` | `{"status":"ok","message":"No error"}` за поточного `ERROR_MODE=off` |
| `GET /healthz` | `ok` |
| `GET /ready` | `{"status":"ready"}` після завершення початкової затримки готовності |

Приклад команд:

```powershell
curl.exe -s http://localhost:8080/api/status
curl.exe -s "http://localhost:8080/api/items?filter=a"
curl.exe -s http://localhost:8080/api/slow
curl.exe -s http://localhost:8080/api/error
curl.exe -s http://localhost:8080/healthz
curl.exe -s http://localhost:8080/ready
```

## 2. Docker

Образ зібрано, контейнер запущено з локальним значенням `SECRET_TOKEN` і пробросом порту:

```powershell
docker build -t k8s-demo-app:1.0.0 .
docker run --rm -p 8080:8080 -e SECRET_TOKEN=local k8s-demo-app:1.0.0
```

У контейнері перевірено:

```powershell
curl.exe -s http://localhost:8080/api/status
curl.exe -s http://localhost:8080/healthz
```

Приклад результату:

```text
{"status":"ok","appMode":"dev","version":"1.0.0","timestamp":"2026-11-22T16:46:42.278Z"}
ok
```

## 3. Minikube і базовий деплой

Кластер запускали з параметрами, зазначеними в завданні:

```powershell
minikube start --memory=4096 --cpus=2 --driver=docker
minikube profile list
kubectl config get-contexts
kubectl config use-context minikube
kubectl config current-context
kubectl get nodes
kubectl get pods -A
```

Зафіксовані результати:

- профіль `minikube`, драйвер `docker`, статус `OK`, одна нода;
- поточний контекст `kubectl` — `minikube`;
- нода `minikube` мала статус `Ready`;
- системні Pod-и в `kube-system` мали `READY 1/1` і `STATUS Running`.

Маніфести застосовано окремо:

```powershell
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secret.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
```

Перевірка ресурсів:

```powershell
kubectl get ns k8s-demo
kubectl get configmap,secret -n k8s-demo
kubectl get deployment,rs,pods,svc -n k8s-demo
```

Зафіксований стан застосунку:

```text
deployment.apps/k8s-demo-api   READY 2/2   UP-TO-DATE 2   AVAILABLE 2
pod/k8s-demo-api-69779f94f-cgsg8   1/1   Running   0
pod/k8s-demo-api-69779f94f-q4x6p   1/1   Running   0
service/k8s-demo-api   ClusterIP   10.109.41.31   <none>   80/TCP
```

### Доступ через Service

У першому терміналі запущено port-forward, у другому виконано запити:

```powershell
kubectl port-forward svc/k8s-demo-api -n k8s-demo 8080:80
curl.exe -s http://localhost:8080/api/status
curl.exe -s http://localhost:8080/api/items
```

Отримано:

```text
{"status":"ok","appMode":"prod","version":"1.0.0","timestamp":"2026-11-22T17:47:31.185Z"}
[{"id":1,"name":"Item A"},{"id":2,"name":"Item B"},{"id":3,"name":"Item C"}]
```

Port-forward прокладає локальний порт `8080` до порту `80` Service `k8s-demo-api`. Service пересилає запит на порт `8080` одного з відповідних Pod-ів.

## 4. ConfigMap: зміна APP_MODE та перезапуск Pod-ів

У файлі `k8s/configmap.yaml` фінальним залишено `APP_MODE: "prod"`. Для експерименту спочатку розгорнули Pod-и зі значенням `dev`, а потім змінили ConfigMap на `prod`.

Перевірка початкового значення в Pod-і:

```powershell
kubectl exec -n k8s-demo k8s-demo-api-69779f94f-mwl8q -- printenv APP_MODE
```

```text
dev
```

Перед зміною ConfigMap відповідь API також містила `"appMode":"dev"`. Далі `APP_MODE` у `k8s/configmap.yaml` змінено на `prod` і застосовано:

```powershell
kubectl apply -f k8s/configmap.yaml
kubectl get configmap k8s-demo-config -n k8s-demo -o jsonpath='{.data.APP_MODE}'
```

ConfigMap уже містив `prod`, але обидва раніше запущені Pod-и та API-відповідь усе ще показували `dev`:

```text
k8s-demo-api-69779f94f-mwl8q APP_MODE=
dev
k8s-demo-api-69779f94f-wv2hq APP_MODE=
dev
{"status":"ok","appMode":"dev","version":"1.0.0","timestamp":"2026-11-22T18:29:29.473Z"}
```

Після перезапуску Deployment:

```powershell
kubectl rollout restart deployment k8s-demo-api -n k8s-demo
kubectl rollout status deployment/k8s-demo-api -n k8s-demo --timeout=120s
kubectl get pods -n k8s-demo -l app=k8s-demo-api
```

З'явилися нові Pod-и зі статусом `Running`, `READY 1/1`; у них `APP_MODE=prod`:

```text
k8s-demo-api-84f5c96b54-7hwqv   1/1   Running   0
k8s-demo-api-84f5c96b54-m8kzz   1/1   Running   0
```

```powershell
kubectl exec -n k8s-demo k8s-demo-api-84f5c96b54-7hwqv -- printenv APP_MODE
curl.exe -sS http://localhost:8080/api/status
```

```text
prod
{"status":"ok","appMode":"prod","version":"1.0.0","timestamp":"2026-11-22T18:30:42.139Z"}
```

Після rollout port-forward завершився разом із Pod-ом, до якого було під'єднано тунель; його запущено повторно для фінальної перевірки API. У Windows PowerShell використано `printenv` усередині Linux-контейнера замість `grep APP_MODE`.

## 5. Liveness і Readiness

У `k8s/deployment.yaml` налаштовано:

| Probe | HTTP-шлях | `initialDelaySeconds` | `periodSeconds` | `failureThreshold` |
| --- | --- | ---: | ---: | --- |
| Liveness | `/healthz` | 5 | 10 | 3 (значення Kubernetes за замовчуванням) |
| Readiness | `/ready` | 3 | 5 | 3 (значення Kubernetes за замовчуванням) |

Поточну конфігурацію та події конкретного Pod-а можна перевірити так:

```powershell
kubectl get pods -n k8s-demo -l app=k8s-demo-api
kubectl describe pod <pod-name> -n k8s-demo
```

Фрагмент фактичного `kubectl describe pod` для Pod-а `k8s-demo-api-84f5c96b54-7hwqv`:

```text
Liveness:   http-get http://:8080/healthz delay=5s timeout=1s period=10s #success=1 #failure=3
Readiness:  http-get http://:8080/ready delay=3s timeout=1s period=5s #success=1 #failure=3
Warning  Unhealthy  Readiness probe failed: HTTP probe failed with statuscode: 503
```

`failureThreshold=3` підтверджено виводом `describe` (`#failure=3`); обидві перевірки використовують стандартне значення Kubernetes.

`Liveness` відповідає на запитання «чи процес ще працює?». Якщо перевірка не проходить достатню кількість разів, Kubernetes перезапускає контейнер. `Readiness` відповідає на запитання «чи можна вже надсилати цьому Pod-у трафік?». Якщо readiness-перевірка не проходить, Pod тимчасово вилучається з endpoint-ів Service, але сам контейнер не перезапускається лише через цю невдачу.

У цьому застосунку `/healthz` повертає `ok`, а `/ready` до завершення `READINESS_DELAY_MS` може повертати HTTP `503`; за замовчуванням затримка дорівнює 5000 мс. Після неї `/ready` повертає `{"status":"ready"}`.

## 6. Відповіді на контрольні запитання

### ConfigMap і Secret — у чому різниця?

`ConfigMap` призначений для звичайних налаштувань, наприклад `APP_MODE`, `SLOW_MS` та `ERROR_MODE`. `Secret` — для чутливих значень, зокрема `SECRET_TOKEN`, щоб відокремити їх від звичайної конфігурації та обмежувати доступ до них. Base64-кодування значення в Kubernetes Secret саме по собі не є шифруванням; для захисту потрібні відповідні налаштування доступу й зберігання кластера.

### Чим відрізняються Liveness і Readiness?

Liveness визначає, чи слід перезапустити контейнер, який перестав нормально працювати. Readiness визначає, чи готовий Pod приймати трафік. Неготовий Pod не отримує трафік від Service, але може продовжувати працювати й згодом стати готовим.

### Який шлях проходить запит через port-forward і через `k8s-demo.local`?

- Через port-forward: `curl` → локальний `localhost:8080` → тунель `kubectl port-forward` → Service `k8s-demo-api:80` у namespace `k8s-demo` → порт `8080` вибраного Pod-а.
- Через Ingress: DNS/запис hosts для `k8s-demo.local` → Ingress Controller → правило host/path ресурсу `k8s-demo-ingress` → Service `k8s-demo-api:80` → порт `8080` Pod-а. Для цього мають бути встановлені/увімкнені Ingress Controller, застосований `k8s/ingress.yaml` і налаштований доступ до IP Minikube. Наявність маніфесту сама по собі ще не гарантує, що домен доступний із хоста.

### Як правильно оновлювати конфігурацію через env/ConfigMap?

Змінити значення в ConfigMap і виконати `kubectl apply -f k8s/configmap.yaml`. Якщо ConfigMap використаний як джерело env-змінних (`envFrom`), процес контейнера вже отримав їх при запуску, тож для підхоплення нових значень потрібно перезапустити Pod-и, наприклад `kubectl rollout restart deployment k8s-demo-api -n k8s-demo`, і дочекатися успішного rollout. Потім перевірити значення через `kubectl exec ... -- printenv APP_MODE` та API-відповідь. Для оновлення Secret застосовується аналогічний підхід.
