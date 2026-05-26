import { GoogleGenAI } from '@google/genai';
import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { AuthHttpError, requireAdminUser } from '@/lib/server-auth';

export const runtime = 'nodejs';

function serializeFirestoreValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;

  if ('toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }

  if (Array.isArray(value)) {
    return value.map(serializeFirestoreValue);
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      serializeFirestoreValue(entry),
    ])
  );
}

async function readPlantContext() {
  const db = getAdminDb();
  const [inventorySnap, employeesSnap, assignmentsSnap] = await Promise.all([
    db.collection('ppe_catalog').limit(500).get(),
    db.collection('employees').where('active', '==', true).limit(500).get(),
    db.collection('assignments').orderBy('assignedAt', 'desc').limit(50).get(),
  ]);

  const inventory: Array<Record<string, unknown>> = inventorySnap.docs.map((docSnap) => ({
    _id: docSnap.id,
    ...(serializeFirestoreValue(docSnap.data()) as Record<string, unknown>),
  }));

  const employees: Array<Record<string, unknown>> = employeesSnap.docs.map((docSnap) => ({
    _id: docSnap.id,
    ...(serializeFirestoreValue(docSnap.data()) as Record<string, unknown>),
  }));

  const assignments: Array<Record<string, unknown>> = assignmentsSnap.docs.map((docSnap) => ({
    _id: docSnap.id,
    ...(serializeFirestoreValue(docSnap.data()) as Record<string, unknown>),
  }));

  const alerts = inventory
    .filter((item) => {
      const stock = typeof item.stock === 'number' ? item.stock : 0;
      return stock === 0 || stock <= 20;
    })
    .map((item) => {
      const stock = typeof item.stock === 'number' ? item.stock : 0;
      return {
        sku: item.sku,
        name: item.name,
        stock,
        severity: stock === 0 ? 'CRITICO' : 'BAJO',
      };
    });

  return {
    inventory,
    employees,
    assignments,
    alerts,
    currentDate: new Date().toISOString(),
  };
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return Response.json(
        { error: 'Configuración incompleta: define GEMINI_API_KEY en el servidor.' },
        { status: 503 }
      );
    }

    await requireAdminUser(req);

    const body = await req.json();
    const message = typeof body?.message === 'string' ? body.message.trim() : '';

    if (!message || message.length > 2000) {
      return Response.json({ error: 'Mensaje requerido de maximo 2000 caracteres.' }, { status: 400 });
    }

    const context = await readPlantContext();
    const ai = new GoogleGenAI({ apiKey });

    const systemInstruction = `
Eres ARIA (Asistente de Riesgo e Inventario Automatizado), un asistente virtual experto en:
- Seguridad Industrial y normas NOM (STPS) de México
- Análisis de inventarios y predicción de stock de Equipos de Protección Personal (EPP)
- Detección de anomalías en patrones de consumo
- Análisis de riesgo por área de trabajo

Tienes acceso a los datos en tiempo real de la planta:

## DATOS ACTUALES DEL SISTEMA:

### Inventario EPP (ppe_catalog):
${JSON.stringify(context?.inventory ?? [], null, 2)}

### Empleados Activos:
${JSON.stringify(context?.employees ?? [], null, 2)}

### Últimas 50 Asignaciones (assignments):
${JSON.stringify(context?.assignments ?? [], null, 2)}

### Alertas Activas:
${JSON.stringify(context?.alerts ?? [], null, 2)}

## TUS CAPACIDADES:
1. **Análisis Predictivo**: Calcula cuándo se agotará el stock basado en el ritmo histórico de consumo.
2. **Detección de Anomalías**: Identifica empleados o áreas con consumo inusual.
3. **Recomendaciones de Compra**: Genera órdenes de compra sugeridas.
4. **Cumplimiento Normativo**: Informa sobre normas NOM aplicables a los EPP.
5. **Análisis por Área**: Compara consumo entre áreas de trabajo.
6. **Alertas Proactivas**: Prioriza EPP críticos que requieren atención inmediata.

## REGLAS DE RESPUESTA:
- Responde SIEMPRE en español de México.
- Sé específico con nombres, cifras y fechas de los datos proporcionados.
- Usa emojis moderadamente para mejorar la legibilidad.
- Si detectas un riesgo crítico (sin stock o vencimiento inminente), resáltalo claramente.
- Cuando hagas predicciones, explica el razonamiento con datos concretos.
- Formato: usa markdown con negritas, listas y tablas cuando sea apropiado.
- Si no tienes datos suficientes, indícalo claramente y qué datos se necesitarían.
- Máximo 500 palabras por respuesta, salvo que se solicite un reporte completo.
`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: message,
      config: {
        systemInstruction,
        temperature: 0.4,
        maxOutputTokens: 2048,
      },
    });

    const text = response.text;

    return Response.json({ text, success: true });
  } catch (error: unknown) {
    if (error instanceof AuthHttpError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    const status =
      typeof error === 'object' &&
      error !== null &&
      'status' in error &&
      typeof (error as { status?: unknown }).status === 'number'
        ? (error as { status: number }).status
        : 500;

    const message =
      typeof error === 'object' &&
      error !== null &&
      'message' in error &&
      typeof (error as { message?: unknown }).message === 'string'
        ? (error as { message: string }).message
        : '';

    console.error('[Chat API Error]:', error);

    if (status === 403 && message.toLowerCase().includes('api key was reported as leaked')) {
      return Response.json(
        {
          error:
            'La API key de Gemini fue deshabilitada por exposición. Genera una nueva key y actualiza GEMINI_API_KEY en el servidor.',
        },
        { status: 403 }
      );
    }

    if (status === 403) {
      return Response.json(
        { error: 'Gemini rechazó la solicitud por permisos de API key. Verifica GEMINI_API_KEY.' },
        { status: 403 }
      );
    }

    return Response.json(
      { error: 'Error al procesar la consulta con IA. Verifica tu API key de Gemini.' },
      { status: 500 }
    );
  }
}
