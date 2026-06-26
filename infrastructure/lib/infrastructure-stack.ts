import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigatewayv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as logs from "aws-cdk-lib/aws-logs";
import * as path from "path";

export class InfrastructureStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ─── 1. VPC ───────────────────────────────────────────────────────────────
    // La prueba exige que Lambda esté dentro de una VPC por regulaciones.
    // Creamos una VPC con subnets privadas (Lambda y RDS) y públicas (NAT Gateway).
    const vpc = new ec2.Vpc(this, "PersonsVpc", {
      maxAzs: 2, // 2 zonas de disponibilidad para alta disponibilidad
      natGateways: 1, // permite a Lambda salir a internet (para Secrets Manager)
      subnetConfiguration: [
        {
          name: "private",
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24,
        },
        {
          name: "public",
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
      ],
    });

    // ─── 2. SECURITY GROUPS ───────────────────────────────────────────────────
    // Security Group para Lambda — controla qué tráfico puede salir/entrar
    const lambdaSG = new ec2.SecurityGroup(this, "LambdaSG", {
      vpc,
      description: "Security group para funciones Lambda",
      allowAllOutbound: true, // Lambda necesita salir a Secrets Manager y RDS
    });

    // Security Group para RDS — solo acepta conexiones desde Lambda
    const rdsSG = new ec2.SecurityGroup(this, "RdsSG", {
      vpc,
      description: "Security group para RDS MySQL",
      allowAllOutbound: false,
    });

    // Permitir que Lambda se conecte a RDS en el puerto 3306 (MySQL)
    rdsSG.addIngressRule(
      lambdaSG,
      ec2.Port.tcp(3306),
      "Permitir conexiones MySQL desde Lambda"
    );

    // ─── 3. SECRETS MANAGER ───────────────────────────────────────────────────
    // Guardamos las credenciales de la DB encriptadas — nunca en texto plano
    const dbSecret = new secretsmanager.Secret(this, "DbSecret", {
      secretName: "persons-api/db-credentials",
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: "admin" }),
        generateStringKey: "password",
        excludePunctuation: true, // MySQL prefiere passwords sin caracteres especiales
        passwordLength: 16,
      },
    });

    // ─── 4. RDS MYSQL ─────────────────────────────────────────────────────────
    // Usamos t3.micro para mantener costos bajos (suficiente para la prueba)
    const database = new rds.DatabaseInstance(this, "PersonsDB", {
      engine: rds.DatabaseInstanceEngine.mysql({
        version: rds.MysqlEngineVersion.VER_8_0,
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO
      ),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [rdsSG],
      credentials: rds.Credentials.fromSecret(dbSecret),
      databaseName: "personsdb",
      // Configuraciones para reducir costos en ambiente de prueba
      multiAz: false,
      allocatedStorage: 20,
      deletionProtection: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ─── 5. ALARMA CPU > 70% ──────────────────────────────────────────────────
    // La prueba lo exige explícitamente
    new cloudwatch.Alarm(this, "DbCpuAlarm", {
      metric: database.metricCPUUtilization(),
      threshold: 70,
      evaluationPeriods: 2,
      alarmDescription: "CPU de la base de datos supera el 70%",
      comparisonOperator:
        cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });

    // ─── 6. LAMBDA LAYER (dependencias compartidas) ───────────────────────────
    // Empaquetamos node_modules para que no se repita en cada Lambda
    const depsLayer = new lambda.LayerVersion(this, "DepsLayer", {
      code: lambda.Code.fromAsset(path.join(__dirname, "../../"), {
        bundling: {
          image: lambda.Runtime.NODEJS_20_X.bundlingImage,
          command: [
            "bash", "-c",
            "npm ci --omit=dev && cp -r node_modules /asset-output/nodejs/node_modules",
          ],
        },
      }),
      compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
      description: "Dependencias de la API de personas",
    });

    // ─── 7. VARIABLES DE ENTORNO COMUNES ──────────────────────────────────────
    const lambdaEnvironment = {
      DB_HOST: database.dbInstanceEndpointAddress,
      DB_SECRET_ARN: dbSecret.secretArn,
      NODE_ENV: "production",
    };

    // ─── 8. CONFIGURACIÓN BASE DE LAMBDA ──────────────────────────────────────
    const lambdaDefaults = {
      runtime: lambda.Runtime.NODEJS_20_X,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSG],
      environment: lambdaEnvironment,
      layers: [depsLayer],
      timeout: cdk.Duration.seconds(30),
      // Logs automáticos en CloudWatch con retención de 1 mes
      logRetention: logs.RetentionDays.ONE_MONTH,
    };

    // ─── 9. FUNCIONES LAMBDA ──────────────────────────────────────────────────
    const createPersonFn = new lambda.Function(this, "CreatePersonFn", {
      ...lambdaDefaults,
      handler: "handlers/createPerson.handler",
      code: lambda.Code.fromAsset(path.join(__dirname, "../../dist")),
      description: "POST /persons - Crea una persona",
    });

    const listPersonsFn = new lambda.Function(this, "ListPersonsFn", {
      ...lambdaDefaults,
      handler: "handlers/listPersons.handler",
      code: lambda.Code.fromAsset(path.join(__dirname, "../../dist")),
      description: "GET /persons - Lista personas",
    });

    const updatePersonFn = new lambda.Function(this, "UpdatePersonFn", {
      ...lambdaDefaults,
      handler: "handlers/updatePerson.handler",
      code: lambda.Code.fromAsset(path.join(__dirname, "../../dist")),
      description: "PUT /persons/{id} - Actualiza email",
    });

    const deletePersonFn = new lambda.Function(this, "DeletePersonFn", {
      ...lambdaDefaults,
      handler: "handlers/deletePerson.handler",
      code: lambda.Code.fromAsset(path.join(__dirname, "../../dist")),
      description: "DELETE /persons/{id} - Elimina persona",
    });

    // ─── 10. PERMISOS ─────────────────────────────────────────────────────────
    // Permitir que cada Lambda lea las credenciales de Secrets Manager
    [createPersonFn, listPersonsFn, updatePersonFn, deletePersonFn].forEach(
      (fn) => dbSecret.grantRead(fn)
    );

    // ─── 11. API GATEWAY HTTP ─────────────────────────────────────────────────
    // Usamos API Gateway V2 (HTTP API) — más barato y simple que REST API
    const api = new apigatewayv2.HttpApi(this, "PersonsApi", {
      apiName: "persons-api",
      description: "API para gestión de personas",
      corsPreflight: {
        allowOrigins: ["*"],
        allowMethods: [apigatewayv2.CorsHttpMethod.ANY],
        allowHeaders: ["Content-Type"],
      },
    });

    // Rutas de la API
    api.addRoutes({
      path: "/persons",
      methods: [apigatewayv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration(
        "CreatePersonIntegration",
        createPersonFn
      ),
    });

    api.addRoutes({
      path: "/persons",
      methods: [apigatewayv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration(
        "ListPersonsIntegration",
        listPersonsFn
      ),
    });

    api.addRoutes({
      path: "/persons/{personId}",
      methods: [apigatewayv2.HttpMethod.PUT],
      integration: new integrations.HttpLambdaIntegration(
        "UpdatePersonIntegration",
        updatePersonFn
      ),
    });

    api.addRoutes({
      path: "/persons/{personId}",
      methods: [apigatewayv2.HttpMethod.DELETE],
      integration: new integrations.HttpLambdaIntegration(
        "DeletePersonIntegration",
        deletePersonFn
      ),
    });

    // ─── 12. OUTPUTS ──────────────────────────────────────────────────────────
    // Muestra la URL de la API al final del despliegue
    new cdk.CfnOutput(this, "ApiUrl", {
      value: api.apiEndpoint,
      description: "URL de la API de personas",
    });

    new cdk.CfnOutput(this, "DbEndpoint", {
      value: database.dbInstanceEndpointAddress,
      description: "Endpoint de la base de datos",
    });
  }
}