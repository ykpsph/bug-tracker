# CI/CD Kurulumu

Bu doküman, **Bug Tracker** projesinin AWS EKS'e otomatik olarak deploy edilmesi için kurduğum CI/CD pipeline'ının hikâyesini anlatır.

Özellikle **GitHub Actions → AWS OIDC entegrasyonu sırasında karşılaştığım `AssumeRoleWithWebIdentity` sorununu**, nasıl teşhis ettiğimi ve nasıl çözdüğümü detaylı şekilde ele alır.

---

## 1. Amaç ?

CI/CD kurmadan önce uygulamayı AWS'e manuel olarak deploy ediyordum:

```text
Local
  ↓
docker build
  ↓
docker tag
  ↓
docker push
  ↓
Amazon ECR
  ↓
kubectl set image
  ↓
Amazon EKS
```

Bu yöntemde her değişiklikte image'ı manuel olarak build etmek, ECR'a push etmek ve EKS'teki deployment'ı güncellemek gerekiyordu.

### Hedef

Artık yalnızca:

```bash
git push origin main
```

yapıldığında aşağıdaki işlemlerin otomatik gerçekleşmesini istedim:

1. Backend'in build edilmesi
2. Frontend'in build edilmesi
3. Docker image'larının oluşturulması
4. Image'ların Amazon ECR'a push edilmesi
5. EKS deployment'larının yeni image'larla güncellenmesi

---

# 2. Hedef Mimari

```text
                    git push
                       │
                       ▼
              ┌─────────────────┐
              │ GitHub Actions  │
              └────────┬────────┘
                       │
             ┌─────────┼─────────┐
             ▼         ▼         ▼
       Backend Build  Frontend   Deploy
          & Push       Build      to EKS
             │           │          │
             └──────┬────┘          │
                    ▼               │
             ┌─────────────┐        │
             │ Amazon ECR  │        │
             │             │        │
             │ backend:<sha>       │
             │ frontend:<sha>      │
             └──────┬──────┘       │
                    │              │
                    └──────┬───────┘
                           ▼
                  ┌─────────────────┐
                  │   Amazon EKS    │
                  │                 │
                  │ bugtracker      │
                  │ namespace       │
                  │                 │
                  │ Backend        │
                  │ Frontend       │
                  └─────────────────┘
```

Pipeline üç ana job'dan oluşuyor:

- **Job 1:** Backend Build & Push
- **Job 2:** Frontend Build & Push
- **Job 3:** Deploy to EKS

Image tag'lerinde Git commit SHA kullanıyorum:

```text
bugtracker-backend:<commit-sha>
bugtracker-frontend:<commit-sha>
```

Böylece hangi deployment'ın hangi commit'e ait olduğu açıkça görülebiliyor.

---

# 3. OIDC Nedir ve Neden Kullandım?

GitHub Actions'ın AWS'e erişmesi için klasik yöntem, AWS Access Key ve Secret Access Key'i GitHub Secrets içerisinde saklamaktır.

## Klasik yöntem

```text
GitHub Secrets
    │
    ├── AWS_ACCESS_KEY_ID
    └── AWS_SECRET_ACCESS_KEY
             │
             ▼
      GitHub Actions
             │
             ▼
             AWS
```

Bu yaklaşımda uzun ömürlü AWS credentials kullanılır.

Bunun bazı dezavantajları vardır:

- Credential'ların rotate edilmesi gerekir.
- Secret'ın sızması durumunda AWS hesabında yetkisiz işlemler yapılabilir.
- CI/CD sisteminde uzun ömürlü AWS access key'leri yönetmek gerekir.

---

## OIDC yöntemi

OIDC ile GitHub Actions'ın AWS'e erişmek için kalıcı AWS access key'leri saklamasına gerek kalmaz.

Akış:

```text
GitHub Actions
      │
      │ OIDC JWT
      ▼
GitHub OIDC Provider
      │
      ▼
AWS IAM
      │
      │ Trust Policy kontrolü
      ▼
AWS STS
      │
      │ Temporary credentials
      ▼
GitHub Actions
      │
      ├── ECR
      └── EKS
```

GitHub Actions çalışırken GitHub tarafından bir OIDC JWT token'ı oluşturulur.

Bu token içerisindeki claim'ler GitHub Actions workflow'unun kimliğini belirtir.

