# Практична робота 10: Kubernetes, практична частина (рівень 75 балів)

**Виконав:** Саакян Давид Олександрович, група ІПЗ-32  
**Репозиторій (fork):** https://github.com/Deiv228/k8s-demo

---

## Рівень 60 балів

### 1. Локальний запуск та перевірка ендпоінтів
Застосунок клоновано з власного форку (`https://github.com/Deiv228/k8s-demo.git`), встановлено залежності (`npm install`) та запущено локально командою `npm run dev` на порту `8080`.

* **`GET /api/status`** — повертає JSON зі статусом роботи сервісу, поточним режимом (`appMode`), версією застосунку та поточною міткою часу (`{"status":"ok","appMode":"dev","version":"1.0.0",...}`).
* **`GET /api/items?filter=a`** — повертає JSON-масив тестових елементів, відфільтрованих за підрядком `a` (`[{"id":1,"name":"Item A"},...]`).
* **`GET /api/slow`** — імітує повільну обробку запиту із штучною затримкою перед відповіддю (`{"status":"ok","delayMs":2000}`).
* **`GET /api/error`** — перевіряє обробку помилок (залежно від `ERROR_MODE` повертає `{"status":"ok","message":"No error"}` або HTTP 500 при ввімкненому режимі збоїв).
* **`GET /healthz`** — технічний ендпоінт для Liveness-проби; повертає `ok` (HTTP 200), підтверджуючи, що процес застосунку живий і не завис.
* **`GET /ready`** — технічний ендпоінт для Readiness-проби; повертає `{"status":"ready"}` (HTTP 200), підтверджуючи готовність приймати трафік.

### 2. Контейнеризація застосунку
* **Команда збірки образу:** `docker build -t k8s-demo-app:1.0.0 .`
* **Команда запуску контейнера:** `docker run --rm -p 8080:8080 -e SECRET_TOKEN=local k8s-demo-app:1.0.0`
* **Приклад відповіді `GET /api/status` із контейнера:**
  ```json
  {"status":"ok","appMode":"dev","version":"1.0.0","timestamp":"2026-11-25T01:21:44.166Z"}
  ```

### 3. Запуск Minikube та перевірка кластера
Кластер запущено командою `minikube start --memory=2500 --cpus=2 --driver=docker`.
* **Використовуваний контекст (`kubectl config current-context`):** `minikube`
* **Статус ноди Minikube (`kubectl get nodes`):** `minikube` — `Ready` (роль `control-plane`, версія Kubernetes `v1.37.0`)

### 4. Розгортання ресурсів у кластері
Вивід команди `kubectl get deployment,rs,pods,svc -n k8s-demo`:

```text
NAME                           READY   UP-TO-DATE   AVAILABLE   AGE
deployment.apps/k8s-demo-api   2/2     2            2           2m52s

NAME                                      DESIRED   CURRENT   READY   AGE
replicaset.apps/k8s-demo-api-58498d59d    2         2         2       20s
replicaset.apps/k8s-demo-api-5c45559886   0         0         0       2m52s

NAME                                READY   STATUS        RESTARTS   AGE
pod/k8s-demo-api-58498d59d-2gc8r    1/1     Running       0          20s
pod/k8s-demo-api-58498d59d-fs4fb    1/1     Running       0          13s
pod/k8s-demo-api-5c45559886-xgmht   1/1     Terminating   0          2m52s

NAME                   TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)   AGE
service/k8s-demo-api   ClusterIP   10.102.226.80    <none>        80/TCP    2m52s
```

### 5. Доступ до сервісу через `kubectl port-forward`
При виконанні `kubectl port-forward svc/k8s-demo-api -n k8s-demo 8080:80` локальний запит на `localhost:8080` тунелюється через Kubernetes API Server до об'єкта **Service (`k8s-demo-api`, тип `ClusterIP`, порт `80/TCP`)**, який за селектором міток балансує трафік на один із активних **Pod-ів** застосунку (порт `8080`).

---

## Рівень 75 балів

### 1–2. Робота з `ConfigMap` та зміна `APP_MODE` без рестарту
1. Початково в `k8s-demo-config` було встановлено `APP_MODE: "dev"`, що підтвердила команда `kubectl exec` та відповідь `GET /api/status` (`"appMode":"dev"`).
2. Після зміни `APP_MODE: "prod"` у `k8s/configmap.yaml` та виконання `kubectl apply -f k8s/configmap.yaml` сам об'єкт `ConfigMap` оновився (`APP_MODE: prod`), проте запущений pod продовжував повертати `"appMode":"dev"`.
3. **Причина:** змінні середовища (`env` / `envFrom`) передаються процесу контейнера операційною системою лише один раз — під час створення Pod-а, і не оновлюються динамічно в уже запущеному процесі.

### 3. Перезапуск `Deployment` та оновлення конфігурації
1. Після `kubectl rollout restart deployment k8s-demo-api -n k8s-demo` виконано Rolling Update: створено нові pod-и зі значенням `APP_MODE="prod"` (підтверджено через `kubectl exec ... -- printenv APP_MODE`), після чого старі pod-и завершено.
2. **Рекомендований підхід:** додавання хешу вмісту ConfigMap в анотації шаблону Pod-а (`spec.template.metadata.annotations` через Helm/Kustomize) або використання контролера **Stakater Reloader** для автоматичного перезапуску при зміні ConfigMap.

### 4. Аналіз health-checkів (Liveness та Readiness)
* **Liveness-проба:** шлях `/healthz` (порт `8080`), `initialDelaySeconds: 5`, `periodSeconds: 10`, `failureThreshold: 3`. Перевіряє працездатність самого процесу; при 3 невдачах поспіль `kubelet` перезапускає контейнер.
* **Readiness-проба:** шлях `/ready` (порт `8080`), `initialDelaySeconds: 3`, `periodSeconds: 5`, `failureThreshold: 3`. Перевіряє готовність приймати трафік; при невдачі pod не перезапускається, а виключається з Endpoints сервісу.
