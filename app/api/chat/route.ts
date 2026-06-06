import { GoogleGenAI } from '@google/genai';
import { NextRequest } from 'next/server';
import { buildAuditEvent } from '@/lib/audit-events';
import { parseChatMessageInput } from '@/lib/chat-request';
import { getAdminDb } from '@/lib/firebase-admin';
import { AuthHttpError, requireAdminUser, type AdminSession } from '@/lib/server-auth';

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

function readText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function readNumber(value: unknown, fallback = 0) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function incrementGroupedCounter(
  target: Record<string, Record<string, unknown>>,
  key: string,
  patch: Record<string, unknown>,
  amount = 1
) {
  const current = target[key] ?? { total: 0 };
  target[key] = {
    ...current,
    ...patch,
    total: readNumber(current.total) + amount,
  };
}

async function readPlantContext(adminUser: AdminSession) {
  const db = getAdminDb();
  const plantFilter = adminUser.role === 'admin_global' ? null : adminUser.plantaId;
  const inventoryQuery = plantFilter
    ? db.collection('ppe_catalog').where('plantaId', '==', plantFilter).limit(500)
    : db.collection('ppe_catalog').limit(500);
  const employeesQuery = plantFilter
    ? db.collection('employees').where('active', '==', true).where('plantaId', '==', plantFilter).limit(1000)
    : db.collection('employees').where('active', '==', true).limit(1000);
  const assignmentsQuery = plantFilter
    ? db.collection('assignments').where('plantaId', '==', plantFilter).limit(300)
    : db.collection('assignments').orderBy('assignedAt', 'desc').limit(300);
  const [inventorySnap, employeesSnap, assignmentsSnap] = await Promise.all([
    inventoryQuery.get(),
    employeesQuery.get(),
    assignmentsQuery.get(),
  ]);

  const inventory: Array<Record<string, unknown>> = inventorySnap.docs.map((docSnap) => ({
    _id: docSnap.id,
    ...(serializeFirestoreValue(docSnap.data()) as Record<string, unknown>),
  }));

  const employeesByArea: Record<string, Record<string, unknown>> = {};
  employeesSnap.docs.forEach((docSnap) => {
    const employee = docSnap.data();
    const area = readText(employee.area) || readText(employee.personnelArea) || 'SIN AREA';
    const plantaId = readText(employee.plantaId) || 'sin_planta';
    incrementGroupedCounter(employeesByArea, `${plantaId}:${area}`, { area, plantaId });
  });

  const consumptionBySku: Record<string, Record<string, unknown>> = {};
  const consumptionByArea: Record<string, Record<string, unknown>> = {};
  assignmentsSnap.docs.forEach((docSnap) => {
    const assignment = docSnap.data();
    const sku = readText(assignment.sku) || readText(assignment.itemId) || 'SIN SKU';
    const itemName = readText(assignment.itemName) || sku;
    const area = readText(assignment.employeeArea) || 'SIN AREA';
    const plantaId = readText(assignment.plantaId) || 'sin_planta';
    incrementGroupedCounter(consumptionBySku, `${plantaId}:${sku}`, { sku, itemName, plantaId });
    incrementGroupedCounter(consumptionByArea, `${plantaId}:${area}`, { area, plantaId });
  });

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
    employeesSummary: Object.values(employeesByArea),
    consumptionSummary: {
      bySku: Object.values(consumptionBySku),
      byArea: Object.values(consumptionByArea),
      sampledAssignments: assignmentsSnap.size,
    },
    alerts,
    totals: {
      inventoryItems: inventorySnap.size,
      activeEmployees: employeesSnap.size,
      assignmentsSampled: assignmentsSnap.size,
      plantScope: plantFilter ?? 'todas',
    },
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

    const adminUser = await requireAdminUser(req);

    const body = await req.json();
    const parsedMessage = parseChatMessageInput(body);
    if (!parsedMessage.ok) {
      return Response.json({ error: parsedMessage.error }, { status: 400 });
    }
    const { message } = parsedMessage;

    const context = await readPlantContext(adminUser);
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

### Empleados Activos (agregado por area, sin nombres):
${JSON.stringify(context?.employeesSummary ?? [], null, 2)}

### Consumo de EPP (agregado, sin nombres de colaboradores):
${JSON.stringify(context?.consumptionSummary ?? {}, null, 2)}

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
    await getAdminDb().collection('audit_events').add(buildAuditEvent({
      type: 'aria.query',
      actorUid: adminUser.uid,
      actorEmail: adminUser.email,
      targetCollection: 'ai_queries',
      targetId: adminUser.uid,
      metadata: {
        messageLength: message.length,
        plantScope: context.totals.plantScope,
        inventoryItems: context.totals.inventoryItems,
        activeEmployees: context.totals.activeEmployees,
        assignmentsSampled: context.totals.assignmentsSampled,
      },
    }, req));

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
