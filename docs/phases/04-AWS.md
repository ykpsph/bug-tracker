# Phase 3 — AWS Deployment

This phase documents the migration of the Bug Tracker application from local Kubernetes to a real AWS environment.

The original roadmap separated cloud infrastructure, CI/CD, networking and other DevOps technologies into different phases. During development, the strategy was changed to prioritize **real AWS hands-on experience** and a complete deployment pipeline.

Therefore, this phase intentionally combines the AWS infrastructure and the CI/CD workflow that was built around it.

---

## 1. Objective

The goal of this phase was to take the existing containerized and Kubernetes-based Bug Tracker application and deploy it to real AWS infrastructure.

The resulting architecture is:

```text
                         INTERNET
                             │
                             ▼
                    AWS Load Balancer
                             │
                             ▼
                     Kubernetes Service
                             │
                             ▼
                    ┌─────────────────┐
                    │       EKS       │
                    │                 │
                    │  ┌───────────┐  │
                    │  │ Frontend  │  │
                    │  │ Deployment│  │
                    │  └───────────┘  │
                    │                 │
                    │  ┌───────────┐  │
                    │  │  Backend  │  │
                    │  │ Deployment│  │
                    │  └─────┬─────┘  │
                    └─────────┼───────┘
                              │
                              ▼
                     Amazon RDS
                     PostgreSQL
```

Container images follow:

```text
Docker
   │
   ▼
Amazon ECR
   │
   ▼
Amazon EKS
```

The deployment pipeline follows:

```text
Developer
    │
    │ git push
    ▼
GitHub
    │
    ▼
GitHub Actions
    │
    ├── Build Backend
    │
    ├── Build Frontend
    │
    ├── Push images to ECR
    │
    └── Deploy to EKS
             │
             ▼
        Running Pods
```

---

# 2. Starting Point

Before AWS, the application already worked locally.

The stack consisted of:

- Java 17
- Spring Boot 3.2
- Maven
- React 18
- Vite
- Tailwind CSS
- PostgreSQL 15
- Docker
- Docker Compose
- Kubernetes

The backend and frontend already had working Dockerfiles and the application could be started using Docker Compose.

The Kubernetes phase also existed before moving to AWS.

Therefore, AWS was not a new application deployment from scratch.

The existing application was evolved:

```text
Application
     ↓
Docker
     ↓
Kubernetes
     ↓
AWS
```

The AWS deployment replaced the local Kubernetes PostgreSQL instance with managed Amazon RDS.

---

# 3. Why AWS?

The original plan included a local/cloud learning environment and technologies such as Floci, Helm, Terraform and ArgoCD.

However, an upcoming Junior DevOps Engineer — AWS interview changed the immediate priority.

The objective became:

> Build a real AWS deployment that I understand end-to-end instead of simply completing a list of DevOps technologies.

This resulted in the following priority:

```text
Docker
   ↓
Kubernetes
   ↓
AWS
   ├── ECR
   ├── EKS
   ├── VPC / Networking
   ├── IAM
   ├── RDS
   └── Load Balancer
   ↓
GitHub Actions
```

Technologies such as Helm, Terraform, ArgoCD and advanced observability were intentionally postponed.

They are not abandoned. They are planned as future improvements.

---

# 4. AWS Region

The project uses:

```text
eu-central-1
```

This is the AWS region used for the Bug Tracker infrastructure.

The local AWS CLI configuration was verified with:

```bash
aws configure get region
```

Expected output:

```text
eu-central-1
```

AWS identity was also verified:

```bash
aws sts get-caller-identity
```

---

# 5. AWS Resources

The deployment uses the following AWS services:

| Service | Purpose |
|---|---|
| Amazon ECR | Container image registry |
| Amazon EKS | Managed Kubernetes cluster |
| Amazon EC2 | EKS worker nodes |
| Amazon VPC | Network infrastructure |
| Subnets | Network segmentation |
| Internet Gateway | Internet connectivity |
| NAT Gateway | Private subnet outbound connectivity |
| Security Groups | Network-level access control |
| IAM | AWS permissions |
| Amazon RDS | Managed PostgreSQL database |
| Elastic Load Balancing | Public application access |
| CloudFormation | Resources created by `eksctl` |
| GitHub Actions | CI/CD |
| GitHub OIDC | Secure GitHub → AWS authentication |

---

# 6. Amazon ECR

## 6.1 What is ECR?

Amazon Elastic Container Registry (ECR) is AWS's managed container registry.

Before AWS, the application images were available locally / through Docker Hub.

For AWS deployment, the images were moved to ECR:

