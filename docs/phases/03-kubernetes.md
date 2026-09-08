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