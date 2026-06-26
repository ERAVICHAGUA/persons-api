import mysql from "mysql2/promise";
import {
    SecretsManagerClient,
    GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

let pool: mysql.Pool | null = null;

async function getDbCredentials() {
    const client = new SecretsManagerClient({ region: "us-east-2" });
    const response = await client.send(
        new GetSecretValueCommand({
            SecretId: process.env.DB_SECRET_ARN!,
        })
    );
    return JSON.parse(response.SecretString!);
}

export async function getPool(): Promise<mysql.Pool> {
    if (pool) return pool;

    const creds = await getDbCredentials();

    pool = mysql.createPool({
        host: process.env.DB_HOST!,
        port: 3306,
        user: creds.username,
        password: creds.password,
        database: "personsdb",
        waitForConnections: true,
        connectionLimit: 5,
    });

    return pool;
}