```text
Docker Image
     ↓
Amazon ECR
     ↓
Amazon EKS
```

EKS worker nodes need access to the container registry in order to pull the application images.

---

## 6.2 ECR Repositories

Two repositories were created:

```text
bugtracker-backend
bugtracker-frontend
```

Repositories were created using:

```bash
aws ecr create-repository \
    --repository-name bugtracker-backend \
    --region eu-central-1

aws ecr create-repository \
    --repository-name bugtracker-frontend \
    --region eu-central-1
```

Repositories were verified with:

```bash
aws ecr describe-repositories \
    --region eu-central-1
```

---

## 6.3 Authenticate Docker with ECR

Docker was authenticated against the ECR registry:

```bash
aws ecr get-login-password --region eu-central-1 |
docker login --username AWS --password-stdin \
<AWS_ACCOUNT_ID>.dkr.ecr.eu-central-1.amazonaws.com
```

After authentication:

```text
Login Succeeded
```

---

## 6.4 Push Backend Image

The existing backend image was tagged for ECR:

```bash
docker tag dscc86y/bugtracker-backend:latest \
<AWS_ACCOUNT_ID>.dkr.ecr.eu-central-1.amazonaws.com/bugtracker-backend:latest
```

Then pushed:

```bash
docker push \
<AWS_ACCOUNT_ID>.dkr.ecr.eu-central-1.amazonaws.com/bugtracker-backend:latest
```

---

## 6.5 Push Frontend Image

The frontend image was tagged:

```bash
docker tag dscc86y/bugtracker-frontend:latest \
<AWS_ACCOUNT_ID>.dkr.ecr.eu-central-1.amazonaws.com/bugtracker-frontend:latest
```

Then pushed:

```bash
docker push \
<AWS_ACCOUNT_ID>.dkr.ecr.eu-central-1.amazonaws.com/bugtracker-frontend:latest
```

---

## 6.6 Verify Images

Backend:

```bash
aws ecr describe-images \
    --repository-name bugtracker-backend \
    --region eu-central-1
```

Frontend:

```bash
aws ecr describe-images \
    --repository-name bugtracker-frontend \
    --region eu-central-1
```

At this point the container image flow became:

```text
Local Docker Image
       ↓
      ECR
       ↓
      EKS
```

---

# 7. Amazon EKS

## 7.1 What is EKS?

Amazon Elastic Kubernetes Service is AWS's managed Kubernetes service.

Instead of running Kubernetes entirely on the local machine, the Kubernetes control plane is managed by AWS.

The application workloads still run on worker nodes.

Conceptually:

```text
AWS
│
├── EKS Control Plane
│       │
│       └── Kubernetes API
│
└── Worker Node Group
        │
        ├── EC2 Node
        └── EC2 Node
```

---

# 8. Creating the EKS Cluster

The cluster was created using `eksctl`.

The initial command was:

```bash
eksctl create cluster \
    --name bugtracker-cluster \
    --region eu-central-1 \
    --nodegroup-name workers \
    --node-type t3.medium \
    --nodes 2 \
    --nodes-min 1 \
    --nodes-max 3 \
    --managed
```

`eksctl` simplified the creation of the AWS infrastructure.

However, the important learning objective was not simply running this command.

The resources created by `eksctl` were inspected afterwards.

---

# 9. What `eksctl` Created

The EKS creation process resulted in infrastructure including:

```text
VPC
│
├── Availability Zones
│
├── Public Subnets
│
├── Private Subnets
│
├── Internet Gateway
│
├── NAT Gateway
│
├── Route Tables
│
├── Security Groups
│
└── IAM Roles
```

Then:

```text
EKS Control Plane
       │
       ▼
Managed Node Group
       │
       ▼
EC2 Worker Nodes
```

The cluster also received Kubernetes components such as:

- VPC CNI
- kube-proxy
- CoreDNS

The exact AWS resources created by `eksctl` were inspected instead of treating the command as a black box.

---

# 10. Inspecting the EKS Infrastructure

## VPC

```bash
aws eks describe-cluster \
    --name bugtracker-cluster \
    --region eu-central-1 \
    --query 'cluster.resourcesVpcConfig.vpcId'
```

VPC details:

```bash
aws ec2 describe-vpcs \
    --region eu-central-1
```

---

## Subnets

```bash
aws ec2 describe-subnets \
    --region eu-central-1 \
    --filters "Name=vpc-id,Values=<VPC_ID>"
```

The EKS VPC contains public and private subnets across multiple Availability Zones.

---

## Internet Gateway

```bash
aws ec2 describe-internet-gateways \
    --region eu-central-1 \
    --filters "Name=attachment.vpc-id,Values=<VPC_ID>"
```

