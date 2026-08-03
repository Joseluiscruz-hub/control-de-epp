# Sesion segura del kiosko

## Flujo

1. El colaborador se identifica y envia su PIN a `POST /api/kiosk/pin/verify` con App Check.
2. El servidor valida el PIN, el bloqueo progresivo, el estado del colaborador y su planta.
3. El servidor crea `kiosk_sessions/{sessionId}` y devuelve dos cookies `HttpOnly`, `SameSite=Strict` y `Secure` en produccion.
4. Las cookies duran cinco minutos y solo se envian a `/api/kiosk`.
5. Cada endpoint protegido valida firma, expiracion, revocacion, dispositivo, proposito, colaborador activo, planta y version de credenciales.
6. El logout y el timeout revocan el documento y eliminan las cookies.

El navegador puede conservar datos de presentacion en `sessionStorage`, pero el servidor nunca los usa como prueba de identidad. Empleado, nombre y planta se derivan de la sesion validada.

## Activacion inicial

El reset administrativo genera un codigo criptograficamente aleatorio de ocho digitos, guarda solo su hash bcrypt y lo muestra una vez. El codigo expira en treinta minutos. La activacion consume el codigo, guarda el hash del PIN y crea la auditoria dentro de una sola transaccion.

Un reset incrementa `credentialVersion`; por ello todas las sesiones anteriores quedan invalidas inmediatamente. El mismo flujo libera el bloqueo administrativo de PIN del colaborador.

## Datos y controles

`kiosk_sessions/{sessionId}` contiene identidad, planta, hash de dispositivo, proposito, version de credenciales, emision, expiracion, actividad y revocacion. Firestore Rules niega toda lectura y escritura del cliente sobre sesiones, activaciones, secretos y rate limits.

Configurar `KIOSK_SESSION_SECRET` con al menos 32 caracteres aleatorios, diferente en dev, staging y produccion. No debe llevar prefijo `NEXT_PUBLIC_`.

## Casos adversariales cubiertos

- token ausente o modificado;
- sesion expirada o revocada;
- proposito distinto de `ppe-kiosk`;
- cookie copiada a otro dispositivo;
- cambio de planta o version de credenciales;
- cuerpo que intenta cambiar de empleado;
- consulta de un folio perteneciente a otro empleado o planta;
- fuerza bruta progresiva: 5 minutos, 30 minutos y desbloqueo administrativo.
