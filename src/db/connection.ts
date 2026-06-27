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

    // Crear tabla si no existe
    await pool.execute(`
        CREATE TABLE IF NOT EXISTS persons (
            id INT AUTO_INCREMENT PRIMARY KEY,
            nombre VARCHAR(100) NOT NULL,
            apellidos VARCHAR(100) NOT NULL,
            email VARCHAR(100) NOT NULL UNIQUE,
            tipo_documento ENUM('DNI', 'CE') NOT NULL,
            numero_documento VARCHAR(20) NOT NULL UNIQUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    return pool;
}