---

## Route Tables

```bash
aws ec2 describe-route-tables \
    --region eu-central-1 \
    --filters "Name=vpc-id,Values=<VPC_ID>"
```

---

## Security Groups

```bash
aws ec2 describe-security-groups \
    --region eu-central-1 \
    --filters "Name=vpc-id,Values=<VPC_ID>"
```

---

# 11. EKS Control Plane

The EKS cluster can be inspected with:

```bash
aws eks describe-cluster \
    --name bugtracker-cluster \
    --region eu-central-1
```

Important information includes:

- Cluster status
- Kubernetes version
- API endpoint
- VPC configuration
- IAM role

A more focused query:

```bash
aws eks describe-cluster \
    --name bugtracker-cluster \
    --region eu-central-1 \
    --query 'cluster.{Endpoint:endpoint,Status:status,Version:version,RoleArn:roleArn}'
```

---

# 12. Worker Nodes

Node groups can be listed:

```bash
eksctl get nodegroups \
    --cluster bugtracker-cluster \
    --region eu-central-1
```

Node group details:

```bash
aws eks describe-nodegroup \
    --cluster-name bugtracker-cluster \
    --nodegroup-name <NODE_GROUP_NAME> \
    --region eu-central-1
```

EC2 worker nodes can be inspected with:

```bash
aws ec2 describe-instances \
    --region eu-central-1 \
    --filters \
    "Name=tag:eks:cluster-name,Values=bugtracker-cluster"
```

---

# 13. Kubernetes Verification

After creating the cluster:

```bash
kubectl get nodes
```

Expected result:

```text
NAME                         STATUS   ROLES
...                          Ready    <none>
...                          Ready    <none>
```

All Kubernetes system pods:

```bash
kubectl get pods -A
```

System namespace:

```bash
kubectl get pods -n kube-system
```

Namespaces:

```bash
kubectl get namespaces
```

Node details:

```bash
kubectl describe nodes
```

Node labels:

```bash
kubectl get nodes --show-labels
```

---

# 14. Kubernetes Application Deployment

The existing Kubernetes manifests were adapted for AWS instead of creating an entirely new application deployment.

The AWS deployment contains:

```text
Namespace
   │
   ├── ConfigMap
   │
   ├── Secret
   │
   ├── Frontend Deployment
   │      └── Frontend Pods
   │
   ├── Frontend Service
   │
   ├── Backend Deployment
   │      └── Backend Pods
   │
   └── Backend Service
```

The important difference is PostgreSQL.

Locally:

```text
Kubernetes
├── Frontend
├── Backend
└── PostgreSQL
```

AWS:

```text
EKS
├── Frontend
└── Backend

RDS
└── PostgreSQL
```

This was an intentional architectural decision.

The Kubernetes PostgreSQL setup was useful for learning StatefulSets, persistent storage and database networking.

For the AWS deployment, the database was moved to managed Amazon RDS.

---

# 15. Kubernetes Namespace

The application runs inside:

```text
bugtracker
```

Namespace:

```yaml
apiVersion: v1
kind: Namespace

metadata:
  name: bugtracker
```

---

# 16. ConfigMap

The application configuration is separated from the container image using a ConfigMap.

Example:

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

This allows configuration to be changed without rebuilding the Docker image.

---

# 17. Kubernetes Secret

Database credentials are provided through a Kubernetes Secret.

The Secret contains:

```text
DB_URL
DB_USERNAME
DB_PASSWORD
```

The actual credentials are intentionally **not stored in this documentation**.

> Never commit real passwords, AWS access keys, secret keys or other credentials to GitHub.

---

# 18. Backend Deployment

The backend runs with multiple replicas:

```yaml
replicas: 2
```

The container image comes from ECR:

```text
<AWS_ACCOUNT_ID>.dkr.ecr.eu-central-1.amazonaws.com/bugtracker-backend
```

The backend uses:

```text
Port: 8081
```

The Kubernetes Service is:

```text
ClusterIP
```

This means the backend does not need to be directly exposed to the public internet.

---

# 19. Backend Health Checks

The backend uses Kubernetes liveness and readiness probes.

Example:

```text
/api/bugs
```

Liveness:

```text
Is the application still alive?
```

Readiness:

```text
Is the application ready to receive traffic?
```

This is important during rolling deployments because Kubernetes can avoid sending traffic to a pod that is not ready.

---

# 20. Frontend Deployment

The frontend also runs with:

```yaml
replicas: 2
```

The frontend image comes from:

```text
<AWS_ACCOUNT_ID>.dkr.ecr.eu-central-1.amazonaws.com/bugtracker-frontend
```

