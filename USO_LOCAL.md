# Uso local

Esta app puede ejecutarse como herramienta local en Windows.

## Arranque rapido

1. Libera al menos 2 GB de espacio en el disco C:.
2. Da doble clic en `INICIAR_APP_LOCAL.bat`.
3. Abre `http://localhost:3000` si el navegador no se abre solo.

La primera ejecucion instala `node_modules` y prepara la version instalable si todavia no existe. Las siguientes ejecuciones solo levantan el servidor local.

## Rutas principales

- Administracion: `http://localhost:3000`
- Portal del colaborador: `http://localhost:3000/portal`
- Kiosko para solicitar EPP: `http://localhost:3000/kiosko`

## Modo local del kiosko

La app tiene respaldo local en este navegador. Si Firebase, la API o internet fallan por permisos, conexion o falta de datos, usa datos guardados en `localStorage` para que puedas seguir trabajando.

- Empleado demo: `1881`
- Tambien puedes escribir otro numero de empleado en `localhost`; se crea como colaborador local.
- El catalogo local incluye casco, guantes, lentes y botas con tallas.
- Las solicitudes locales aparecen en el panel de solicitudes cuando abras la app en el mismo navegador.
- El panel administrativo tiene boton **Entrar en modo offline** para abrir Dashboard, Empleados e Inventario sin Google ni Firebase.
- Las altas, importaciones, ajustes de stock, asignaciones e historial se guardan localmente cuando no hay servidor disponible.

## Instalar como app

1. Abre `http://localhost:3000` o `http://127.0.0.1:3000`.
2. En Chrome o Edge, usa el icono de instalar de la barra de direcciones o el menu `... > Instalar AssetGuard EPP`.
3. Entra una vez con internet para que el navegador guarde la app y sus recursos.
4. Despues puedes abrirla desde el acceso instalado incluso sin internet.

## Comandos manuales

```powershell
npm install
npm run build
npm run local:start
```

## Importante

La interfaz corre en tu PC en `localhost`. Con internet puede usar Firebase y ARIA/Gemini si defines `GEMINI_API_KEY` en `.env.local`; sin internet usa el respaldo local del navegador.

La configuracion de Firebase se toma exclusivamente de variables `NEXT_PUBLIC_FIREBASE_*`. Usa `.env.example` como plantilla para crear `.env.local`.

## Reglas de Firebase

Si usas el Firebase real del proyecto, despliega `firestore.rules` cuando cambien permisos del kiosko:

```powershell
npx firebase deploy --only firestore:rules
```
