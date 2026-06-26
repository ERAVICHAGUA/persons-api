import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { getPool } from "../db/connection";

export async function handler(
    event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
    try {
        const personId = event.pathParameters?.personId;
        const { email } = JSON.parse(event.body || "{}");

        if (!email) {
            return { statusCode: 400, body: JSON.stringify({ error: "El campo email es requerido" }) };
        }

        const pool = await getPool();
        const [result]: any = await pool.execute(
            "UPDATE persons SET email = ? WHERE id = ?",
            [email, personId]
        );

        if (result.affectedRows === 0) {
            return { statusCode: 404, body: JSON.stringify({ error: "Persona no encontrada" }) };
        }

        return { statusCode: 200, body: JSON.stringify({ message: "Email actualizado" }) };
    } catch (error) {
        console.error("Error en updatePerson:", error);
        return { statusCode: 500, body: JSON.stringify({ error: "Error interno" }) };
    }
}