The frontend listens on:

```text
3000
```

The frontend Service uses:

```yaml
type: LoadBalancer
```

This causes AWS to provision a load balancer for external access.

---

# 21. Frontend → Backend Communication

The frontend uses:

```text
VITE_API_URL=/api
```

The important idea is that the frontend does not need to know the internal backend pod IP.

Kubernetes provides service discovery and the backend is represented by the Kubernetes Service.

Conceptually:

```text
Browser
   │
   ▼
Load Balancer
   │
   ▼
Frontend Service
   │
   ▼
Frontend Pods
   │
   │ /api
   ▼
Backend Service
   │
   ▼
Backend Pods
```

---

# 22. Public Load Balancer

The frontend Service was exposed through an AWS Load Balancer.

The service can be inspected using:

```bash
kubectl get svc -n bugtracker frontend
```

The resulting AWS load balancer hostname provides external access to the application.

The actual hostname is environment-specific and is therefore not hardcoded in this documentation.

---

# 23. Amazon RDS

## 23.1 Why RDS?

Instead of running PostgreSQL inside EKS, PostgreSQL was moved to:

```text
Amazon RDS for PostgreSQL
```

This separates application workloads from database infrastructure.

The resulting architecture is:

```text
EKS
├── Frontend
└── Backend

       │
       │ PostgreSQL connection
       ▼

RDS
└── PostgreSQL
```

---

# 24. RDS Networking

The RDS deployment uses the same VPC as the EKS environment.

The RDS subnet group uses private subnets.

The database is not publicly accessible.

Important concepts:

```text
VPC
 │
 ├── Private Subnet
 │
 ├── RDS Subnet Group
 │
 └── RDS PostgreSQL
```

The database listens on:

```text
5432
```

---

# 25. RDS Subnet Group

The private EKS subnets were identified:

```bash
aws ec2 describe-subnets \
    --region eu-central-1 \
    --filters "Name=vpc-id,Values=$VPC_ID"
```

Then an RDS subnet group was created:

```bash
aws rds create-db-subnet-group \
    --db-subnet-group-name bugtracker-subnet-group \
    --db-subnet-group-description "Subnet group for Bug Tracker RDS" \
    --subnet-ids <PRIVATE_SUBNET_1> <PRIVATE_SUBNET_2> <PRIVATE_SUBNET_3> \
    --region eu-central-1
```

---

# 26. RDS Security Group

A dedicated Security Group was created for RDS.

The purpose is to control which resources can connect to PostgreSQL.

Conceptually:

```text
EKS Backend
     │
     │ TCP 5432
     ▼
RDS Security Group
     │
     ▼
RDS PostgreSQL
```

The database should not be open to the entire internet.

---

# 27. Creating the RDS Instance

The RDS instance was created as PostgreSQL and configured to use:

- A private subnet group
- A dedicated security group
- PostgreSQL port 5432
- No public accessibility
- Backup retention

The exact credentials are intentionally excluded from this document.

---

# 28. RDS Endpoint

After the RDS instance became available, its endpoint was retrieved:

```bash
aws rds describe-db-instances \
    --db-instance-identifier bugtracker-db \
    --region eu-central-1 \
    --query 'DBInstances[0].Endpoint.Address' \
    --output text
```

The backend connection string follows the structure:

```text
jdbc:postgresql://<RDS_ENDPOINT>:5432/bugtracker
```

The actual endpoint is environment-specific.

---

# 29. RDS Connectivity Problem

During deployment, the backend initially could not connect to RDS.

The problem was investigated as a Security Group / networking issue.

This was an important real-world troubleshooting exercise.

The investigation included identifying:

```text
RDS Security Group
        │
        │
        ▼
EKS / Cluster Security Groups
        │
        ▼
Backend Pod
```

The lesson was that creating both resources inside the same VPC does not automatically mean that every resource can communicate with every other resource.

Network access must be allowed by the relevant Security Groups.

---

# 30. IAM

IAM became important in two different contexts.

### AWS IAM

Controls:

```text
"What can this AWS identity do?"
```

Examples:

```text
ECR push/pull
EKS API access
RDS API operations
```

### Kubernetes RBAC

Controls:

```text
"What can this Kubernetes identity do?"
```

Examples:

```text
Read pods
Read services
Update deployments
Read configuration
```

These are different permission systems.

---

# 31. EKS Node IAM Permissions

EKS worker nodes need permission to pull images from ECR.

The node group's IAM role was identified using:

```bash
aws eks describe-nodegroup \
    --cluster-name bugtracker-cluster \
    --nodegroup-name <NODE_GROUP_NAME> \
    --region eu-central-1 \
    --query 'nodegroup.nodeRole'
```

