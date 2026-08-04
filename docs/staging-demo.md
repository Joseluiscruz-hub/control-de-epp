# Datos de demostración para staging

El sembrado de staging crea únicamente información ficticia y se niega a operar si:

- el ID del proyecto no contiene `staging` o `demo`;
- la base no es `(default)`;
- la confirmación no coincide exactamente con el proyecto.

El comando es idempotente y no modifica ni elimina documentos existentes. La primera ejecución debe hacerse como simulación:

```bash
npm run seed:staging:demo -- \
  --project=assetguard-staging-jlc \
  --database='(default)' \
  --confirm=assetguard-staging-jlc
```

Después de revisar el resumen, se aplica agregando `--apply`:

```bash
npm run seed:staging:demo -- \
  --project=assetguard-staging-jlc \
  --database='(default)' \
  --confirm=assetguard-staging-jlc \
  --apply
```

La ejecución utiliza Application Default Credentials. En Cloud Shell, si no hay credenciales disponibles, se preparan con:

```bash
gcloud auth application-default login
gcloud auth application-default set-quota-project assetguard-staging-jlc
```

El conjunto incluye colaboradores ficticios, catálogo privado y público, inventario, movimientos, una asignación activa, una solicitud pendiente y metas presupuestales. Los colaboradores inician sin PIN; el código de activación se genera cuando un administrador ejecuta el restablecimiento de credenciales desde la aplicación.

Los documentos públicos de `kiosk_catalog` no contienen costo, ubicación, material SAP ni stock exacto.
