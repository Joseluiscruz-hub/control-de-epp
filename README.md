# AssetGuard - Control de EPP

Sistema empresarial para control, trazabilidad y operación de Equipo de Protección Personal en planta.

[![Next.js](https://img.shields.io/badge/Next.js-15-black?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-149ECA?style=for-the-badge&logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Firebase](https://img.shields.io/badge/Firebase-Firestore-FFCA28?style=for-the-badge&logo=firebase&logoColor=111)](https://firebase.google.com/)
[![Cloud Run](https://img.shields.io/badge/Google_Cloud-Run-4285F4?style=for-the-badge&logo=googlecloud&logoColor=white)](https://cloud.google.com/run)
[![Gemini](https://img.shields.io/badge/Gemini-ARIA-8E75B2?style=for-the-badge&logo=google&logoColor=white)](https://ai.google.dev/)

AssetGuard es una plataforma de seguridad industrial para administrar colaboradores, inventario EPP, solicitudes de kiosko, trazabilidad de dotaciones y analítica asistida por IA. El objetivo no es solo registrar entregas: es convertir la operación de EPP en un sistema confiable, auditable y listo para datos reales de planta.

## Producción

- Cloud Run: [control-de-epp-659644890317.us-central1.run.app](https://control-de-epp-659644890317.us-central1.run.app)
- CI y deploy desde GitHub Actions
- Firebase y Gemini configurados por variables de entorno y secrets

## Estado Actual

La aplicación ya cuenta con:

- Panel administrativo con autenticación Google y perfiles `users/{uid}` por rol/planta.
- Directorio de personal con importación masiva desde base operativa de planta.
- Inventario EPP con importación masiva desde inventario real, tallas, stock y SKU temporales.
- Portal público para consulta de colaborador por número de nómina.
- Kiosko público para solicitar EPP sin exponer colecciones privadas.
- ARIA, asistente de análisis operacional con Gemini.
- Firebase App Check aplicado para Cloud Firestore y APIs públicas de kiosko.
- Firestore Rules reforzadas con validación de esquemas y control por rol.
- Validaciones server-side para ARIA y PIN del kiosko.
- Transacciones para proteger stock y asignaciones concurrentes.
- CI automático de `lint`, `typecheck` y `build`.
- Deploy automático a Google Cloud Run desde `main`.

## Firebase Apps

La app web usada por producción es:

```text
displayName: control-de-epp
appId: 1:659644890317:web:4089a7a7b1a89b55c17d84
```

Existe una Web App legacy llamada `ai-studio-applet-webapp` dentro del mismo proyecto Firebase. No es la app que despliega Cloud Run actualmente. Si se vuelve a usar, debe registrarse completamente en App Check antes de tocar Cloud Firestore.

## Módulos Principales

| Módulo | Ruta | Propósito |
| --- | --- | --- |
| Dashboard ejecutivo | `/` | KPIs, señales de inventario, solicitudes y actividad reciente. |
| Personal | `/empleados` | Directorio, altas manuales, carga masiva de personal y sincronización de kiosko. |
| Inventario | `/inventario` | Catálogo EPP, carga masiva, stock consolidado y ajuste por artículo o talla. |
| Portal colaborador | `/portal` | Consulta pública de EPP asignado por número de empleado. |
| Kiosko EPP | `/kiosko` | Flujo público para identificación, PIN, catálogo y solicitud de EPP. |
| ARIA | Panel flotante | Análisis del estado operativo con contexto de Firestore. |

## Arquitectura

```text
Usuario admin
  -> Next.js App Router
  -> Firebase Auth
  -> Firestore: employees, ppe_catalog, assignments, kiosk_requests
  -> Cloud Run production

Colaborador / Kiosko
  -> Portal o kiosko publico
  -> Firestore snapshots minimos: kiosk_employees, kiosk_catalog, kiosk_request_status
  -> Sin acceso a datos privados del panel admin

ARIA
  -> API Route /api/chat
  -> Contexto operacional desde Firestore
  -> Gemini con GEMINI_API_KEY solo en servidor
```

### Estructura Relevante

```text
app/
  page.tsx                    Dashboard ejecutivo
  empleados/page.tsx          Personal + importador baseop
  inventario/page.tsx         Inventario + importador EPP
  portal/page.tsx             Portal publico del colaborador
  kiosko/                     Flujo de kiosko EPP
  api/chat/route.ts           API segura para ARIA

components/
  auth-provider.tsx           Auth, admins y guardas de acceso
  ai-chat-panel.tsx           Interfaz ARIA
  kiosk-requests-panel.tsx    Panel de solicitudes del kiosko
  navbar.tsx                  Navegacion admin

lib/
  firebase.ts                 Inicializacion Firebase
  personnel-import.ts         Parser/normalizador de base de personal
  inventory-import.ts         Parser/normalizador de inventario EPP
  kiosk-api.ts                Acceso publico controlado para kiosko
  kiosk-local-store.ts        Respaldo local para pruebas en localhost

firestore.rules               Reglas de seguridad
.github/workflows/ci.yml      Validacion continua de lint + build
.github/workflows/deploy.yml  Deploy Cloud Run + Firestore Rules
Dockerfile                    Build standalone para Cloud Run
```

## Modelo de Datos

### `employees`

Colección administrativa de personal. Requiere usuario autenticado y admin.

Campos principales:

- `id`: número de personal.
- `name`: nombre editado del colaborador.
- `area`: área operativa principal.
- `plantArea`, `personnelArea`, `position`, `jobFunction`: datos para segmentación futura.
- `active`: controla si el colaborador puede operar.
- `source`, `schemaVersion`: trazabilidad de importación.

Nota de privacidad: la carga inicial no escribe RFC, IMSS, CURP ni fecha de nacimiento.

### `kiosk_employees`

Snapshot mínimo de kiosko usado por APIs server-side. El cliente ya no lo consulta directo; portal y kiosko pasan por rutas API para evitar exponer campos sensibles.

Campos principales:

- `name`
- `area`
- `plantArea`
- `position`
- `jobFunction`
- `active`
- `firstLogin`, `termsAccepted`

### `kiosk_employee_secrets`

Colección privada para secretos de autenticación de kiosko.

- `pinHash`
- `pinVersion`
- `lastPinChangeAt`
- `legacyPinMigratedAt`

### `ppe_catalog`

Catálogo administrativo de EPP.

Soporta artículos simples y artículos con tallas:

```ts
{
  sku: string;
  name: string;
  category: string;
  replacementDays: number;
  stock: number;
  hasSizes: boolean;
  sizes?: {
    [size: string]: {
      sku: string;
      material?: string;
      stock: number;
      minStock: number;
      available: boolean;
      location?: string;
      unit?: string;
      unitCost?: number;
      temporarySku?: boolean;
    }
  };
}
```

### `kiosk_catalog`

Snapshot seguro del catálogo para kiosko. Se sincroniza desde el importador y desde ajustes de inventario.

### `assignments`

Historial de dotaciones y reposiciones.

- `employeeId`
- `sku`
- `size`
- `assignedAt`
- `nextReplacementAt`
- `status`
- `replacementReason`
- `issuedByUserId`

### `kiosk_requests`

Solicitudes generadas desde kiosko.

- `employeeId`
- `employeeName`
- `items`
- `status`: `pending`, `approved`, `rejected`
- `source`: `kiosk`

## Importadores de Datos Reales

### Base de Personal

Archivo esperado: TSV/TXT con columnas:

```text
Número de personal
Nombre editado del empleado o candidato
Fecha de alta
División de personal
ID POSICIÓN
Posición
Area de Personal
AREA PLANTA
CECO
Función
Fecha de Nacimiento
RFC
IMSS
CURP
SEXO
```

Comportamiento:

- Valida encabezados, filas, IDs vacíos y duplicados.
- Usa `AREA PLANTA` como área operativa principal.
- Conserva posición, función y área para futura matriz de permisos EPP.
- Omite datos privados sensibles en la carga operativa inicial.
- Escribe `employees` y `kiosk_employees`.

### Inventario EPP

Archivo esperado: TSV/TXT con columnas:

```text
Alma
Material
Texto breve de Material
Talla
Ubicación
Umb
Precio variable
Stock
```

Comportamiento:

- Agrupa filas por producto base.
- Conserva tallas y variantes.
- Suma stock consolidado por artículo.
- Genera SKU temporal estable si falta el código de material.
- Carga stock vacío como `0`.
- Escribe `ppe_catalog` y `kiosk_catalog`.

## Seguridad

La app usa una separación deliberada entre colecciones administrativas y snapshots públicos.

Principios:

- El panel admin requiere Google Auth.
- Los permisos administrativos salen de `users/{uid}` o de un bootstrap temporal controlado por bandera.
- Firestore Rules validan esquemas antes de permitir escritura.
- Las escrituras críticas de inventario pasan por APIs server-side con auditoría.
- `ppe_catalog`, `kiosk_catalog`, `assignments`, `kiosk_requests` y `kiosk_request_status` no aceptan escrituras directas desde cliente.
- `employees` no es público.
- `kiosk_employees` solo es legible por administradores autenticados con alcance de planta.
- `kiosk_employee_secrets` bloquea lecturas/escrituras desde cliente (`allow false`).
- `kiosk_catalog` permite lectura pública controlada.
- ARIA usa `GEMINI_API_KEY` solo en servidor y trabaja con datos agregados cuando consulta empleados/consumos.
- Los importadores no escriben datos privados innecesarios.

En producción `NEXT_PUBLIC_ENABLE_OFFLINE_MODE=false`. El bootstrap admin debe usarse sólo como emergencia temporal.

## Ejecución Local

### Requisitos

- Node.js 20 recomendado.
- npm.
- Acceso al proyecto Firebase configurado.
- `GEMINI_API_KEY` si se desea usar ARIA.

### Instalación

```powershell
npm install
```

### Desarrollo local

```powershell
npm run local
```

Abre:

```text
http://127.0.0.1:3000
```

Rutas útiles:

```text
http://127.0.0.1:3000/portal
http://127.0.0.1:3000/kiosko
http://127.0.0.1:3000/empleados
http://127.0.0.1:3000/inventario
```

También existe `INICIAR_APP_LOCAL.bat` para levantar la app en Windows.

### Build local

```powershell
npm run build
```

### Producción local

```powershell
npm run build
npm run local:start
```

## Variables de Entorno

Copia `.env.example` a `.env.local`.

Variables principales:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_DATABASE_ID=(default)
NEXT_PUBLIC_ENABLE_OFFLINE_MODE=false
ENABLE_BOOTSTRAP_ADMIN=false
NEXT_PUBLIC_ENABLE_BOOTSTRAP_ADMIN=false
BOOTSTRAP_ADMIN_EMAIL=
NEXT_PUBLIC_BOOTSTRAP_ADMIN_EMAIL=
NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY=
FIREBASE_APP_CHECK_REQUIRED=false
GEMINI_API_KEY=
```

En Cloud Run estas variables se configuran desde GitHub Actions con GitHub Variables y Secrets.

La configuración real de Firebase no se versiona en el repositorio. Toda la inicialización sale de `.env.local`, GitHub Variables o las variables del entorno de Cloud Run.

## Deploy

El deploy se ejecuta automáticamente al hacer push o merge a `main`.

Workflow:

```text
.github/workflows/deploy.yml
```

Flujo:

1. Checkout del repo.
2. Autenticación con Workload Identity Federation/OIDC.
3. Setup de Google Cloud SDK.
4. Deploy a Cloud Run con `gcloud run deploy --source .`.
5. Inyección de variables públicas Firebase.
6. Montaje de `GEMINI_API_KEY` desde Secret Manager.
7. Deploy de `firestore.rules` con la misma identidad OIDC.

Secrets requeridos:

```text
GCP_WORKLOAD_IDENTITY_PROVIDER
GCP_SERVICE_ACCOUNT
```

GitHub Variables requeridas:

```text
GCP_PROJECT_ID
GCP_REGION
CLOUD_RUN_SERVICE
FIREBASE_API_KEY
FIREBASE_AUTH_DOMAIN
FIREBASE_PROJECT_ID
FIREBASE_STORAGE_BUCKET
FIREBASE_MESSAGING_SENDER_ID
FIREBASE_APP_ID
FIREBASE_DATABASE_ID
ENABLE_BOOTSTRAP_ADMIN
BOOTSTRAP_ADMIN_EMAIL
NEXT_PUBLIC_ENABLE_OFFLINE_MODE
FIREBASE_APPCHECK_SITE_KEY
FIREBASE_APP_CHECK_REQUIRED
```

En producción `FIREBASE_APP_CHECK_REQUIRED=true` y Cloud Firestore debe permanecer en estado App Check `Aplicada`.

## Operación Recomendada Después de Deploy

1. Crear o verificar el perfil admin en `users/{uid}`.
2. Ir a `/empleados`.
3. Cargar la base de personal.
4. Revisar preview: registros, duplicados, errores y áreas detectadas.
5. Confirmar carga.
6. Ir a `/inventario`.
7. Cargar inventario EPP.
8. Revisar preview: artículos, variantes, stock total y SKU temporales.
9. Confirmar carga.
10. Probar `/portal` con un número real de empleado.
11. Probar `/kiosko` con el mismo colaborador.

## Kiosko y Modo Local

En `localhost`, el kiosko tiene respaldo en `localStorage` para pruebas.

Esto permite probar:

- login local de colaborador,
- catálogo demo,
- solicitudes locales,
- flujo de PIN y términos.

En producción, si un colaborador no existe en `kiosk_employees` o está inactivo, el kiosko no lo autoriza.

## ARIA

ARIA es el asistente de análisis operacional.

Puede consultar contexto de:

- inventario,
- empleados,
- asignaciones,
- alertas,
- solicitudes.

La API de Gemini nunca se expone al navegador. Las llamadas pasan por:

```text
app/api/chat/route.ts
```

## Calidad y Validación

Comandos recomendados antes de abrir PR:

```powershell
npm run build
git diff --check
```

Para reglas de Firestore:

```powershell
npx firebase-tools emulators:exec --only firestore "node -e \"console.log('rules ok')\""
```

## Roadmap

Próximas fases naturales:

- Matriz de autorización EPP por área, puesto, función y tipo de colaborador.
- Bloqueo de EPP no autorizado en kiosko.
- Flujo de aprobación por supervisor para EPP crítico.
- Inventario real nivel planta con movimientos, auditoría y entradas/salidas.
- Reportes ejecutivos por área, consumo y riesgo.
- Exportación de históricos para auditoría.
- Integración de alertas por correo o Teams.
- Modo offline más robusto para kioskos físicos.

## Autor

José Luis Cruz Prieto

GitHub: [Joseluiscruz-hub](https://github.com/Joseluiscruz-hub)

## Licencia

Proyecto privado. Uso interno sujeto a autorización del propietario del repositorio.