The ECR read-only policy was attached:

```bash
aws iam attach-role-policy \
    --role-name $NODE_ROLE \
    --policy-arn \
    arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly
```

Policies can be verified with:

```bash
aws iam list-attached-role-policies \
    --role-name $NODE_ROLE
```

---

# 32. GitHub Actions CI/CD

After the manual AWS deployment was working, the next step was automation.

The principle was:

> First understand the manual deployment, then automate the same process.

Manual:

```text
docker build
     ↓
docker tag
     ↓
docker push
     ↓
kubectl set image
```

Automated:

```text
git push
     ↓
GitHub Actions
     ↓
Docker build
     ↓
ECR push
     ↓
EKS deployment
```

---

# 33. GitHub Actions → AWS Authentication

Static AWS Access Keys were intentionally not used by GitHub Actions.

Instead, GitHub Actions authenticates to AWS using:

```text
GitHub OIDC
      ↓
AWS IAM Role
      ↓
Temporary AWS credentials
```

The GitHub workflow receives an OIDC token.

AWS validates the token through the configured OIDC provider.

AWS then allows GitHub Actions to assume the IAM role.

Conceptually:

```text
GitHub Actions
      │
      │ OIDC JWT
      ▼
GitHub OIDC Provider
      │
      ▼
AWS STS
      │
      ▼
GitHubActionsBugTrackerDeployRole
      │
      ├── ECR
      └── EKS
```

This avoids storing long-lived AWS Access Keys inside GitHub.

---

# 34. GitHub OIDC Provider

The GitHub Actions OIDC provider uses:

```text
https://token.actions.githubusercontent.com
```

The provider was configured with:

```text
sts.amazonaws.com
```

The provider can be inspected using:

```bash
aws iam list-open-id-connect-providers
```

---

# 35. IAM Trust Policy

The GitHub Actions IAM role trusts the GitHub OIDC provider.

The trust policy restricts access to the repository and main branch.

Conceptually:

```text
Only:

repo:ykpsph/bug-tracker
branch: main

        ↓

GitHubActionsBugTrackerDeployRole
```

This is more secure than allowing arbitrary GitHub repositories to assume the role.

The role created for the project is:

```text
GitHubActionsBugTrackerDeployRole
```

---

# 36. IAM Permissions Policy

The GitHub Actions role was intentionally given only the AWS permissions required for the pipeline.

The policy includes ECR operations for:

```text
bugtracker-backend
bugtracker-frontend
```

and permission to describe the EKS cluster.

The idea is:

```text
GitHub Actions
     │
     ├── Push images → ECR
     │
     └── Access cluster information → EKS
```

The role was not given unrestricted administrator permissions.

---

# 37. Kubernetes RBAC for GitHub Actions

AWS IAM alone does not define what `kubectl` can do inside Kubernetes.

Therefore, Kubernetes RBAC was also configured.

The GitHub Actions identity is mapped to:

```text
github-actions
```

and:

```text
bugtracker-deployers
```

group.

The flow is:

```text
IAM Role
   │
   ▼
aws-auth
   │
   ▼
github-actions
   │
   ▼
bugtracker-deployers
   │
   ▼
RoleBinding
   │
   ▼
bugtracker-deployer
```

The goal was deliberately **not** to give GitHub Actions `cluster-admin`.

Instead, the permissions are scoped to the `bugtracker` namespace.

---

# 38. Kubernetes Role

The deployment role allows operations such as:

```text
deployments:
    get
    list
    watch
    update
    patch

pods:
    get
    list
    watch

pods/log:
    get
    list
    watch

services:
    get
    list
    watch

configmaps:
    get
    list

secrets:
    get
    list
```

The Role exists inside:

```text
bugtracker
```

namespace.

---

# 39. RoleBinding

The RoleBinding connects:

```text
bugtracker-deployers
```

to:

```text
bugtracker-deployer
```

Example structure:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding

metadata:
  name: bugtracker-deployer-binding
  namespace: bugtracker

subjects:
  - kind: Group
    name: bugtracker-deployers
    apiGroup: rbac.authorization.k8s.io

roleRef:
  kind: Role
  name: bugtracker-deployer
  apiGroup: rbac.authorization.k8s.io
```

---

# 40. Mapping IAM Role to Kubernetes

The IAM role was mapped into the EKS cluster:

```bash
eksctl create iamidentitymapping \
    --cluster bugtracker-cluster \
    --region eu-central-1 \
    --arn <GITHUB_ACTIONS_ROLE_ARN> \
    --username github-actions \
    --group bugtracker-deployers
