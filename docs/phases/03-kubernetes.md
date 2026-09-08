# Phase 3 - Kubernetes

## Creating the Kubernetes Manifests

### 00-namespace.yaml - Namespace oluştur
- **Açıklama:** bugtracker adında bir namespace oluştur

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: bugtracker
```

### 01-configmap.yaml - Ortam değişkenleri ve gizli olmayan yapılandırma ayarları : 
- **Açıklama:** Uygulamanın çalışma anındaki (runtime) gizli olmayan ayarlarını barındırır. Backend ve frontend servisleri bu ayarlara `bugtracker-config` ismiyle erişecek.
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: bugtracker-config
  namespace: bugtracker
data:
  DB_DDL_AUTO: "update"
  DB_SHOW_SQL: "false"
  LOG_LEVEL: "INFO"
  SPRING_PROFILES_ACTIVE: "k8s"
```

### 02-secret.yaml - db bilgileri
```yaml
apiVersion: v
kind: Secret
metadata:
  name: bugtracker-secrets
  namespace: bugtracker
type: Opaque
data:
  # echo -n "bugtracker" | base64
  DB_USERNAME: YnVndHJhY2tlcg==
  # echo -n "bugtracker123" | base64
  DB_PASSWORD: YnVndHJhY2tlcjEyMw==
  # echo -n "jdbc:postgresql://postgres:5432/bugtracker" | base64
  DB_URL: amRiYzpwb3N0Z3Jlc3FsOi8vcG9zdGdyZXM6NTQzMi9idWd0cmFja2Vy
```

### 03-postgres-statefulset.yaml - PostgreSQL altyapısı
- **Açıklama:** Bu yaml, veri tabanının cluster içinde kalıcı bir şekilde çalışmasını sağlar. İki farklı Kubernetes nesnesi barındırır:
  1. **Headless Service (`kind: Service`):** `clusterIP: None` ayarı ile yük dengeleyiciyi aradan çıkarır. Backend servisinin veri tabanına direkt ve sabit bir DNS adı (`postgres:5432`) üzerinden bağlanmasını sağlar.
  2. **StatefulSet (`kind: StatefulSet`):** Durum bilgisi olan yani stateful veri tabanı podunu yönetir. Pod adı sabittir (`postgres-0`).
- **Önemli Özellikler:**
  - **Gizli Veri Entegrasyonu:** Veri tabanı kullanıcı adı ve şifresi `bugtracker-secrets` 'tan' güvenli bir şekilde çekilir (`valueFrom`).
  - **Kaynak Sınırları (Resources):** Veri tabanına RAM (256Mi - 512Mi) ve CPU (250m - 500m) limitleri konulmuştur.
  - **Sağlık Kontrolleri (Probes):** `pg_isready` komutu ile veri tabanının sağlığı (`liveness`) ve trafiğe hazır oluşu (`readiness`) sürekli denetlenir.
  - **Kalıcı Depolama (`volumeClaimTemplates`):** Pod silinse veya yeniden başlasa bile verilerin kaybolmaması için cluster'dan `1Gi` kalıcı disk (`ReadWriteOnce`) talep eder.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: postgres
  namespace: bugtracker
  labels:
    app: postgres
  spec:
    selector:
      app: postgres
    ports:
    - port: 5432
      targetPort: 5432
    clusterIP: None

---

apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
  namespace: bugtracker
spec:
  serviceName: postgres
  replicas: 1
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
      - name: postgres
        image: postgres:15-alpine
        ports:
        - containerPort: 5432
        env:
        - name: POSTGRES_DB
          value: "bugtracker"
        - name: POSTGRES_USER
          valueFrom:
            secretKeyRef:
              name: bugtracker-secrets
              key: DB_USERNAME
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: bugtracker-secrets
              key: DB_PASSWORD
        volumeMounts:
        - name: postgres-data
          mountPath: /var/lib/postgresql/data
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          exec:
            command:
            - pg_isready
            - -U
            - bugtracker
          initialDelaySeconds: 30
          periodSeconds: 10
          readinessProbe:
            exec:
              command:
              - pg_isready
              - -U
              - bugtracker
            initialDelaySeconds: 5
            periodSeconds: 5
  volumeClaimTemplates:
  - metadata:
      name: postgres-data
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: 1Gi
        storageClassName: standard
```

### 04-backend-deployment.yaml
- **Açıklama:** Backend servisini ayağa kaldırır ve cluser içi erişim ağını tanımlar. İki nesneden oluşur:
  1. **ClusterIP Service (`kind: Service`):** Backend podlarının önüne dahili bir yük dengeleyici koyar. Cluster içindeki (örneğin frontend) diğer bileşenlerin backend'e `http://backend:8081` adresinden ulaşmasını sağlar.
  2. **Deployment (`kind: Deployment`):** Durum bilgisi olmayan (stateless) backend podlarını yönetir. H.A. için `replicas: 2` ayarı ile 2 adet kopya pod çalıştırır.
- **Önemli Özellikler:**
  - **Dinamik Veri Enjeksiyonu:** `DB_URL`, `bugtracker-secrets` 'nesnesinden'; genel ayarlar (`DB_DDL_AUTO`, `LOG_LEVEL` vb.) ise `bugtracker-config` nesnesinden çekilerek ortama enjekte edilir.
  - **Gelişmiş Sağlık Kontrolleri:** Podların durumu Spring Boot Actuator (`/actuator/health`) üzerinden HTTP istekleriyle (`httpGet`) izlenir. `livenessProbe` ve trafiğe hazır olma (`readinessProbe`) durumları dinamik olarak denetlenir.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: backend
  namespace: bugtracker
  labels:
    app: backend
spec:
  selector:
    app: backend
  ports:
  - port: 8081
    targetPort: 8081
  type: ClusterIP

---

apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend
  namespace: bugtracker
spec:
  replicas: 2
  selector:
    matchLabels:
      app: backend
  template:
    metadata:
      labels:
        app: backend
    spec:
      containers:
      - name: backend
        image: dscc86y/bugtracker-backend:latest
        imagePullPolicy: Always
        ports:
        - containerPort: 8081
        env: 
        - name: DB_URL
          valueFrom:
            secretKeyRef:
              name: bugtracker-secrets
              key: DB_URL
        - name: DB_USERNAME
          valueFrom:
            secretKeyRef:
              name: bugtracker-secrets
              key: DB_USERNAME
        - name: DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: bugtracker-secrets
              key: DB_PASSWORD
        - name: DB_DDL_AUTO
          valueFrom:
            configMapKeyRef:
              name: bugtracker-config
              key: DB_DDL_AUTO
        - name: DB_SHOW_SQL
          valueFrom:
            configMapKeyRef:
              name: bugtracker-config
              key: DB_SHOW_SQL
        - name: SERVER_PORT
          value: "8081"
        - name: LOG_LEVEL
          valueFrom:
            configMapKeyRef:
              name: bugtracker-config
              key: LOG_LEVEL
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /actuator/health
            port: 8081
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /actuator/health
            port: 8081
          initialDelaySeconds: 10
          periodSeconds: 5
```