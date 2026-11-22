# Kubernetes demo(k8s)

## 1. Локальний запуск і перевірка ендпоінтів

Кроки: клонування форку, `npm install`, `npm run dev`.

Результати перевірки ендпоінтів:

| Ендпоінт              | Відповідь                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------ |
| `/api/status`         | `{"status":"ok","appMode":"dev","version":"1.0.0","timestamp":"2026-11-19T17:35:08.734Z"}` |
| `/api/items?filter=a` | `[{"id":1,"name":"Item A"}]`                                                               |
| `/api/slow`           | `{"status":"ok","delayMs":2000}`                                                           |
| `/api/error`          | `{"status":"ok","message":"No error"}`                                                     |
| `/healthz`            | `ok`                                                                                       |
| `/ready`              | `{"status":"ready"}`                                                                       |

---

## 2. Docker

**Збірка образу:**

```bash
docker build -t k8s-demo-app:1.0.0 .
```

**Запуск контейнера:**

```bash
docker run --rm -p 8080:8080 -e SECRET_TOKEN=local k8s-demo-app:1.0.0
```

**Приклад відповіді `/api/status`:**

```json
{
  "status": "ok",
  "appMode": "dev",
  "version": "1.0.0",
  "timestamp": "2026-11-19T17:46:24.353Z"
}
```

---

## 3. Minikube і базовий деплой

- Кластер запущено через `minikube start`; контекст `kubectl` — `minikube`.
- Статус ноди: **Ready**.
- Застосовано маніфести: namespace, configmap, secret, deployment, service.

**Вивід `kubectl get deployment,rs,pods,svc -n k8s-demo`:**

```text
PS C:\Users\Admin\Desktop\k8s-demo\k8s> kubectl get deployment,rs,pods,svc -n k8s-demo
NAME                           READY   UP-TO-DATE   AVAILABLE   AGE
deployment.apps/k8s-demo-api   2/2     2            2           10m

NAME                                      DESIRED   CURRENT   READY   AGE
replicaset.apps/k8s-demo-api-5c45559886   0         0         0       10m
replicaset.apps/k8s-demo-api-65596c66d    2         2         2       2m21s

NAME                               READY   STATUS    RESTARTS   AGE
pod/k8s-demo-api-65596c66d-r58cs   1/1     Running   0          2m15s
pod/k8s-demo-api-65596c66d-vhls5   1/1     Running   0          2m21s

NAME                   TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)   AGE
service/k8s-demo-api   ClusterIP   10.103.188.58   <none>        80/TCP    10m
```

**Port-forward** `svc/k8s-demo-api` на `8080:80` і перевірка:

```bash
curl http://localhost:8080/api/items
```

```json
[
  { "id": 1, "name": "Item A" },
  { "id": 2, "name": "Item B" },
  { "id": 3, "name": "Item C" }
]
```

---

## 4. Ingress і діагностика

Після налаштування Ingress Controller створено ресурс `k8s-demo-ingress` з host **`k8s-demo.local`**.

### Проблема

Під час перевірки прямого доступу до Minikube за адресою `192.168.49.2` Windows не зміг встановити TCP-з'єднання з портами `80` та `31149`.

### Діагностика

Використані команди: `minikube status`, `kubectl get svc`, `kubectl get endpoints`, `Test-NetConnection`.

Результат:

- Minikube працює через Docker Driver;
- Ingress Controller у стані `Running`;
- Service Ingress Controller має тип `NodePort`.

### Обхід

Використано `kubectl port-forward` напряму до Ingress Controller:

```bash
kubectl port-forward -n ingress-nginx deployment/ingress-nginx-controller 8080:80
```

Після створення тунелю виконано HTTP-запити з заголовком `Host: k8s-demo.local`:

| Запит             | Результат                                          |
| ----------------- | -------------------------------------------------- |
| `GET /api/status` | HTTP 200 OK, JSON із підтвердженням працездатності |
| `GET /api/items`  | HTTP 200 OK, список із трьох елементів             |

