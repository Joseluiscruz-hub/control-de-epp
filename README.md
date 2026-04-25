<div align="center">

# 🦺 Control de EPP
### Sistema Inteligente de Gestión de Equipo de Protección Personal

[![Next.js](https://img.shields.io/badge/Next.js_15-black?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org/)
[![Firebase](https://img.shields.io/badge/Firebase-039BE5?style=for-the-badge&logo=Firebase&logoColor=white)](https://firebase.google.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Gemini AI](https://img.shields.io/badge/Gemini_2.5-8E75B2?style=for-the-badge&logo=google&logoColor=white)](https://aistudio.google.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)

> Sistema empresarial de trazabilidad y control de EPP con análisis predictivo impulsado por inteligencia artificial.

[Ver Demo](#) · [Reportar Bug](https://github.com/Joseluiscruz-hub/control-de-epp/issues) · [Solicitar Feature](https://github.com/Joseluiscruz-hub/control-de-epp/issues)

</div>

---

## 📋 Tabla de Contenidos

- [Descripción](#-descripción)
- [Características](#-características)
- [Stack Tecnológico](#-stack-tecnológico)
- [Arquitectura](#-arquitectura)
- [Modelo de Datos](#-modelo-de-datos)
- [Instalación](#-instalación)
- [Configuración](#-configuración)
- [Uso](#-uso)
- [Seguridad](#-seguridad)
- [Roadmap](#-roadmap)

---

## 📖 Descripción

**Control de EPP** es una plataforma web de nivel empresarial diseñada para la gestión integral del Equipo de Protección Personal en entornos industriales. Permite registrar entregas, controlar inventarios, gestionar el directorio de empleados y recibir análisis predictivos en tiempo real a través de **ARIA**, un asistente virtual especializado en seguridad industrial impulsado por Google Gemini 2.5.

El sistema cumple con los estándares de la **STPS (Secretaría del Trabajo y Previsión Social)** y las normas **NOM** aplicables al manejo de EPP en México.

---

## ✨ Características

### 🖥️ Dashboard Operativo
- KPIs en tiempo real: entregas del día, empleados activos, alertas de reposición
- Feed en vivo de las últimas asignaciones de EPP
- Alertas proactivas de equipos próximos a vencer
- Panel de estado del sistema con indicador de conectividad Firebase

### 👷 Gestión de Empleados
- Alta y baja de personal con validación de datos
- Directorio filtrable por área, nombre o ID
- Desactivación/reactivación de empleados sin borrar historial
- Vista completa del historial de EPP por empleado con fechas de entrega y vencimiento

### 📦 Control de Inventario
- Catálogo de EPP con SKU, categoría y días de vida útil
- Gestión de stock: entradas, salidas y ajuste directo
- Alertas automáticas de stock bajo (≤20 unidades) y sin existencias
- Banner de advertencia visible con artículos críticos

### 🤖 Chatbot ARIA (IA Predictiva)
- Panel flotante disponible en toda la aplicación
- Análisis en tiempo real con datos de Firestore (patrón RAG)
- Detección de anomalías de consumo por empleado o área
- Predicción de desabasto con base en ritmo histórico
- Recomendaciones de órdenes de compra
- Respuestas sobre normativa NOM/STPS
- Prompts rápidos preconfigurados

### 🔐 Seguridad
- Autenticación obligatoria con Google OAuth
- Reglas de Firestore Zero-Trust (validación de esquema en BD)
- API Key de Gemini exclusivamente en servidor (nunca expuesta al cliente)
- Integridad referencial en asignaciones (empleado y SKU deben existir)

---

## 🛠️ Stack Tecnológico

| Capa | Tecnología |
|------|-----------|
| Framework | Next.js 15 (App Router) |
| Lenguaje | TypeScript 5 |
| Estilos | Tailwind CSS 4 + base-ui/react |
| Base de datos | Firebase Firestore |
| Autenticación | Firebase Auth (Google OAuth) |
| IA / LLM | Google Gemini 2.5 Flash (`@google/genai`) |
| Fechas | date-fns |
| Iconos | lucide-react |
| Notificaciones | sonner |
| Render Markdown | react-markdown |

---

## 🏗️ Arquitectura

```
control-de-epp/
├── app/
│   ├── api/
│   │   └── chat/
│   │       └── route.ts          # API Route segura — ARIA (Gemini)
│   ├── empleados/
│   │   └── page.tsx              # CRUD de empleados + historial EPP
│   ├── inventario/
│   │   └── page.tsx              # Catálogo EPP + gestión de stock
│   ├── layout.tsx                # Layout global con Auth + ARIA
│   ├── page.tsx                  # Dashboard principal
│   └── globals.css
├── components/
│   ├── ui/                       # Componentes base (base-ui/react)
│   ├── ai-chat-panel.tsx         # Panel flotante del chatbot ARIA
│   ├── assign-ppe-dialog.tsx     # Formulario de registro de entregas
│   ├── auth-provider.tsx         # Contexto de autenticación + AuthGuard
│   └── navbar.tsx                # Navegación con indicador de ruta activa
├── lib/
│   ├── firebase.ts               # Inicialización Firebase
│   └── firestore-error.ts        # Manejo de errores Firestore
├── firestore.rules               # Reglas de seguridad Zero-Trust
└── .env.example                  # Plantilla de variables de entorno
```

### Patrón RAG del Chatbot

```
Usuario pregunta
      ↓
Cliente Next.js
      ↓
POST /api/chat (servidor)
      ↓
Fetch Firestore → inventario + empleados + últimas 50 asignaciones
      ↓
Contexto JSON inyectado al prompt de sistema de Gemini
      ↓
Gemini 2.5 Flash analiza y genera respuesta
      ↓
Respuesta en markdown → renderizada en el panel ARIA
```

---

## 💾 Modelo de Datos

### `employees`
```typescript
{
  id: string;           // Número de empleado (ej. "1881")
  name: string;         // Nombre completo
  area: string;         // Área de trabajo (ej. "Soldadura")
  active: boolean;      // Estado en planta
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### `ppe_catalog`
```typescript
{
  sku: string;              // Código único (ej. "G-01")
  name: string;             // Descripción del artículo
  category: string;         // Categoría (ej. "Guantes")
  replacementDays: number;  // Días de vida útil esperada
  stock: number;            // Unidades disponibles
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### `assignments`
```typescript
{
  employeeId: string;         // Referencia a employees
  sku: string;                // Referencia a ppe_catalog
  assignedAt: Timestamp;      // Fecha real de entrega
  nextReplacementAt: Timestamp; // assignedAt + replacementDays
  status: "active" | "replaced";
  issuedByUserId: string;     // UID del almacenista que entregó
}
```

---

## 🚀 Instalación

### Prerequisitos
- Node.js 18+
- Cuenta de Firebase con proyecto activo
- API Key de Google Gemini ([obtener gratis](https://aistudio.google.com/app/apikey))

### Clonar e instalar
```bash
git clone https://github.com/Joseluiscruz-hub/control-de-epp.git
cd control-de-epp
npm install
```

---

## ⚙️ Configuración

1. **Copia el archivo de variables de entorno:**
```bash
cp .env.example .env.local
```

2. **Rellena `.env.local` con tus credenciales:**
```env
GEMINI_API_KEY=AIzaSy...TuKeyDeGemini
```

> La configuración de Firebase ya está incluida en `firebase-applet-config.json`. Si usas tu propio proyecto de Firebase, actualiza ese archivo con tus credenciales.

3. **Agrega `localhost` a los dominios autorizados de Firebase Auth:**
   - Ve a [Firebase Console → Authentication → Settings → Authorized domains](https://console.firebase.google.com/)
   - Agrega `localhost`

4. **Despliega las reglas de Firestore:**
```bash
npm install -g firebase-tools
firebase login
firebase deploy --only firestore:rules
```

5. **Inicia el servidor de desarrollo:**
```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000) en tu navegador.

---

## 📱 Uso

| Módulo | Ruta | Descripción |
|--------|------|-------------|
| Dashboard | `/` | Vista general + feed en tiempo real |
| Empleados | `/empleados` | Alta/baja de personal + historial EPP |
| Inventario | `/inventario` | Catálogo + ajuste de stock |
| ARIA | Botón flotante | Chatbot IA predictivo |

### Registrar una entrega
1. Dashboard → **"Registrar Nueva Entrega"**
2. Selecciona empleado y equipo (SKU)
3. Confirma — el registro queda en Firestore en tiempo real

### Consultar a ARIA
Haz clic en el botón **ARIA** (esquina inferior derecha) y pregunta en lenguaje natural:
- *"¿Qué EPP se agota esta semana?"*
- *"¿Cuál área consume más guantes en el último mes?"*
- *"Genera una orden de compra sugerida para los próximos 30 días"*
- *"¿Hay empleados con consumo anómalo de equipo?"*

---

## 🔒 Seguridad

Las reglas de Firestore implementan un modelo **Zero-Trust**:

- ✅ Solo usuarios autenticados con Google pueden leer/escribir
- ✅ Validación de esquema: rechaza documentos con campos incorrectos
- ✅ Integridad referencial: no se puede asignar EPP a un empleado o SKU inexistente
- ✅ Inmutabilidad: una vez creada una asignación, no se puede cambiar a quién pertenece
- ✅ La `GEMINI_API_KEY` nunca sale del servidor (Route Handler de Next.js)

---

## 🔮 Roadmap

- [ ] **Fase 2 — Cloud Functions**
  - Trigger: descuento automático de stock al registrar una asignación
  - Cron Job: alertas diarias a las 6:00 AM para EPP por vencer
  - Notificaciones por email / webhook a Slack o Teams

- [ ] **Fase 3 — PWA Offline-First**
  - Service Worker con `@serwist/next`
  - Persistencia local con IndexedDB (Firestore offline mode)
  - Sincronización automática al recuperar conexión

- [ ] **Fase 4 — Predicción con ML (Python)**
  - Microservicio en Cloud Run
  - Agrupación de consumo por área y tipo de EPP
  - Forecast de demanda y detección de anomalías avanzada

---

## 👨‍💻 Autor

**José Luis Cruz Prieto**
- GitHub: [@Joseluiscruz-hub](https://github.com/Joseluiscruz-hub)

---

<div align="center">

Construido con ❤️ para la seguridad industrial · México 🇲🇽

</div>