AWS, IAM Role'ün **Trust Policy**'sini kontrol eder.

Token şartları policy ile eşleşiyorsa AWS STS üzerinden geçici credentials verir.

Bu credentials'lar workflow tarafından AWS kaynaklarına erişmek için kullanılır.

### Önemli nokta

Burada iki farklı policy birbirinden ayrılmalıdır:

**Trust Policy**

> "Bu IAM Role'ü kim üstlenebilir?"

**Permissions Policy**

> "Bu IAM Role'ü üstlenen kişi hangi AWS işlemlerini yapabilir?"

Bu ayrım troubleshooting sırasında özellikle önemli oldu.

---

# 4. OIDC İçin Oluşturduğum Kaynaklar

## 4.1 GitHub OIDC Provider

AWS IAM içerisinde GitHub Actions için OIDC Provider oluşturdum:

```text
arn:aws:iam::297784246811:oidc-provider/token.actions.githubusercontent.com
```

Bu kaynak AWS'e kabaca:

> "GitHub'ın OIDC token'larını doğrulamak için bu provider'a güven."

demek.

---

## 4.2 IAM Role

GitHub Actions için aşağıdaki IAM Role'ü oluşturdum:

```text
GitHubActionsBugTrackerDeployRole
```

Bu role iki temel policy mantığıyla çalışıyor:

### Trust Policy

GitHub OIDC token'larının belirli koşullarda bu role erişmesine izin veriyor.

### Permissions Policy

Workflow'un ihtiyaç duyduğu AWS işlemlerine izin veriyor.

Örneğin:

- ECR image push/pull
- EKS cluster bilgilerini alma

---

## 4.3 Kubernetes RBAC

AWS tarafındaki IAM yetkilerinden bağımsız olarak Kubernetes tarafında da RBAC yapılandırdım.

Dosya:

```text
aws/rbac-github-actions.yaml
```

Burada:

```text
Role:
    bugtracker-deployer

RoleBinding:
    bugtracker-deployer-binding
```

oluşturuldu.

Bu Role, `bugtracker` namespace'i içerisinde CI/CD pipeline'ının ihtiyaç duyduğu Kubernetes işlemlerine izin veriyor.

Örneğin deployment'ları güncellemek gibi.

---

## 4.4 IAM Role → Kubernetes Mapping

IAM Role'ü Kubernetes tarafındaki bir gruba map ettim:

```text
IAM Role
    │
    ▼
aws-auth ConfigMap
    │
    ▼
bugtracker-deployers
    │
    ▼
Kubernetes RBAC
    │
    ▼
bugtracker namespace
```

Mapping:

```yaml
groups:
  - bugtracker-deployers

rolearn: arn:aws:iam::297784246811:role/GitHubActionsBugTrackerDeployRole

username: github-actions
```

Burada iki farklı yetkilendirme katmanı olduğunu görmek önemli:

```text
AWS IAM
   │
   │ "Bu workflow AWS Role'ünü üstlenebilir mi?"
   ▼
IAM Role
   │
   │ "AWS tarafında ne yapabilir?"
   ▼
EKS Authentication
   │
   ▼
Kubernetes RBAC
   │
   │ "Kubernetes'te ne yapabilir?"
   ▼
bugtracker namespace
```

---

# 5. Karşılaştığım Sorun

Pipeline'ın ilk çalıştırılmasında `Configure AWS credentials` adımında şu hatayı aldım:

```text
Error: Could not assume role with OIDC:
Not authorized to perform sts:AssumeRoleWithWebIdentity
```

Bu hata şu anlama geliyordu:

> GitHub Actions, AWS STS üzerinden IAM Role'ü OIDC ile üstlenmeye çalıştı fakat AWS, gelen token'ın Trust Policy şartlarını karşılamadığını düşündü.

---

# 6. İlk Teşhis Adımları

Öncelikle standart OIDC yapılandırmasını kontrol ettim.

| Kontrol | Sonuç |
|---|---|
| OIDC Provider mevcut mu? | ✅ |
| Client ID `sts.amazonaws.com` mı? | ✅ |
| Trust Policy'de `aud` doğru mu? | ✅ |
| Workflow'da `id-token: write` var mı? | ✅ |
| Role ARN doğru mu? | ✅ |
| `sub` claim'i doğru mu? | ❌ |