```

The resulting relationship is:

```text
GitHub
   │
   ▼
OIDC
   │
   ▼
IAM Role
   │
   ▼
aws-auth
   │
   ▼
Kubernetes User
   │
   ▼
Kubernetes Group
   │
   ▼
RoleBinding
   │
   ▼
Namespace permissions
```

This was one of the most important concepts learned during the CI/CD implementation.

---

# 41. GitHub Actions Workflow

The workflow is located at:

```text
.github/workflows/deploy.yml
```

It runs when code is pushed to:

```text
main
```

It can also be manually triggered using:

```yaml
workflow_dispatch:
```

---

# 42. Pipeline Structure

The workflow consists of three jobs:

```text
                    git push
                       │
                       ▼
             ┌──────────────────┐
             │ GitHub Actions   │
             └────────┬─────────┘
                      │
          ┌───────────┴───────────┐
          ▼                       ▼
 Build & Push Backend      Build & Push Frontend
          │                       │
          └───────────┬───────────┘
                      ▼
                Deploy to EKS
```

The three jobs are:

```text
build-push-backend
build-push-frontend
deploy
```

The deployment job waits for both image build jobs.

---

# 43. Backend CI Job

The backend job performs:

```text
Checkout
   ↓
Generate image tag
   ↓
Authenticate to AWS using OIDC
   ↓
Login to ECR
   ↓
docker build
   ↓
docker tag
   ↓
docker push
```

The image is tagged using the Git commit SHA.

The resulting image tags are conceptually:

```text
<commit-sha>
latest
```

Using the commit SHA provides an immutable reference to a specific version.

---

# 44. Frontend CI Job

The frontend job follows the same process:

```text
Checkout
   ↓
Generate image tag
   ↓
AWS OIDC authentication
   ↓
ECR login
   ↓
docker build
   ↓
docker tag
   ↓
docker push
```

The image is pushed to:

```text
bugtracker-frontend
```

---

# 45. Why Use Commit SHA Tags?

Instead of relying only on:

```text
latest
```

the workflow also creates a tag based on the Git commit.

Conceptually:

```text
bugtracker-backend:<commit-sha>
bugtracker-backend:latest
```

and:

```text
bugtracker-frontend:<commit-sha>
bugtracker-frontend:latest
```

This makes it possible to identify which source commit produced a deployed image.

---

# 46. Deployment Job

The deployment job starts only after both image build jobs succeed.

```yaml
needs:
  - build-push-backend
  - build-push-frontend
```

It then:

```text
AWS OIDC authentication
        ↓
aws eks update-kubeconfig
        ↓
Update backend image
        ↓
Update frontend image
        ↓
Wait for rollout
        ↓
Verify pods/deployments
```

---

# 47. Updating the EKS Backend

The workflow uses:

```bash
kubectl set image deployment/backend \
    backend=<BACKEND_ECR_IMAGE>:<IMAGE_TAG> \
    -n bugtracker
```

Then waits:

```bash
kubectl rollout status \
    deployment/backend \
    -n bugtracker \
    --timeout=5m
```

This makes Kubernetes perform a rolling deployment.

---

# 48. Updating the EKS Frontend

The frontend deployment is updated similarly:

```bash
kubectl set image deployment/frontend \
    frontend=<FRONTEND_ECR_IMAGE>:<IMAGE_TAG> \
    -n bugtracker
```

Then:

```bash
kubectl rollout status \
    deployment/frontend \
    -n bugtracker \
    --timeout=5m
```

---

# 49. Final Verification

The workflow verifies the deployment:

```bash
kubectl get pods -n bugtracker
```

and:

```bash
kubectl get deployment -n bugtracker
```

The purpose is not simply to say:

```text
GitHub Actions = Success
```

but to verify that the actual Kubernetes workloads successfully rolled out.

---

# 50. Complete CI/CD Flow

The final workflow is:

```text
Developer
    │
    │ git push main
    ▼
GitHub
    │
    ▼
GitHub Actions
    │
    ├──────────────────────────────┐
    │                              │
    ▼                              ▼
Backend Job                  Frontend Job
    │                              │
    ├── Checkout                   ├── Checkout
    ├── OIDC                       ├── OIDC
    ├── ECR login                  ├── ECR login
    ├── Docker build               ├── Docker build
    ├── SHA tag                    ├── SHA tag
    └── Push to ECR                └── Push to ECR
    │                              │
    └──────────────┬───────────────┘
                   ▼
             Deploy Job
                   │
                   ├── OIDC
                   ├── update-kubeconfig
                   ├── update backend
                   ├── update frontend
                   ├── rollout status
                   └── verify
                   │
                   ▼
                  EKS
                   │
             ┌─────┴─────┐
             ▼           ▼
         Frontend      Backend
             │           │
             └─────┬─────┘
                   ▼
                  RDS