### Висновок

Підтверджено коректну роботу Ingress Controller, маршрутизації за Host, взаємодії із Service та доступності Express API. Проблема стосувалася мережевого доступу до Minikube з Windows, а не конфігурації застосунку.

### Debug-флоу

| Рівень  | Команда                                                           | Що показує                                                    |
| ------- | ----------------------------------------------------------------- | ------------------------------------------------------------- |
| Pod     | `kubectl get pods -n k8s-demo` / `kubectl logs <pod> -n k8s-demo` | Статус pod-ів, рестарти, логи застосунку                      |
| Service | `kubectl get svc,endpoints -n k8s-demo`                           | Тип і порти Service, чи є endpoints (IP pod-ів) за селектором |
| Ingress | `kubectl describe ingress -n k8s-demo`                            | Host, path, backend-сервіс, події контролера                  |

Додатково при помилках: `kubectl logs -n ingress-nginx <controller-pod>`, `kubectl get events -n k8s-demo`.

---

## 5. Шлях запиту через `k8s-demo.local`

```text
Клієнт (curl, Host: k8s-demo.local)
        │
        ▼
Ingress Controller (ingress-nginx) — вибирає правило за host/path з k8s-demo-ingress
        │
        ▼
Service k8s-demo-api (ClusterIP, порт 80) — балансує між pod-ами за endpoints
        │
        ▼
Pod k8s-demo-api (контейнер, порт 8080) — Express API
```

Запит із заголовком `Host: k8s-demo.local` потрапляє на Ingress Controller, який за правилами `k8s-demo-ingress` перенаправляє його на Service `k8s-demo-api` (порт 80). Service вибирає один зі справних pod-ів і передає запит на порт 8080 контейнера.

---

## 6. Власний сервіс

### Посилання на репозиторій

GitHub: <https://github.com/T1pOK220/parfumes-store>

### Короткий опис

**Perfumes Store API** — серверна частина вебзастосунку для магазину парфумерії на Node.js та Express. Сервіс забезпечує обмін даними між frontend і базою даних PostgreSQL, обробляє HTTP-запити та відповідає за бізнес-логіку.

Основні групи ендпоінтів:

- `/api/perfumes` — каталог парфумів;
- `/api/users` — користувачі;
- `/api/cart` — кошик;
- `/api/orders` — замовлення;
- `/api/favourites` — обрані товари.

Для перевірки доступності використовується ендпоінт `/health`.

### Dockerfile

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
EXPOSE 8080
CMD ["npm","run","start"]

```

### Збірка та запуск

```bash
docker build -t parfumes-api-node:1.0.0 .
docker run --rm -p 8081:8080 --env-file .env parfumes-api-node:1.0.0
```

### Приклад відповіді

```bash
curl http://localhost:8081/health
```

```text
{"status":"ok"}
```

## 7. ConfigMap і змінна APP_MODE

Перегляд ConfigMap, перезапуск Deployment і перевірка `APP_MODE` у новому pod-і.

```text
PS D:\Web-programming\k8s-demo> kubectl get configmap k8s-demo-config -n k8s-demo -o yaml
apiVersion: v1
data:
  APP_MODE: dev
  ERROR_MODE: "off"
  ...

PS D:\Web-programming\k8s-demo> kubectl rollout restart deployment k8s-demo-api -n k8s-demo
deployment.apps/k8s-demo-api restarted

PS D:\Web-programming\k8s-demo> kubectl get pods -n k8s-demo
NAME                            READY   STATUS    RESTARTS   AGE
k8s-demo-api-66bb889cf6-w4d4d   1/1     Running   0          3m4s
k8s-demo-api-66bb889cf6-x9828   1/1     Running   0          3m11s

PS D:\Web-programming\k8s-demo> kubectl exec -n k8s-demo k8s-demo-api-66bb889cf6-w4d4d -- env | Select-String APP_MODE

