# NaraBizagui by NaraLab — plugin local

Incluye la skill `narabizagui`, el servidor MCP y su puente al editor en una instalación. No necesita `npm install` después de instalarlo: el servidor distribuido incluye sus bibliotecas y atribuciones.

## Requisitos e instalación

- Codex/host de escritorio con plugins y ejecución local.
- Node.js **22 o superior** disponible como `node` en el entorno del host. El runtime no está incluido; se requiere una vez por equipo.
- Edge/Chrome de escritorio con acceso local permitido para la web del editor. Otros navegadores deben verificarse antes de declararlos compatibles.

En Plugins selecciona **Nara IA Market → NaraBizagui by NaraLab → Instalar**. La skill y el MCP se instalan juntos. También puede instalarse con el CLI que soporte `codex plugin add narabizagui@nara-ia-market`.

En un chat con el plugin activo pide conectar NaraBizagui. En la pestaña del BPMN pulsa **Conectar con Codex**, pega el código temporal y pulsa **Vincular esta pestaña**. Autoriza el acceso local si el navegador lo solicita. El código vence en cinco minutos y solo se usa una vez. Cerrar el host o reiniciar el MCP requiere volver a vincular. No se inicia un servicio permanente del sistema.

## Herramientas

| Herramienta | Función |
| --- | --- |
| `narabizagui_connect` | Código y enlace de vinculación. |
| `narabizagui_sessions` | Pestañas vinculadas a esta instancia. |
| `narabizagui_read` | Revisión, elementos, selección, guardado y XML opcional. |
| `narabizagui_edit` | Una operación nativa con revisión obligatoria y deshacer. |
| `narabizagui_save` | Guardado en el archivo autorizado, historial y comprobación. |
| `narabizagui_export_png` | Imagen completa para el chat y archivo PNG temporal para Word/PDF. |
| `narabizagui_disconnect` | Revocar una pestaña sin perder su trabajo. |

El puente escucha únicamente en `127.0.0.1`, en un puerto asignado al arrancar. Solo acepta el origen de la web publicada, exige un código aleatorio de un solo uso y autentica cada sesión. No permite ejecución de JavaScript arbitrario ni acceso general al disco. Los comandos que no reciben confirmación no se repiten automáticamente.

El puente es local; los datos consultados mediante MCP se entregan a la conversación del asistente. La web no publica los BPMN en GitHub. El historial está en el navegador, no en el market. El uso desde móviles, el control de otros equipos y Microsoft Graph requieren integraciones distintas.

El PNG tiene fondo blanco y escala ajustable (2 por defecto); se limita a 8192 píxeles por lado, 16 megapíxeles y 8 MB. Incluye todo el diagrama, sin barras ni paneles del editor. El MCP devuelve un bloque de imagen para que el asistente pueda verlo y un `filePath` con hash y revisión. Ese archivo se crea en la carpeta temporal del sistema bajo `NaraBizagui/exports`, con nombre único; el chat puede copiarlo a la ubicación del informe. Exportar PNG no guarda el BPMN ni acredita validación del proceso.

## Construcción

Desde la raíz del repositorio: `npm ci`, `npm run build`, `npm test`. El paquete instalable es esta carpeta completa; no incluir `node_modules`, `local/`, fuentes de clientes ni códigos de vinculación. Las licencias del servidor se conservan en `server/dist/THIRD_PARTY_NOTICES.txt`.
