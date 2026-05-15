import { GoogleGenAI } from '@google/genai';
import { NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return Response.json(
        { error: 'Configuración incompleta: define GEMINI_API_KEY en el servidor.' },
        { status: 503 }
      );
    }

    const body = await req.json();
    const { message, context } = body;

    if (!message) {
      return Response.json({ error: 'Mensaje requerido' }, { status: 400 });
    }

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