İlk başta `sub` değerinin klasik GitHub formatında olduğunu varsaydım:

```text
repo:ykpsph/bug-tracker:ref:refs/heads/main
```

Bu değer Trust Policy'ye yazılmıştı.

Ancak AWS hâlâ token'ı reddediyordu.

---

# 7. İlk Deneme — Wildcard

Sorunun `sub` eşleşmesinden kaynaklanabileceğini düşünerek wildcard denedim.

Trust Policy:

```text
repo:ykpsph/bug-tracker:*
```

Ancak pipeline yine aynı hatayı verdi:

```text
Not authorized to perform sts:AssumeRoleWithWebIdentity
```

Bu noktada tahmin ederek ilerlemek yerine GitHub'ın AWS'e gerçekten hangi token'ı gönderdiğini kontrol etmeye karar verdim.

---

# 8. Kesin Teşhis — OIDC Token'ını Decode Etmek

Workflow'a geçici bir debug adımı ekledim.

Bu adım GitHub'ın oluşturduğu OIDC JWT token'ını aldı ve payload bölümünü decode ederek log'a yazdı.

Özet olarak:

```bash
TOKEN=$(curl -s \
  -H "Authorization: bearer $ACTIONS_ID_TOKEN_REQUEST_TOKEN" \
  "$ACTIONS_ID_TOKEN_REQUEST_URL&audience=sts.amazonaws.com" \
  | jq -r '.value')

echo "$TOKEN" \
  | cut -d'.' -f2 \
  | base64 -d 2>/dev/null \
  | jq .
```

> Bu debug adımı yalnızca troubleshooting amacıyla geçici olarak kullanıldı ve sorun çözüldükten sonra workflow'dan kaldırıldı.

---

# 9. Token Payload'ında Ne Gördüm?

Log'daki önemli claim'ler şunlardı:

```json
{
  "actor": "ykpsph",
  "aud": "sts.amazonaws.com",
  "iss": "https://token.actions.githubusercontent.com",
  "ref": "refs/heads/main",
  "repository": "ykpsph/bug-tracker",
  "sub": "repo:ykpsph@52661595/bug-tracker@1360628134:ref:refs/heads/main"
}
```

Benim Trust Policy'de beklediğim değer:

```text
repo:ykpsph/bug-tracker:ref:refs/heads/main
```

Fakat GitHub'ın gönderdiği gerçek `sub` değeri:

```text
repo:ykpsph@52661595/bug-tracker@1360628134:ref:refs/heads/main
```

oldu.

Aradaki fark:

```text
Beklenen:

repo:ykpsph/bug-tracker:ref:refs/heads/main

Gerçek:

repo:ykpsph@52661595/bug-tracker@1360628134:ref:refs/heads/main
              ↑                        ↑
           user ID                  repo ID
```

Dolayısıyla Trust Policy'deki `sub` koşulu gerçek token ile eşleşmiyordu.
![alt text](/docs/images/image818.png)

---

# 10. Kök Neden

GitHub Actions OIDC `sub` claim'inin yeni immutable identifier formatını kullanması nedeniyle, yalnızca kullanıcı adı ve repository adını içeren eski format Trust Policy ile eşleşmedi.

Gerçek format:

```text
repo:<owner>@<owner-id>/<repo>@<repo-id>:ref:refs/heads/<branch>
```

Benim repository için:

```text
repo:ykpsph@52661595/bug-tracker@1360628134:ref:refs/heads/main
```

Bu nedenle AWS tarafındaki:

```text
sts:AssumeRoleWithWebIdentity
```

çağrısı reddediliyordu.

---

# 11. Neden İlk Wildcard Çözümü Çalışmadı?

İlk denemede şu pattern'i kullanmıştım:

```text
repo:ykpsph/bug-tracker:*
```

Ancak gerçek token:

```text
repo:ykpsph@52661595/bug-tracker@1360628134:ref:refs/heads/main
```

şeklindeydi.

Yani daha `*` kısmına gelmeden önce pattern ile gerçek değer arasında uyuşmazlık oluşuyordu:

```text
Trust Policy:

repo:ykpsph/bug-tracker:*
       ↑
       │
       └── burada eşleşmiyor

Gerçek:

repo:ykpsph@52661595/bug-tracker@1360628134:...
```