```

---

# 51. Manual Deployment vs CI/CD

One of the most important decisions in this project was to first understand the manual deployment.

Manual:

```text
Docker build
     ↓
Docker tag
     ↓
Docker push
     ↓
ECR
     ↓
kubectl set image
     ↓
EKS
```

Then the exact process was automated:

```text
git push
     ↓
GitHub Actions
     ↓
Docker build
     ↓
ECR
     ↓
EKS
```

This makes the CI/CD pipeline easier to understand because it is automating a process that was already manually verified.

---

# 52. What I Learned

## Amazon ECR

I learned that ECR is the AWS-native container registry used to store Docker images that can be consumed by EKS.

```text
Docker → ECR → EKS
```

---

## Amazon EKS

I learned that EKS is a managed Kubernetes control plane while application workloads run on worker nodes.

```text
EKS Control Plane
       │
       ▼
EC2 Worker Nodes
       │
       ▼
Pods
```

---

## VPC

I learned that an AWS application is not simply "running in the cloud".

Networking is built from:

```text
VPC
 ↓
Subnets
 ↓
Route Tables
 ↓
Internet Gateway / NAT
 ↓
Security Groups
```

---

## Security Groups

I learned that being inside the same VPC does not automatically mean resources can communicate.

Traffic must be permitted by the relevant Security Groups.

This became especially clear while troubleshooting the EKS → RDS connection.

---

## RDS

I learned why a managed database can be separated from Kubernetes workloads.

```text
EKS
 ├── Frontend
 └── Backend
       │
       ▼
     RDS
```

This avoids unnecessarily managing PostgreSQL as a Kubernetes workload in the AWS environment.

---

## IAM

I learned the difference between:

```text
AWS IAM
```

and:

```text
Kubernetes RBAC
```

AWS IAM controls access to AWS APIs.

Kubernetes RBAC controls what an authenticated identity can do inside Kubernetes.

---

## GitHub OIDC

I learned how GitHub Actions can authenticate to AWS without storing long-lived AWS credentials.

```text
GitHub
  ↓
OIDC Token
  ↓
AWS STS
  ↓
IAM Role
  ↓
Temporary Credentials
```

---

## CI/CD

I learned that CI/CD is not just "GitHub Actions".

The pipeline connects several systems:

```text
Git
 ↓
GitHub Actions
 ↓
Docker
 ↓
ECR
 ↓
EKS
 ↓
Kubernetes Rollout
```

---

# 53. Interview Explanation

A concise explanation of the project:

> I built a full-stack Bug Tracker application with Spring Boot, React and PostgreSQL. I first containerized it with Docker and deployed it locally on Kubernetes. Then I moved the application to AWS, using ECR as the container registry and EKS for Kubernetes. I moved PostgreSQL from Kubernetes to Amazon RDS and configured the networking and Security Groups so the backend could communicate with the private database. The frontend is exposed through an AWS Load Balancer. Finally, I automated the deployment using GitHub Actions with GitHub OIDC, so the pipeline builds the Docker images, pushes them to ECR and updates the deployments in EKS.

---

# 54. Important Architecture Concepts

The complete architecture can be understood through four layers.

### Layer 1 — Application

```text
React
Spring Boot
PostgreSQL
```

### Layer 2 — Containers

```text
Docker
```

### Layer 3 — Kubernetes

```text
EKS
├── Frontend Deployment
├── Backend Deployment
├── Services
├── ConfigMap
└── Secrets
```

### Layer 4 — AWS Infrastructure

```text
VPC
├── Public Subnets
├── Private Subnets
├── Route Tables
├── Internet Gateway
├── NAT Gateway
└── Security Groups

ECR
EKS
RDS
Load Balancer
IAM
```

And finally:

```text
GitHub Actions
```

automates the deployment process.

---

# 55. Useful Commands

## AWS Identity

```bash
aws sts get-caller-identity
```

## AWS Region

```bash
aws configure get region
```

## ECR repositories

```bash
aws ecr describe-repositories \
    --region eu-central-1
```

## ECR images

```bash
aws ecr describe-images \
    --repository-name bugtracker-backend \
    --region eu-central-1
```

```bash
aws ecr describe-images \
    --repository-name bugtracker-frontend \
    --region eu-central-1
```

## EKS cluster

```bash
aws eks describe-cluster \
    --name bugtracker-cluster \
    --region eu-central-1
