# Uso local

Esta app puede ejecutarse como herramienta local en Windows.

## Arranque rapido

1. Libera al menos 2 GB de espacio en el disco C:.
2. Da doble clic en `INICIAR_APP_LOCAL.bat`.
3. Abre `http://localhost:3000` si el navegador no se abre solo.

La primera ejecucion instala `node_modules`. Las siguientes ejecuciones solo levantan el servidor local.

## Rutas principales

- Administracion: `http://localhost:3000`
- Portal del colaborador: `http://localhost:3000/portal`
- Kiosko para solicitar EPP: `http://localhost:3000/kiosko`

## Modo local del kiosko

El kiosko tiene respaldo local en este navegador. Si Firebase falla por permisos, conexion o falta de datos, usa datos guardados en `localStorage` para que puedas seguir probando.

- Empleado demo: `1881`
- Tambien puedes escribir otro numero de empleado en `localhost`; se crea como colaborador local.
- El catalogo local incluye casco, guantes, lentes y botas con tallas.
- Las solicitudes locales aparecen en el panel de solicitudes cuando abras la app en el mismo navegador.

## Comandos manuales

```powershell
npm install
npm run local
```

## Importante

La interfaz corre en tu PC en `localhost`. Los datos y el inicio de sesion siguen usando Firebase, y el chat ARIA usa Gemini si defines `GEMINI_API_KEY` en `.env.local`.

La configuracion de Firebase se toma exclusivamente de variables `NEXT_PUBLIC_FIREBASE_*`. Usa `.env.example` como plantilla para crear `.env.local`.

Para un modo 100% local de datos se necesita configurar Firebase Emulator Suite y ajustar la app para conectarse a los emuladores.

## Reglas de Firebase

Si usas el Firebase real del proyecto, despliega `firestore.rules` cuando cambien permisos del kiosko:

```powershell
npx firebase deploy --only firestore:rules
```
