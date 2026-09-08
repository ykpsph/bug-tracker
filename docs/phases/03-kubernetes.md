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

### 05-frontend-deployment.yaml
- **Açıklama:** Frontend'i ayağa kaldırır ve cluster içi ağ iletişimini sağlar. İki nesneden oluşur:
  1. **ClusterIP Service (`kind: Service`):** Frontend podlarının önüne dahili bir yük dengeleyici koyarak cluster içinden 3000 portu ile erişim sağlar.
  2. **Deployment (`kind: Deployment`):** Durum bilgisi olmayan, yani durumsuz (stateless) frontend podlarını yönetir. `replicas: 2` ayarı ile H.A. sunar.
- **Önemli Özellikler:**
  - **API Yönlendirmesi (Reverse Proxy Hazırlığı):** `VITE_API_URL: "/api"` ortam değişkeni tanımlanarak, frontend'in backend isteklerini doğrudan `/api` path'ine yapması sağlanmıştır.
  - **Optimize Kaynak Yönetimi:** (128Mi - 256Mi RAM) cluster kaynakları optimize edilmiştir.
  - **Sağlık Kontrolleri:** Pod sağlığı, uygulamanın kök dizinine (`/`) yapılan HTTP GET istekleriyle düzenli olarak doğrulanır.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: frontend
  namespace: bugtracker
  labels:
    app: frontend
spec:
  selector:
    app: frontend
  ports:
  - port: 3000        # Service'in dinlediği port
    targetPort: 3000  # Pod'un dinlediği port
  type: ClusterIP

---

apiVersion: apps/v1
kind: Deployment
metadata:
  name: frontend
  namespace: bugtracker
  labels:
    app: frontend
spec:
  replicas: 2
  selector:
    matchLabels:
      app: frontend
  template:
    metadata:
      labels:
        app: frontend
    spec:
      containers:
      - name: frontend
        image: dscc86y/bugtracker-frontend:latest
        imagePullPolicy: Always
        ports:
        - containerPort: 3000     # Container içinde Nginx'in (fe uygulaması) dinlediği  port
        env:
        - name: VITE_API_URL
          value: "/api"
        resources:
          requests:
            memory: "128Mi"
            cpu: "250m"
          limits:
            memory: "256Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 5
```

## Final
**Açıklama:** Tüm manifestolar hazırlandıktan sonra, projenin Kubernetes üzerinde ayağa kaldırılması ve durumunun doğrulanması için aşağıdaki adımlar takip edilir.
  - `kubernetes/` altındaki tüm YAML dosyalarını tek seferde sıralı bir şekilde cluster'a yükle :
```text
kubectl apply -f kubernetes/
```
**beklenen output:** 
```text
namespace/bugtracker created
configmap/bugtracker-config created
secret/bugtracker-secrets created
service/postgres created
statefulset.apps/postgres created
service/backend created
deployment.apps/backend created
service/frontend created
deployment.apps/frontend created
```

  - Oluşturulan tüm nesnelerin durumunu, podların ayağa kalkma süreçlerini ve ağ yapılandırmasını doğrulamak için `bugtracker` namespace'i altındaki tüm kaynakları listeleyin:

```yaml
kubectl get all -n bugtracker

veya canlı takip etmek için :

kubectl get pods -n bugtracker -w
```

**beklenen output :**
```text
NAME                            READY   STATUS    RESTARTS      AGE
pod/backend-56dbf557bd-2nrxh    0/1     Running   2 (75s ago)   4m27s
pod/backend-56dbf557bd-xqm4l    0/1     Running   2 (45s ago)   4m27s
pod/frontend-846dc949f7-skglj   1/1     Running   0             4m27s
pod/frontend-846dc949f7-v7tzw   1/1     Running   0             4m27s
pod/postgres-0                  0/1     Pending   0             24s