Dolayısıyla wildcard kullanmak problemi çözmedi.

---

# 12. Çözüm

Trust Policy'deki `sub` koşulunu gerçek OIDC token formatıyla eşleştirdim:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::297784246811:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:ykpsph@52661595/bug-tracker@1360628134:ref:refs/heads/main"
        }
      }
    }
  ]
}
```

Ardından Trust Policy'yi güncelledim:

```bash
aws iam update-assume-role-policy \
  --role-name GitHubActionsBugTrackerDeployRole \
  --policy-document file://trust-policy.json
```

---

# 13. Sonuç

Trust Policy güncellendikten sonra pipeline başarıyla çalıştı.

Pipeline artık:

```text
git push
   ↓
GitHub Actions
   ↓
OIDC authentication
   ↓
AWS IAM Role
   ↓
ECR
   ├── backend:<sha>
   └── frontend:<sha>
   ↓
EKS
   ├── backend deployment
   └── frontend deployment
```

şeklinde otomatik çalışıyor.

Başarılı pipeline sonucunda:

- ✅ Backend image build edildi.
- ✅ Frontend image build edildi.
- ✅ Backend image ECR'a push edildi.
- ✅ Frontend image ECR'a push edildi.
- ✅ EKS deployment'ları yeni image'larla güncellendi.
- ✅ Rolling deployment gerçekleşti.

Artık manuel olarak:

```bash
docker build
docker push
kubectl set image
```

çalıştırmama gerek kalmadı.

---

# 14. Immutable ID'ler Neden Önemli?

Buradaki `@52661595` ve `@1360628134` değerleri kullanıcı ve repository için immutable identifier olarak kullanılıyor.

Bu yaklaşım, yalnızca görünen isimlere güvenmekten daha güçlü bir kimliklendirme sağlar.

Örneğin:

```text
ykpsph
```

kullanıcı adının değişmesi durumunda kullanıcı adı değişebilir.

Benzer şekilde:

```text
bug-tracker
```

repository adı da değişebilir.

Ancak Trust Policy immutable identifier'ları kontrol ediyorsa, yalnızca aynı görünen kullanıcı/repository adına sahip olmak yeterli olmaz.

Örneğin teorik olarak:

```text
ykpsph/bug-tracker
```

gibi aynı görünen bir repository başka bir kimliğe aitse, ID'ler farklı olacaktır:

```text
ykpsph@99999/bug-tracker@88888
```

Trust Policy ise belirli ID'leri beklediği için bu token kabul edilmez.

Bu, trust relationship'in daha spesifik hale gelmesini sağlar.

---

# 15. Öğrendiklerim

## Teknik

### 1. OIDC

GitHub Actions ile AWS arasında uzun ömürlü AWS access key'leri saklamak yerine OIDC + STS temporary credentials kullanılabilir.

Bu yaklaşım:

- static AWS credentials gerektirmez,
- kısa ömürlü credentials kullanır,
- IAM Trust Policy ile workflow'un kimliğini sınırlandırabilir.

---

### 2. IAM Trust Policy vs Permissions Policy

Bu ayrım özellikle önemli:

```text
Trust Policy
    ↓
"Kim bu Role'ü üstlenebilir?"

Permissions Policy
    ↓
"Bu Role hangi işlemleri yapabilir?"
```

Bir role gerekli permissions verilmiş olsa bile Trust Policy token'ı kabul etmiyorsa workflow role'ü üstlenemez.

---

### 3. AWS IAM ve Kubernetes RBAC farklı katmanlardır

EKS üzerinde AWS kimliği ile Kubernetes yetkisi aynı şey değildir.

Basitleştirilmiş akış:

```text
GitHub OIDC Token
       ↓
AWS IAM Trust Policy
       ↓
IAM Role
       ↓
EKS Authentication
       ↓
Kubernetes RBAC
       ↓