```

## EKS node groups

```bash
eksctl get nodegroups \
    --cluster bugtracker-cluster \
    --region eu-central-1
```

## Kubernetes nodes

```bash
kubectl get nodes
```

## All pods

```bash
kubectl get pods -A
```

## Application pods

```bash
kubectl get pods -n bugtracker
```

## Deployments

```bash
kubectl get deployment -n bugtracker
```

## Services

```bash
kubectl get svc -n bugtracker
```

## Frontend Load Balancer

```bash
kubectl get svc \
    -n bugtracker \
    frontend
```

## Pod logs

```bash
kubectl logs \
    -n bugtracker \
    <POD_NAME>
```

## Rollout status

```bash
kubectl rollout status \
    deployment/backend \
    -n bugtracker
```

```bash
kubectl rollout status \
    deployment/frontend \
    -n bugtracker
```

---

# 56. Security Notes

No real credentials should be stored in this repository.

Do not commit:

```text
AWS Access Key
AWS Secret Access Key
Database Password
Private Keys
Kubernetes Secret values
```

GitHub Actions uses OIDC rather than long-lived AWS credentials.

Kubernetes permissions are also scoped through RBAC rather than giving the GitHub Actions identity unrestricted `cluster-admin` access.

---

# 57. Cost Considerations

The AWS environment was created as a hands-on learning and portfolio project.

AWS resources should not be left running unnecessarily.

Important resources to monitor include:

```text
EKS
EC2 worker nodes
NAT Gateway
RDS
Load Balancer
EBS
CloudWatch
```

The goal is not to create as many AWS services as possible.

The goal is to understand why each resource exists and how it contributes to the architecture.

---

# 58. Current State

At the end of this phase, the application has evolved from:

```text
Local Application
      ↓
Docker
      ↓
Local Kubernetes
```

to:

```text
Real AWS Environment

GitHub
   ↓
GitHub Actions
   ↓
ECR
   ↓
EKS
   ├── Frontend
   └── Backend
         │
         ▼
        RDS
```

The frontend is externally accessible through an AWS Load Balancer.

The backend runs inside EKS.

PostgreSQL runs on Amazon RDS.

The container images are stored in ECR.

GitHub Actions automates the image build, ECR push and EKS deployment.

---

# 59. Phase Status

- [x] AWS CLI configuration
- [x] AWS identity verification
- [x] ECR repositories
- [x] Docker → ECR image push
- [x] EKS cluster
- [x] EKS worker nodes
- [x] VPC and subnet inspection
- [x] Security Group inspection
- [x] IAM investigation
- [x] Kubernetes application deployment
- [x] PostgreSQL → RDS migration
- [x] RDS networking
- [x] EKS → RDS connectivity
- [x] AWS Load Balancer
- [x] GitHub OIDC
- [x] GitHub Actions IAM Role
- [x] Kubernetes RBAC for GitHub Actions
- [x] GitHub Actions workflow
- [x] Docker image build automation
- [x] ECR push automation
- [x] EKS deployment automation
- [x] Kubernetes rollout verification

---

# 60. What Comes Next?

The AWS deployment is now the foundation for the next stages of the project.

The original roadmap is no longer followed literally.

The current logical evolution is:

```text
Application
    ↓
Docker
    ↓
Kubernetes
    ↓
AWS
    ├── ECR
    ├── EKS
    ├── VPC
    ├── IAM
    ├── RDS
    └── Load Balancer
    ↓
GitHub Actions
    ↓
CI/CD
```

# Future improvements can build on this foundation:

```text
Helm
   ↓
Terraform
   ↓
ArgoCD / GitOps
   ↓
Prometheus + Grafana
   ↓
CloudWatch
   ↓
Route 53
   ↓
ACM / HTTPS
   ↓
S3
```

These technologies were intentionally postponed until the core AWS deployment was understood.

---

# 61. Final Takeaway

The most important result of this phase is not the number of AWS services used.

It is understanding the complete path:

```text
Developer
    │
    │ git push
    ▼
GitHub
    │
    ▼
GitHub Actions
    │
    ├── Docker build
    │
    ├── ECR push
    │
    └── EKS deployment
             │
             ▼
          Kubernetes
             │
       ┌─────┴─────┐
       ▼           ▼
   Frontend      Backend
       │           │
       │           ▼
       │          RDS
       │       PostgreSQL
       │
       ▼
AWS Load Balancer
       │
       ▼
   Internet
```

This phase transformed the project from a local Kubernetes application into a real AWS-hosted application with an automated deployment pipeline.

The project is now ready to evolve toward more advanced DevOps practices.