NAME               TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)    AGE
service/backend    ClusterIP   10.105.118.202   <none>        8081/TCP   4m27s
service/frontend   ClusterIP   10.98.61.87      <none>        3000/TCP   4m27s
service/postgres   ClusterIP   None             <none>        5432/TCP   82s

NAME                       READY   UP-TO-DATE   AVAILABLE   AGE
deployment.apps/backend    0/2     2            0           4m27s
deployment.apps/frontend   2/2     2            2           4m27s

NAME                                  DESIRED   CURRENT   READY   AGE
replicaset.apps/backend-56dbf557bd    2         2         0       4m27s
replicaset.apps/frontend-846dc949f7   2         2         2       4m27s

NAME                        READY   AGE
statefulset.apps/postgres   0/1     24s
```



## İleri Düzey Troubleshooting
Bu projenin Kubernetes ortamına taşınması esnasında karşılaşılan kritik altyapısal, senkronizasyonel ve uygulama seviyesindeki hatalar, nedenleri ve kalıcı çözüm yolları aşağıda listelenmiştir.
### 1. StatefulSet Canlı Güncelleme Kısıtlaması (Forbidden Updates) 
**Karşılaşılan Hata:** 
  `The StatefulSet "postgres" is invalid: spec: Forbidden: updates to statefulset spec for fields other than 'replicas'... are forbidden`
* **Nedeni:** Kubernetes, veri bütünlüğünü ve güvenliğini korumak amacıyla canlı çalışan bir `StatefulSet` nesnesinin disk şablon yapısının (`volumeClaimTemplates`) çalışma anında değiştirilmesine izin vermez.
* **Çözümü:** Mevcut yapının terminalden silinip manifestonun sıfırdan, temiz bir şekilde uygulanması gerekir:
  ```bash
  kubectl delete statefulset postgres -n bugtracker
  kubectl apply -f kubernetes/03-postgres-statefulset.yaml
  ```
  ---
### 2. Asılı Kalan Eski PVC Kilitlenmesi (Pending PVC & StorageClass) 
**Karşılaşılan Hata:** `postgres-0` podunun sürekli `Pending` kalması ve `kubectl describe` komutunda şu uyarının çıkması:
  `0/1 nodes are available: pod has unbound immediate PersistentVolumeClaims.`
  * **Nedeni:** 
  1. Lokal Kubernetes cluster'ının varsayılan olarak `standard` isminde bir (`StorageClass`) tanımlı olmaması.
  2. Kubernetes mimarisinde bir StatefulSet silinse bile, onun talep ettiği Kalıcı Disk İstekleri (`PersistentVolumeClaim - PVC`) veri kaybını önlemek amacıyla **otomatik olarak silinmez**. Yeni kurulan StatefulSet, arkada asılı kalan eski ve hatalı PVC'ye yapışarak kilitlenir.
   * **Çözümü:** 
  3. `03-postgres-statefulset.yaml` dosyasındaki `storageClassName: standard` satırı kaldırılarak veya `storageClassName: ""` (boş string) yapılarak cluster'ın varsayılan disk sağlayıcısını seçmesi tetiklenir.
  4. Ardından asılı kalan eski disk isteği manuel olarak temizlenir ve sistem yeniden ayağa kaldırılır:
  ```bash
  kubectl delete pvc postgres-data-postgres-0 -n bugtracker
  kubectl apply -f kubernetes/03-postgres-statefulset.yaml
  ```
---
### 3. Zaman Aşımı ve Erken Ölüm Döngüsü (Probe Timeout & CrashLoopBackOff)
**Karşılaşılan Hata:** Backend podlarının sürekli `Running` ve `0/1 READY` arasında gidip gelmesi, ardından `CrashLoopBackOff` durumuna düşerek sürekli restart atması.
* **Nedeni:** Java/Spring Boot uygulamalarının lokal ortamlarda ayağa kalkması ve web context'ini ilklendirmesi (Tomcat'in başlaması, veri tabanı bağlantı havuzunun kurulması) genellikle **30-40 saniye** kadar sürebilir. Ancak `livenessProbe.initialDelaySeconds` değeri çok düşük (örn. 30 saniye) tutulduğunda, Kubernetes uygulama henüz hazır olmadan sağlık kontrolü yapar. Yanıt alamayınca uygulamanın kilitlendiğini varsayıp podu **yarıda keserek öldürür ve yeniden başlatır**. Bu da sonsuz bir restart döngüsü yaratır.
* **Çözümü:** Uygulamaya rahatça ayağa kalkabilmesi için gereken tolerans süresi tanınır. `initialDelaySeconds` değeri **90 saniyeye** çıkarılarak Kubernetes'in sabırla beklemesi sağlanır:
  ```yaml
  livenessProbe:
    httpGet:
      path: /actuator/health
      port: 8081
    initialDelaySeconds: 90  # Uygulamanın kalkış süresine tolerans tanındı
    periodSeconds: 15
  ```
### 4. Sağlık Kontrolü Endpoint Eksikliği & Spring Security Engeli
* **Karşılaşılan Hata:** Backend loglarında `HikariPool-1 - Start completed` ve `Initialized JPA EntityManagerFactory` yazmasına, yani uygulama başarıyla çalışmasına rağmen podun asla `1/1 READY` konumuna geçmemesi.
* **Nedeni:** 
  1. Projede `spring-boot-starter-actuator` bağımlılığı tanımlı değilse `/actuator/health` adresi fiziksel olarak mevcut değildir.
  2. Bağımlılık mevcut olsa bile, **Spring Security** devreye girerek bu endpoint'i koruma altına almış (şifrelemiş) olabilir. Kubernetes içeriye HTTP isteği attığında `401 Unauthorized` veya `404 Not Found` alır ve podu asla güvenli/trafiğe hazır (`READY`) kabul etmez.
* **Çözümü:** 
  3. Geçici/Pratik çözüm olarak manifestodaki probe yolları, projenin güvenlik koruması altında olmayan ve doğrudan veri dönen çalışan bir endpoint'ine (örn. `path: /api/bugs`) yönlendirilir.
  4. Kalıcı çözüm olarak `application.properties` (veya `application-k8s.properties`) dökümanında Actuator endpoint'leri Spring Security filtrelerinden muaf tutulur ve herkese açık (`public`) hale getirilir.
---
### 5. `:latest` İmaj Önbellek Tuzağı (Image Cache Illusion)
* **Karşılaşılan Durum:** Kod üzerinde (örneğin Spring ayarlarında) bir düzeltme yapılıp `docker build` ve `docker push` ile aynı isimle (`:latest`) Docker Hub'a gönderilmesine rağmen, Kubernetes'in yeni kodu algılamayıp eski hatalı kodla çalışmaya devam etmesi.
* **Nedeni:** Kubernetes, imajın etiketi (tag'i) değişmediği sürece (`:latest` olarak sabit kaldığı için) Docker Hub'da yeni bir kod olduğunu fark etmeyebilir ve kendi lokal önbelleğindeki (cache) eski imaj katmanlarını kullanmaya devam eder.
* **Çözümü:** 
  1. `04-backend-deployment.yaml` dosyası altına `imagePullPolicy: Always` satırı eklenerek Kubernetes'in her açılışta Docker Hub'ı kontrol etmesi zorunlu kılınır.
  2. Versiyon numarası artırmadan sadece `:latest` üzerinden hızlı geliştirme yapılan süreçlerde, Docker Hub'a push işleminden hemen sonra şu sihirli komut çalıştırılarak podların yeni imajı çekerek baştan başlaması tetiklenir:
  ```bash
  kubectl rollout restart deployment/backend -n bugtracker
  ```

---

## UYGULAMA KUBERNETES'E DEPLOY EDİLDİ
![alt text](/docs/images/image-138.png)
![alt text](/docs/images/image-140.png)

---

```
-------------
|     |     |
|     v     |
-------------
```

---

## Gelecekte Yapılabilecekler (Kubernetes Derinleşme Yol Haritası)

Projenin Kubernetes altyapısı şu an kararlı bir şekilde çalışmaktadır. Mimariyi daha ölçeklenebilir, güvenli ve profesyonel hale getirmek için bir sonraki aşamalarda uygulanabilecek DevOps pratikleri aşağıda listelenmiştir:

---

### 1. Sıfır Kesinti ile Sürüm Yönetimi (Rolling Update & Rollback)
Uygulama canlıdayken kullanıcılara hiçbir kesinti (downtime) yaşatmadan yeni versiyonları yayına almak veya olası bir hata anında saniyeler içinde eski kararlı sürüme geri dönmek için:
- Uygulamanın kendisinde bazı değişiklikler yapılabilir ve bu değişiklikleri canlıya alırken DevOps practice'leri yapılmış olur. (dashboard, user, vesaire)

* **Backend İmajını Yeni Sürüme Güncelleme:**
  ```bash
  kubectl set image deployment/backend backend=dscc86y/bugtracker-backend:v1.0.1 -n bugtracker
  ```
* **Hata Anında Anında Geri Sarma (Rollback):**
  ```bash
  kubectl rollout undo deployment/backend -n bugtracker
  ```

---

### 2. Dinamik Ölçeklendirme (Horizontal Pod Autoscaling - HPA)
Sisteme ani bir kullanıcı yükü geldiğinde (örneğin işlemci tüketimi arttığında) backend pod sayısını otomatik olarak artırmak, yük azaldığında ise kaynak tasarrufu için pod sayısını kısmak için:

* **İşlemci Yüküne Göre Otomatik Ölçeklendirme Kurma:**
  ```bash
  kubectl autoscale deployment backend -n bugtracker --cpu-percent=50 --min=2 --max=5
  ```
  *(Bu komut, CPU kullanımı %50'yi geçtiğinde pod sayısını otomatik olarak minimum 2'den maksimum 5'e kadar yükseltir).*

---

### 3. Gelişmiş Trafik Yönetimi (Ingress Controller)
Şu an kullanılan geçici `port-forward` yöntemi yerine, gerçek bir üretim ortamında olduğu gibi uygulamayı tek bir IP ve profesyonel bir alan adı üzerinden dış dünyaya açmak için:

* **Altyapı:** Lokal ortamda gerçek bir LoadBalancer IP'si üretebilmek için **MetalLB** ve trafiği yönlendirmek için **NGINX Ingress Controller** kurulumu.
* **Hedef:** Tarayıcıya `http://bugtracker.local` yazıldığında Ingress kuralları sayesinde trafiğin otomatik olarak frontend ve backend servislerine dağıtılması.

---

###  4. Kaynak Sınırları ve Optimizasyon (Resource Limits & Requests)
* **Durum:** **Tamamlandı.**
* **Açıklama:** Kümedeki kaynakların adil dağılması ve podların birbirini ezmemesi için tüm dağıtımlara (`Deployment`/`StatefulSet`) RAM ve CPU üst/alt sınırları halihazırda başarıyla enjekte edilmiştir.

---

### 5. Ağ Seviyesinde Güvenlik (Network Policies)
Varsayılan olarak Kubernetes kümesindeki tüm podlar birbirleriyle serbestçe konuşabilir. Güvenliği artırmak (Zero-Trust mimarisi) için ağ politikaları uygulanabilir:

* **Hedef:** Veri tabanının (`PostgreSQL`) dış dünyadan veya frontend podlarından gelebilecek doğrudan ataklara kapatılması; **yalnızca ve yalnızca** `backend` podlarından gelen ağ isteklerini kabul edecek şekilde sınırlandırılması.




> çalışma sonu : 09.09.2026 02:10 AM