Namespace / Resources
```

Dolayısıyla yalnızca AWS IAM Role oluşturmak yeterli olmayabilir.

Kubernetes tarafında da gerekli RBAC izinlerinin verilmesi gerekir.

---

### 4. OIDC token'ı troubleshooting 

Hata mesajı:

```text
Not authorized to perform sts:AssumeRoleWithWebIdentity
```

oldukça genel olabilir.

Bu nedenle sadece policy'leri tahmin ederek değiştirmek yerine token'ın gerçek claim'lerini kontrol etmek daha doğru bir yaklaşım oldu.

Özellikle:

```text
iss
aud
sub
repository
ref
```

gibi claim'ler troubleshooting sırasında önemlidir.

---

### 5. Debug ederek ilerlemek

Bu problemde en önemli derslerden biri:

> Tahmin etmek yerine gerçek değeri görmek.

İlk olarak:

```text
"sub mu yanlış acaba?"
```

diye düşündüm.

Wildcard denedim ama çözülmedi.

Daha sonra OIDC token payload'ını decode ederek AWS'in gerçekten hangi `sub` değerini gördüğünü tespit ettim.

Bu sayede problemi doğrudan kök neden üzerinden çözebildim.

---

### 6. Debug adımları geçicidir

OIDC token payload'ını log'a yazan debug adımı yalnızca troubleshooting amacıyla kullanıldı.

Sorun çözüldükten sonra workflow'dan kaldırıldı.

Özellikle authentication token'larıyla çalışırken gereksiz credential/token bilgilerinin log'larda bırakılmaması gerekir.

---

# 16. Interview'da Bu Hikâyeyi Nasıl Anlatırım?

> "Bug Tracker projemi AWS EKS'e deploy ettikten sonra GitHub Actions ile CI/CD pipeline'ı kurdum. AWS erişimi için static access key kullanmak yerine OIDC tabanlı keyless authentication tercih ettim.
>
> Pipeline'ın ilk çalıştırmasında `Not authorized to perform sts:AssumeRoleWithWebIdentity` hatası aldım. Önce OIDC provider'ı, `sts.amazonaws.com` audience değerini, workflow'daki `id-token: write` iznini ve IAM Role Trust Policy'sini kontrol ettim. Hepsi doğru görünüyordu.
>
> Sorunun nerede olduğunu anlamak için workflow'a geçici bir debug adımı ekleyerek GitHub'ın ürettiği OIDC token'ının payload'ını decode ettim. Burada `sub` claim'inin beklediğim klasik repository formatından farklı olduğunu gördüm. Token, repository ve owner için immutable ID'leri de içeriyordu.
>
> Trust Policy'deki `sub` koşulunu gerçek token formatıyla eşleştirdim ve pipeline tekrar çalıştı. Backend ve frontend image'ları ECR'a push edildi ve EKS deployment'ları otomatik olarak güncellendi.
>
> Bu süreçte özellikle IAM Trust Policy ile Permissions Policy arasındaki farkı, AWS IAM ile Kubernetes RBAC'ın farklı yetkilendirme katmanları olduğunu ve authentication problemlerinde gerçek token claim'lerini inceleyerek debug etmenin önemini öğrendim."

---

# 17. Kullanılan Komutlar

## OIDC Provider Oluşturma

```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
```

---

## IAM Role Oluşturma

```bash
aws iam create-role \
  --role-name GitHubActionsBugTrackerDeployRole \
  --assume-role-policy-document file://trust-policy.json
```

---

## Permissions Policy Ekleme

```bash
aws iam put-role-policy \
  --role-name GitHubActionsBugTrackerDeployRole \
  --policy-name BugTrackerDeployPolicy \
  --policy-document file://permissions-policy.json
```

---

## Trust Policy Güncelleme

```bash
aws iam update-assume-role-policy \
  --role-name GitHubActionsBugTrackerDeployRole \
  --policy-document file://trust-policy.json
```

---

## Kubernetes RBAC Uygulama

```bash
kubectl apply -f aws/rbac-github-actions.yaml
```

---

## IAM Role'ü EKS'e Map'leme

```bash
eksctl create iamidentitymapping \
  --cluster bugtracker-cluster \
  --region eu-central-1 \
  --arn arn:aws:iam::297784246811:role/GitHubActionsBugTrackerDeployRole \
  --username github-actions \
  --group bugtracker-deployers
```

---

## OIDC Provider'ı Doğrulama

```bash
aws iam get-open-id-connect-provider \
  --open-id-connect-provider-arn \
  arn:aws:iam::297784246811:oidc-provider/token.actions.githubusercontent.com
