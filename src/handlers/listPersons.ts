import { APIGatewayProxyResult } from "aws-lambda";
import { getPool } from "../db/connection";

export async function handler(): Promise<APIGatewayProxyResult> {
    try {
        const pool = await getPool();
        const [rows] = await pool.execute("SELECT * FROM persons");
        return { statusCode: 200, body: JSON.stringify(rows) };
    } catch (error) {
        console.error("Error en listPersons:", error);
        return { statusCode: 500, body: JSON.stringify({ error: "Error interno" }) };
    }
}