# Mi Negocio — administrador personal

App web instalable (teléfono y laptop) para ingresos, gastos, nóminas, clientes, pendientes y notas de entrega.
Los datos se guardan en el navegador y se sincronizan en `datos.json` dentro de un repositorio **privado** de GitHub.

## Puesta en marcha (una sola vez)

1. **Repositorio de la app (público)**: en github.com crea un repo llamado `admin-mulato` y sube estos archivos.
   Luego ve a *Settings → Pages → Source: Deploy from a branch → main / (root)*. La app quedará en
   `https://TU-USUARIO.github.io/admin-mulato/`. El código no contiene datos ni claves.
2. **Repositorio de datos (privado)**: crea otro repo **Private** llamado `admin-datos` (marca "Add a README" para que no quede vacío).
3. **Token**: *Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token*.
   - Repository access: *Only select repositories* → `admin-datos`.
   - Permissions → Repository → **Contents: Read and write**.
   - Expiración: la que prefieras (cuando venza, crea otro y pégalo en Ajustes).
4. Abre la app → **Ajustes → Sincronización con GitHub**: tu usuario, `admin-datos` y el token. Repite en cada dispositivo.

## Instalar en el teléfono
- Android (Chrome): menú ⋮ → *Agregar a pantalla principal*.
- iPhone (Safari): botón Compartir → *Agregar a inicio*.

## Notas
- Funciona sin conexión; los cambios se suben al volver internet.
- El token queda guardado solo en ese dispositivo. No lo compartas.
- "Descargar respaldo" en Ajustes genera un JSON con todo; "Exportar movimientos" un CSV para Excel.
- Para probar en la PC: `python -m http.server 8765` dentro de esta carpeta y abre http://localhost:8765.
