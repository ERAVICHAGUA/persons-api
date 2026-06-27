# Persons API

API REST para gestión de personas, desplegada en AWS con Lambda, RDS MySQL y API Gateway V2.

---

## Arquitectura

```
Internet
    │
    ▼
API Gateway V2 (HTTP API)
    │
    ▼
AWS Lambda (Node.js 20) ──── Secrets Manager
    │                              │
    ▼                              ▼
RDS MySQL (personsdb)        Credenciales DB
[Subnet Privada]

Todo dentro de una VPC con subnets privadas y públicas.
NAT Gateway permite a Lambda salir a internet (Secrets Manager).
```

![Diagrama de arquitectura](./architecture.png)

---

## Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/persons` | Crear una persona |
| GET | `/persons` | Listar todas las personas |
| PUT | `/persons/{personId}` | Actualizar email de una persona |
| DELETE | `/persons/{personId}` | Eliminar una persona |

### POST /persons

**Body:**
```json
{
  "nombre": "Juan",
  "apellidos": "Pérez",
  "email": "juan@test.com",
  "tipo_documento": "DNI",
  "numero_documento": "12345678"
}
```
`tipo_documento` acepta: `DNI` o `CE` (Carnet de Extranjería).

**Respuesta exitosa (201):**
```json
{ "message": "Persona creada", "id": 1 }
```

### GET /persons

**Respuesta exitosa (200):**
```json
[
  {
    "id": 1,
    "nombre": "Juan",
    "apellidos": "Pérez",
    "email": "juan@test.com",
    "tipo_documento": "DNI",
    "numero_documento": "12345678",
    "created_at": "2026-06-27T00:00:00.000Z"
  }
]
```

### PUT /persons/{personId}

**Body:**
```json
{ "email": "nuevo@test.com" }
```

### DELETE /persons/{personId}

**Respuesta exitosa (200):**
```json
{ "message": "Persona eliminada" }
```

---

## Requisitos previos

- Node.js 20+
- AWS CLI configurado con credenciales válidas
- AWS CDK instalado: `npm install -g aws-cdk`
- Docker (para el bundling de la Lambda Layer)
- Una cuenta AWS limpia en la región `us-east-2`

---

## Despliegue desde cero

### 1. Clonar el repositorio

```bash
git clone https://github.com/ERAVICHAGUA/persons-api.git
cd persons-api
```

### 2. Instalar dependencias

```bash
# Dependencias raíz (aplicación)
npm ci

# Dependencias de infraestructura
cd infrastructure
npm ci
cd ..
```

### 3. Compilar el código TypeScript

```bash
npm run build
```

### 4. Configurar credenciales AWS

```bash
aws configure
# Ingresar: Access Key ID, Secret Access Key, región (us-east-2), formato (json)
```

### 5. Bootstrap de CDK (solo la primera vez)

```bash
cd infrastructure
npx cdk bootstrap
```

### 6. Desplegar

```bash
npx cdk deploy --require-approval never
```

Al finalizar verás los outputs:
```
Outputs:
InfrastructureStack.ApiUrl = https://xxxxxxxxxx.execute-api.us-east-2.amazonaws.com
InfrastructureStack.DbEndpoint = xxxxxxxxxx.us-east-2.rds.amazonaws.com
```

---

## CI/CD con GitHub Actions

El repositorio tiene dos workflows:

### CI (`ci.yml`) — Pull Requests a `main`
- Type checking con `tsc --noEmit`
- Pruebas unitarias con Jest

### Deploy (`deploy.yml`) — Push a `main`
- Bootstrap de CDK
- Deploy completo a AWS

### Secrets requeridos en GitHub

Ir a **Settings → Secrets and variables → Actions** y agregar:

| Secret | Descripción |
|--------|-------------|
| `AWS_ACCESS_KEY_ID` | Access Key de un usuario IAM con permisos de deploy |
| `AWS_SECRET_ACCESS_KEY` | Secret Key del mismo usuario |

---

## Desarrollo local

### Ejecutar tests

```bash
npm test
```

### Type checking

```bash
npm run typecheck
```

### Compilar

```bash
npm run build
```

---

## Infraestructura

Toda la infraestructura está definida en `infrastructure/lib/infrastructure-stack.ts` usando AWS CDK.

Recursos creados:
- **VPC** con 2 AZs, subnets privadas y públicas, NAT Gateway
- **Security Groups** para Lambda y RDS
- **Secrets Manager** con credenciales de la DB generadas automáticamente
- **RDS MySQL 8.0** (t3.micro) en subnet privada
- **CloudWatch Alarm** CPU > 70% en la DB
- **Lambda Layer** con dependencias de Node.js compartidas
- **4 funciones Lambda** (una por endpoint)
- **API Gateway V2** con rutas HTTP
- **CloudWatch Logs** con retención de 1 mes

### Nota sobre persistencia de archivos (futuro)

Para soporte de archivos subidos por usuarios, se recomienda agregar un bucket **S3** con las siguientes consideraciones:
- Acceso privado, con URLs pre-firmadas para subida/descarga
- Política de ciclo de vida para archivos antiguos
- Endpoint de VPC para S3 (evita costos de NAT Gateway)

---

## Decisiones arquitectónicas

Las decisiones están documentadas con comentarios en el código. Resumen:

- **API Gateway V2** sobre V1: más barato y suficiente para HTTP APIs sin necesidad de features avanzados de REST.
- **Lambda Layer**: evita duplicar `node_modules` en cada función, reduce tamaño de deployment y acelera cold starts.
- **Secrets Manager**: las credenciales nunca están en texto plano ni en variables de entorno directas.
- **NAT Gateway**: permite a Lambda en subnet privada alcanzar Secrets Manager sin exponerla a internet.
- **t3.micro para RDS**: suficiente para el caso de uso de la prueba, minimiza costos.
- **`multiAz: false`**: desactivado para reducir costos en ambiente de prueba.