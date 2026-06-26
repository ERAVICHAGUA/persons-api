import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { getPool } from "../db/connection";

type DocumentType = "DNI" | "CE"; // CE = Carnet de Extranjería

interface CreatePersonBody {
    nombre: string;
    apellidos: string;
    email: string;
    tipo_documento: DocumentType;
    numero_documento: string;
}

export async function handler(
    event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
    try {
        const body: CreatePersonBody = JSON.parse(event.body || "{}");
        const { nombre, apellidos, email, tipo_documento, numero_documento } = body;

        // Validaciones básicas
        if (!nombre || !apellidos || !email || !tipo_documento || !numero_documento) {
            return { statusCode: 400, body: JSON.stringify({ error: "Todos los campos son requeridos" }) };
        }
        if (!["DNI", "CE"].includes(tipo_documento)) {
            return { statusCode: 400, body: JSON.stringify({ error: "tipo_documento debe ser DNI o CE" }) };
        }

        const pool = await getPool();
        const [result]: any = await pool.execute(
            "INSERT INTO persons (nombre, apellidos, email, tipo_documento, numero_documento) VALUES (?, ?, ?, ?, ?)",
            [nombre, apellidos, email, tipo_documento, numero_documento]
        );

        return {
            statusCode: 201,
            body: JSON.stringify({ message: "Persona creada", id: result.insertId }),
        };
    } catch (error: any) {
        console.error("Error en createPerson:", error);
        return { statusCode: 500, body: JSON.stringify({ error: "Error interno" }) };
    }
}