APP_MODE=dev
```

---

## 8. Зміна ConfigMap без перезапуску pod-ів

У файлі `k8s/configmap.yaml` значення `APP_MODE` змінено з `"dev"` на `"prod"`.

```text
PS D:\Web-programming\k8s-demo> kubectl get configmap k8s-demo-config -n k8s-demo -o yaml
apiVersion: v1
data:
  APP_MODE: prod
  ERROR_MODE: "off"
  ...
```

Перевірка в тому самому pod-і та через сервіс:

```text
PS D:\Web-programming\k8s-demo> kubectl exec -n k8s-demo k8s-demo-api-66bb889cf6-w4d4d -- env | Select-String APP_MODE

APP_MODE=dev
```

```text
PS D:\Web-programming\k8s-demo> curl.exe http://localhost:8080/api/status
{"status":"ok","appMode":"dev","version":"1.0.0","timestamp":"2026-11-20T14:08:21.919Z"}
```

**Чому значення APP_MODE у pod-і не змінилося.** `kubectl apply` оновлює лише об'єкт ConfigMap у кластері, але не контейнери, що вже працюють. Застосунок читає `process.env.APP_MODE` один раз під час запуску процесу, тож нове значення ConfigMap він не бачить.

**На якому етапі env-змінні потрапляють у контейнер.** Змінні з ConfigMap передаються в контейнер один раз, у момент його створення і запуску: kubelet читає ConfigMap і задає значення як змінні середовища процесу. Після старту контейнера вони не оновлюються.

---

## 9. Перезапуск Deployment і підтвердження оновленої конфігурації

```text
PS D:\Web-programming\k8s-demo> kubectl rollout restart deployment k8s-demo-api -n k8s-demo
deployment.apps/k8s-demo-api restarted

PS D:\Web-programming\k8s-demo> kubectl get pods -n k8s-demo
NAME                            READY   STATUS    RESTARTS   AGE
k8s-demo-api-5b77cf5975-89ctx   1/1     Running   0          99s
k8s-demo-api-5b77cf5975-ppjbm   1/1     Running   0          88s

PS D:\Web-programming\k8s-demo> kubectl exec -n k8s-demo k8s-demo-api-5b77cf5975-89ctx -- env | Select-String APP_MODE

APP_MODE=prod
```

```text
PS D:\Web-programming\k8s-demo> curl.exe http://localhost:8080/api/status
{"status":"ok","appMode":"prod","version":"1.0.0","timestamp":"2026-11-20T14:14:50.969Z"}
```

**Роль `kubectl rollout restart`.** Команда змінює шаблон pod-ів у Deployment (додає анотацію `kubectl.kubernetes.io/restartedAt`), тому Kubernetes створює новий ReplicaSet і нові pod-и, а старі поступово завершує (rolling update). Нові контейнери стартують із поточними значеннями ConfigMap, тож змінні середовища оновлюються.

**Рекомендований підхід до оновлення конфігурації з ConfigMap.** Змінити ConfigMap (краще через маніфест у git), виконати `kubectl apply -f k8s/configmap.yaml`, а потім `kubectl rollout restart deployment <ім'я> -n <namespace>`. Старі pod-и працюють, доки нові не стануть Ready, тому сервіс не зупиняється.

---

## 10. Використання kubectl logs і kubectl describe

```text
PS D:\Web-programming\k8s-demo> kubectl logs -n k8s-demo k8s-demo-api-5b77cf5975-89ctx
App started on port 8080 in mode prod
[2026-11-20T14:12:05.755Z] GET /ready 503 12ms
[2026-11-20T14:12:10.052Z] GET /healthz 200 3ms
[2026-11-20T14:12:10.738Z] GET /ready 200 2ms
[2026-11-20T14:12:15.739Z] GET /ready 200 1ms
[2026-11-20T14:12:20.050Z] GET /healthz 200 2ms
...
```

Рядок `App started on port 8080 in mode prod` підтверджує, що новий pod стартував з оновленою конфігурацією. У логах видно запити проб: `/healthz` кожні 10 секунд і `/ready` кожні 5 секунд.