```

---

## Trust Policy'yi Doğrulama

```bash
aws iam get-role \
  --role-name GitHubActionsBugTrackerDeployRole \
  --query 'Role.AssumeRolePolicyDocument.Statement[0].Condition' \
  --output json
```

---

# 18. Son Durum

Bu aşamada:

- [x] OIDC Provider oluşturuldu.
- [x] IAM Role oluşturuldu.
- [x] IAM Trust Policy yapılandırıldı.
- [x] IAM Permissions Policy yapılandırıldı.
- [x] Kubernetes RBAC yapılandırıldı.
- [x] IAM Role EKS'e map edildi.
- [x] GitHub Actions workflow oluşturuldu.
- [x] OIDC authentication problemi teşhis edildi.
- [x] `sub` claim formatındaki uyuşmazlık çözüldü.
- [x] Backend image ECR'a otomatik push ediliyor.
- [x] Frontend image ECR'a otomatik push ediliyor.
- [x] EKS deployment'ları CI/CD üzerinden otomatik güncelleniyor.

### Nihai akış

```text
Developer
    │
    │ git push origin main
    ▼
GitHub
    │
    ▼
GitHub Actions
    │
    │ OIDC
    ▼
AWS STS
    │
    │ Temporary credentials
    ▼
IAM Role
    │
    ├──────────────► Amazon ECR
    │                   │
    │                   ├── backend:<sha>
    │                   └── frontend:<sha>
    │
    └──────────────► Amazon EKS
                        │
                        └── bugtracker namespace
                              │
                              ├── Backend
                              └── Frontend
```

Sonuç olarak, **`git push` sonrası uygulamanın AWS EKS'e otomatik olarak deploy edildiği çalışan bir CI/CD pipeline'ı** elde ettim.

Bu, projeye sadece CI/CD eklemekten öte; **OIDC authentication, IAM, Kubernetes RBAC ve gerçek bir troubleshooting deneyimini** aynı projede uygulamamı sağladı.

---

# 19. Sonraki Adımlar

CI/CD pipeline'ının temel hali çalışıyor. Bundan sonraki geliştirmeler:

### Test Pipeline'ı

Şu an kullanılan:

```text
-DskipTests
```

yaklaşımını kaldırıp gerçek automated test'leri pipeline'a dahil etmek.

Örneğin:

```text
Build
  ↓
Unit Tests
  ↓
Docker Build
  ↓
Image Push
  ↓
Deploy
```

---

### Kubernetes Manifest'lerini CI/CD'ye Dahil Etmek

Deployment configuration'larının da pipeline tarafından yönetilmesi:

```bash
kubectl apply -f k8s/
```

Böylece yalnızca image değil, Kubernetes configuration değişiklikleri de otomatik uygulanabilir.

---

### Helm

Kubernetes manifest'lerini Helm chart'a dönüştürmek:

```text
Kubernetes YAML
      ↓
Helm Chart
      ↓
Helm Release
      ↓
EKS
```

---

### ArgoCD / GitOps

Bir sonraki aşamada deployment sorumluluğunu GitHub Actions'tan ArgoCD'ye taşıyarak GitOps yaklaşımına geçilebilir:

```text
Developer
   ↓
git push
   ↓
GitHub Actions
   ↓
Build + Test + Push Image
   ↓
Git repository
   ↓
ArgoCD
   ↓
EKS
```

---

### S3 ve Redis

Uygulamaya ileride:

- S3 → bug attachment / image storage
- Redis → caching

gibi AWS servisleri eklenebilir.

---

# 20. Genel Mimari — Projenin Geldiği Nokta

Bug Tracker projesi başlangıçta lokal çalışan:

```text
Spring Boot
React
PostgreSQL
Docker
Docker Compose
```

uygulamasıydı.

Şu noktaya kadar:

```text
Application
    ↓
Docker
    ↓
Kubernetes
    ↓
AWS EKS
    ↓
Amazon ECR
    ↓
GitHub Actions
    ↓
OIDC
    ↓
AWS IAM
    ↓
Kubernetes RBAC
```

katmanlarını gerçek bir proje üzerinde uygulamış oldum.

Bir sonraki hedef, bu yapıyı **Helm + GitOps + Observability** gibi production ortamlarında yaygın olarak kullanılan pratiklerle geliştirmek.
