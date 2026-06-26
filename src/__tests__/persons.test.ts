// Simulamos (mock) la conexión a la base de datos
// para que las pruebas corran sin necesitar AWS ni MySQL real
jest.mock("../db/connection", () => ({
    getPool: jest.fn(),
}));

import { getPool } from "../db/connection";
import { handler as createPerson } from "../handlers/createPerson";
import { handler as listPersons } from "../handlers/listPersons";
import { handler as updatePerson } from "../handlers/updatePerson";
import { handler as deletePerson } from "../handlers/deletePerson";

// Helper para crear un evento falso de API Gateway
const makeEvent = (overrides: any = {}) => ({
    body: null,
    pathParameters: null,
    queryStringParameters: null,
    headers: {},
    ...overrides,
});

// Mock de pool de base de datos
const mockExecute = jest.fn();
const mockPool = { execute: mockExecute };

beforeEach(() => {
    jest.clearAllMocks();
    (getPool as jest.Mock).mockResolvedValue(mockPool);
});

// ─── CREATE PERSON ───────────────────────────────────────────
describe("POST /persons", () => {
    it("crea una persona correctamente", async () => {
        mockExecute.mockResolvedValue([{ insertId: 1 }]);

        const event = makeEvent({
            body: JSON.stringify({
                nombre: "Juan",
                apellidos: "Pérez",
                email: "juan@test.com",
                tipo_documento: "DNI",
                numero_documento: "12345678",
            }),
        });

        const result = await createPerson(event as any);
        expect(result.statusCode).toBe(201);
        expect(JSON.parse(result.body)).toHaveProperty("id", 1);
    });

    it("retorna 400 si faltan campos", async () => {
        const event = makeEvent({
            body: JSON.stringify({ nombre: "Juan" }),
        });

        const result = await createPerson(event as any);
        expect(result.statusCode).toBe(400);
    });

    it("retorna 400 si tipo_documento no es DNI ni CE", async () => {
        const event = makeEvent({
            body: JSON.stringify({
                nombre: "Juan",
                apellidos: "Pérez",
                email: "juan@test.com",
                tipo_documento: "PASAPORTE",
                numero_documento: "12345678",
            }),
        });

        const result = await createPerson(event as any);
        expect(result.statusCode).toBe(400);
    });
});

// ─── LIST PERSONS ────────────────────────────────────────────
describe("GET /persons", () => {
    it("retorna la lista de personas", async () => {
        const personas = [
            { id: 1, nombre: "Juan", apellidos: "Pérez", email: "juan@test.com" },
        ];
        mockExecute.mockResolvedValue([personas]);

        const result = await listPersons();
        expect(result.statusCode).toBe(200);
        expect(JSON.parse(result.body)).toHaveLength(1);
    });
});

// ─── UPDATE PERSON ───────────────────────────────────────────
describe("PUT /persons/:id", () => {
    it("actualiza el email correctamente", async () => {
        mockExecute.mockResolvedValue([{ affectedRows: 1 }]);

        const event = makeEvent({
            pathParameters: { personId: "1" },
            body: JSON.stringify({ email: "nuevo@test.com" }),
        });

        const result = await updatePerson(event as any);
        expect(result.statusCode).toBe(200);
    });

    it("retorna 404 si la persona no existe", async () => {
        mockExecute.mockResolvedValue([{ affectedRows: 0 }]);

        const event = makeEvent({
            pathParameters: { personId: "999" },
            body: JSON.stringify({ email: "nuevo@test.com" }),
        });

        const result = await updatePerson(event as any);
        expect(result.statusCode).toBe(404);
    });

    it("retorna 400 si no se envía email", async () => {
        const event = makeEvent({
            pathParameters: { personId: "1" },
            body: JSON.stringify({}),
        });

        const result = await updatePerson(event as any);
        expect(result.statusCode).toBe(400);
    });
});

// ─── DELETE PERSON ───────────────────────────────────────────
describe("DELETE /persons/:id", () => {
    it("elimina una persona correctamente", async () => {
        mockExecute.mockResolvedValue([{ affectedRows: 1 }]);

        const event = makeEvent({
            pathParameters: { personId: "1" },
        });

        const result = await deletePerson(event as any);
        expect(result.statusCode).toBe(200);
    });

    it("retorna 404 si la persona no existe", async () => {
        mockExecute.mockResolvedValue([{ affectedRows: 0 }]);

        const event = makeEvent({
            pathParameters: { personId: "999" },
        });

        const result = await deletePerson(event as any);
        expect(result.statusCode).toBe(404);
    });

    it("retorna 400 si no se envía personId", async () => {
        const event = makeEvent({
            pathParameters: null,
        });

        const result = await deletePerson(event as any);
        expect(result.statusCode).toBe(400);
    });
});