```text
PS D:\Web-programming\k8s-demo> kubectl describe pod k8s-demo-api-5b77cf5975-89ctx -n k8s-demo
...
    Liveness:   http-get http://:8080/healthz delay=5s timeout=1s period=10s #success=1 #failure=3
    Readiness:  http-get http://:8080/ready delay=3s timeout=1s period=5s #success=1 #failure=3
    Environment Variables from:
      k8s-demo-config  ConfigMap  Optional: false
      k8s-demo-secret  Secret     Optional: false
...
```

У `describe` видно, що конфігурація підключається з ConfigMap `k8s-demo-config` і Secret `k8s-demo-secret`, а також параметри проб, які використано в розділі 11.

---

## 11. Аналіз health-checks (liveness та readiness)

Дані взято з виводу `kubectl describe pod k8s-demo-api-5b77cf5975-89ctx -n k8s-demo` (розділ 10).

Liveness:

- шлях: `/healthz`
- initialDelaySeconds: 5
- periodSeconds: 10
- failureThreshold: 3

Readiness:

- шлях: `/ready`
- initialDelaySeconds: 3
- periodSeconds: 5
- failureThreshold: 3

**Різниця між перевірками.** Liveness відповідає на питання, чи живий процес: якщо вона кілька разів поспіль провалюється, kubelet перезапускає контейнер. Readiness відповідає на питання, чи готовий застосунок приймати запити: якщо вона провалюється, контейнер не перезапускається, а pod прибирається з endpoints Service, і трафік на нього не йде, доки перевірка знову не пройде.

---

## 12. Самовідновлення pod-ів

```text
PS D:\Web-programming\k8s-demo> kubectl get pods -n k8s-demo
NAME                            READY   STATUS    RESTARTS   AGE
k8s-demo-api-5b77cf5975-89ctx   1/1     Running   0          11m
k8s-demo-api-5b77cf5975-ppjbm   1/1     Running   0          11m

PS D:\Web-programming\k8s-demo> kubectl delete pod k8s-demo-api-5b77cf5975-89ctx -n k8s-demo
pod "k8s-demo-api-5b77cf5975-89ctx" deleted from k8s-demo namespace

PS D:\Web-programming\k8s-demo> kubectl get pods -n k8s-demo
NAME                            READY   STATUS    RESTARTS   AGE
k8s-demo-api-5b77cf5975-kmljg   1/1     Running   0          36s
k8s-demo-api-5b77cf5975-ppjbm   1/1     Running   0          12m

PS D:\Web-programming\k8s-demo> kubectl get pods -n k8s-demo
NAME                            READY   STATUS    RESTARTS   AGE
k8s-demo-api-5b77cf5975-kmljg   1/1     Running   0          47s
k8s-demo-api-5b77cf5975-ppjbm   1/1     Running   0          13m
```

**Що відбулося.** Після видалення pod-а `k8s-demo-api-5b77cf5975-89ctx` одразу з'явився новий pod `k8s-demo-api-5b77cf5975-kmljg`, і кількість pod-ів знову стала дорівнювати двом.

**Чому pod створено автоматично.** Deployment керує ReplicaSet, а ReplicaSet постійно порівнює бажану кількість реплік (`replicas: 2`) із фактичною. Після видалення pod-а фактична кількість стала меншою за бажану, тому ReplicaSet створив новий pod за тим самим шаблоном.

---

## 13. Власний сервіс: Deployment і Service

Образ власного сервісу (`parfumes-api-node:1.0.0`) зібрано всередині Minikube:

```text
PS D:\Web-programming\k8s-demo> minikube image build -t parfumes-api-node:1.0.0 --build-opt=no-cache D:\Web-programming\parfumes-store\backend
...
#10 naming to docker.io/library/parfumes-api-node:1.0.0 done
#10 DONE 10.9s
```

Створено:

ConfigMap: `./k8s/parfumes-api-configmap.yaml`;

Deployment: `./k8s/parfumes-api-deployment.yaml`;

Service: `./k8s/parfumes-api-service.yaml`;

Застосування маніфестів і перевірка:

```text
PS D:\Web-programming\k8s-demo> kubectl apply -f k8s/parfumes-api-deployment.yaml
deployment.apps/parfumes-api created

PS D:\Web-programming\k8s-demo> kubectl apply -f k8s/parfumes-api-service.yaml
service/parfumes-api created

PS D:\Web-programming\k8s-demo> kubectl get deployment,svc,pods -n k8s-demo
NAME                           READY   UP-TO-DATE   AVAILABLE   AGE
deployment.apps/k8s-demo-api   2/2     2            2           27h
deployment.apps/parfumes-api   2/2     2            2           19h

NAME                   TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)   AGE
service/k8s-demo-api   ClusterIP   10.97.155.252   <none>        80/TCP    27h
service/parfumes-api   ClusterIP   10.97.154.140   <none>        80/TCP    19h

NAME                                READY   STATUS    RESTARTS      AGE
pod/k8s-demo-api-5b77cf5975-kmljg   1/1     Running   1 (18h ago)   26h
pod/k8s-demo-api-5b77cf5975-ppjbm   1/1     Running   1 (18h ago)   26h
pod/parfumes-api-9bcd8f48-hwplz     1/1     Running   0             7m51s
pod/parfumes-api-9bcd8f48-kn2xl     1/1     Running   0             9m2s
```

Перевірка через port-forward:

```text
PS D:\Web-programming\k8s-demo> kubectl port-forward svc/parfumes-api -n k8s-demo 8082:80
Forwarding from 127.0.0.1:8082 -> 8080
Forwarding from [::1]:8082 -> 8080
Handling connection for 8082
```

```text
PS D:\Web-programming\k8s-demo> curl.exe http://localhost:8082/health
{"status":"ok"}
```

---

## 14. ConfigMap і Secret для власного сервісу

ConfigMap `parfumes-api-config` і Secret `parfumes-api-secret` підключено в Deployment через `envFrom`. Вплив зміни конфігурації показано на змінній `NODE_ENV`: у файлі `k8s/parfumes-api-configmap.yaml` значення змінено з `"production"` на `"staging"`.

```text
PS D:\Web-programming\k8s-demo> kubectl get pods -n k8s-demo
NAME                            READY   STATUS    RESTARTS      AGE
k8s-demo-api-5b77cf5975-kmljg   1/1     Running   1 (18h ago)   27h
k8s-demo-api-5b77cf5975-ppjbm   1/1     Running   1 (18h ago)   27h
parfumes-api-9bcd8f48-hwplz     1/1     Running   0             24m
parfumes-api-9bcd8f48-kn2xl     1/1     Running   0             25m

PS D:\Web-programming\k8s-demo> kubectl exec -n k8s-demo parfumes-api-9bcd8f48-kn2xl -- env | Select-String NODE_ENV

NODE_ENV=production

PS D:\Web-programming\k8s-demo> kubectl apply -f k8s/parfumes-api-configmap.yaml
configmap/parfumes-api-config configured

PS D:\Web-programming\k8s-demo> kubectl get configmap parfumes-api-config -n k8s-demo -o yaml
apiVersion: v1
data:
  NODE_ENV: staging
  PORT: "8080"
kind: ConfigMap
metadata:
  name: parfumes-api-config
  namespace: k8s-demo
  resourceVersion: "30467"
  ...

PS D:\Web-programming\k8s-demo> kubectl exec -n k8s-demo parfumes-api-9bcd8f48-kn2xl -- env | Select-String NODE_ENV

NODE_ENV=production
```

До перезапуску pod-а значення лишається `production`. Після `rollout restart`:

```text
PS D:\Web-programming\k8s-demo> kubectl rollout restart deployment parfumes-api -n k8s-demo
deployment.apps/parfumes-api restarted

PS D:\Web-programming\k8s-demo> kubectl get pods -n k8s-demo
NAME                            READY   STATUS    RESTARTS      AGE
k8s-demo-api-5b77cf5975-kmljg   1/1     Running   1 (18h ago)   27h
k8s-demo-api-5b77cf5975-ppjbm   1/1     Running   1 (18h ago)   27h
parfumes-api-6fd5b978b6-4wd2p   1/1     Running   0             5m56s
parfumes-api-6fd5b978b6-kmmzk   1/1     Running   0             5m24s

PS D:\Web-programming\k8s-demo> kubectl exec -n k8s-demo parfumes-api-6fd5b978b6-4wd2p -- env | Select-String NODE_ENV

NODE_ENV=staging
```

---

## 15. Відповіді на контрольні запитання

**a. Відмінність між ConfigMap та Secret.**
ConfigMap призначений для нечутливої конфігурації (режим роботи, порти, прапорці), а Secret для чутливих даних (паролі, токени, рядки підключення). Обидва підключаються до pod-ів однаково, через змінні середовища або volume. Значення в Secret зберігаються в закодованому вигляді base64 (це не шифрування), але доступ до них можна обмежувати через RBAC, а `kubectl describe` їх не показує. У цій роботі `APP_MODE` лежить у ConfigMap, а `DATABASE_URL` і `SECRET_KEY` власного сервісу в Secret.

**b. Відмінність між liveness- та readiness-перевірками.**
Liveness перевіряє, чи живий контейнер: при кількох невдачах поспіль kubelet його перезапускає. Readiness перевіряє, чи готовий pod приймати трафік: при невдачі контейнер не перезапускається, а pod тимчасово прибирається з endpoints Service. У k8s-demo liveness використовує `/healthz`, readiness використовує `/ready`.

**c.i. Через які ресурси проходить запит при kubectl port-forward.**
Запит з `localhost:8080` потрапляє в тунель `kubectl port-forward`, далі до Service `k8s-demo-api` (порт 80), а Service спрямовує його на pod (порт контейнера 8080): localhost → port-forward → Service → pod.

**d. Як оновлювати конфігурацію, якщо вона надходить через env-змінні з ConfigMap.**
Змінні середовища читаються лише під час старту контейнера, тому після зміни ConfigMap потрібно виконати `kubectl apply -f k8s/configmap.yaml`, а потім `kubectl rollout restart deployment <ім'я> -n <namespace>`. Нові pod-и стартують з оновленими значеннями, а rolling update не перериває роботу сервісу.

**e. Міграція власного сервісу в Kubernetes і відмінності від демо k8s-demo.**
Для власного сервісу зібрано образ `parfumes-api-node:1.0.0` усередині Minikube, створено ConfigMap `parfumes-api-config`, Secret `parfumes-api-secret`, Deployment із двома репліками та Service типу ClusterIP (порт 80 на порт контейнера 8080). Доступ перевірено через `kubectl port-forward svc/parfumes-api 8082:80` та `curl.exe http://localhost:8082/health`.

Відмінності від k8s-demo:

- Для обох проб використано один ендпоінт `/health`, тоді як у k8s-demo їх два: `/healthz` та `/ready`.
- Сервіс залежить від зовнішньої бази даних PostgreSQL і не стартує без `DATABASE_URL`. Рядок підключення та `SECRET_KEY` передаються через Secret, створений командою, а не через файл у репозиторії (у k8s-demo Secret описаний у `k8s/secret.yaml` і містить лише тестовий токен).
- У ConfigMap додано `PORT=8080`, щоб порт збігався з Service і Dockerfile.
- Образ зібрано всередині Minikube й використано `imagePullPolicy: IfNotPresent`, бо в реєстрі такого образу немає.
- Сервіс запускається з OpenTelemetry (`npm run start`), тому старт триваліший, і для проб задано більші `initialDelaySeconds` (10 с для readiness, 20 с для liveness).
