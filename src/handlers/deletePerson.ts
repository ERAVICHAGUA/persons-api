import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { getPool } from "../db/connection";

export async function handler(
    event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
    try {
        const personId = event.pathParameters?.personId;

        if (!personId) {
            return { statusCode: 400, body: JSON.stringify({ error: "personId es requerido" }) };
        }

        const pool = await getPool();
        const [result]: any = await pool.execute(
            "DELETE FROM persons WHERE id = ?",
            [personId]
        );

        if (result.affectedRows === 0) {
            return { statusCode: 404, body: JSON.stringify({ error: "Persona no encontrada" }) };
        }

        return { statusCode: 200, body: JSON.stringify({ message: "Persona eliminada" }) };
    } catch (error) {
        console.error("Error en deletePerson:", error);
        return { statusCode: 500, body: JSON.stringify({ error: "Error interno" }) };
    }
}