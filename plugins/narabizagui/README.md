# NaraBizagui by NaraLab — plugin local

0.3.2 incorpora carriles nativos (`lane_add`, `lane_split`), traslado conjunto de figuras (`move_elements`), eventos intermedios de enlace (`create` con `linkName`), recorridos (`route`), posición de etiquetas (`label.bounds`) y apertura protegida de BPMN en una pestaña vacía (`open_bpmn`). Cargar la web actualizada. Los enlaces deben tener una salida y una entrada con igual nombre dentro del mismo proceso; no sustituyen mensajes entre participantes independientes.

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
| `narabizagui_read` | Revisión, hojas, elementos de la hoja activa, selección, guardado y XML completo opcional. |
| `narabizagui_edit` | Una operación nativa con revisión obligatoria y deshacer; incluye crear, renombrar, abrir y vincular hojas. |
| `narabizagui_save` | Guardado en el archivo autorizado, historial y comprobación. |
| `narabizagui_export_png` | Hoja activa completa para el chat y archivo PNG temporal para Word/PDF. |
| `narabizagui_disconnect` | Revocar una pestaña sin perder su trabajo. |

El puente escucha únicamente en `127.0.0.1`, en un puerto asignado al arrancar. Solo acepta el origen de la web publicada, exige un código aleatorio de un solo uso y autentica cada sesión. No permite ejecución de JavaScript arbitrario ni acceso general al disco. Los comandos que no reciben confirmación no se repiten automáticamente.

El puente es local; los datos consultados mediante MCP se entregan a la conversación del asistente. La web no publica los BPMN en GitHub. El historial de archivos locales está en el navegador, no en el market. Los documentos abiertos con **Conectar Microsoft** se guardan mediante la autorización de esa cuenta y no se conservan en el Historial local. La conexión Microsoft y el vínculo con Codex son independientes. El puente por sí solo no habilita uso móvil ni control de otros equipos.

Un archivo puede tener procesos independientes y detalles de subprocesos en planos BPMN nativos. `sheet_link` usa una actividad de llamada para reutilizar otra hoja y protege subprocesos que ya tienen contenido. La navegación cambia la revisión; guardar conserva todas las hojas.

La versión 0.4.0 añade hojas ER con tablas, campos, PK/FK, nulabilidad y relaciones por campo con cardinalidad. Se conservan dentro del mismo BPMN mediante una extensión Nara versionada, sin convertir tablas en tareas. `read` identifica `diagramType` y devuelve `dataModel` en ER. `edit` incorpora `erd_sheet_create`, `erd_table_create/update`, `erd_field_upsert/delete`, `erd_relationship_create/update` y `erd_delete`, además de `lane_add`, `lane_split`, etapas relativas y `view` para ampliar/restaurar el lienzo.

El MCP opera con revisión y deshacer en ambos modelos. Las tablas ER usan x/y de esquina superior izquierda, mientras `create` BPMN usa centro. El alto de tabla se deriva de sus campos. Eliminar un campo o tabla elimina sus relaciones; crear una relación marca FK en el campo de destino. No se ejecuta SQL ni se modifican bases de datos.

El PNG tiene fondo blanco y escala ajustable (2 por defecto); se limita a 8192 píxeles por lado, 16 megapíxeles y 8 MB. Incluye toda la hoja activa, sin barras ni paneles del editor. El MCP devuelve un bloque de imagen para que el asistente pueda verlo y un `filePath` con hash, revisión, `sheetId` y `sheetName`. Ese archivo se crea en la carpeta temporal del sistema bajo `NaraBizagui/exports`, con nombre único; el chat puede copiarlo a la ubicación del informe. Exportar PNG no guarda el BPMN ni acredita validación del proceso.

## Construcción

Desde la raíz del repositorio: `npm ci`, `npm run build`, `npm test`. El paquete instalable es esta carpeta completa; no incluir `node_modules`, `local/`, fuentes de clientes ni códigos de vinculación. Las licencias del servidor se conservan en `server/dist/THIRD_PARTY_NOTICES.txt`.

La edición manual de tablas se realiza por celdas en el lienzo (Enter aplica, Escape cancela, Tab avanza). El panel derecho ofrece formato y posición/tamaño. `style` aplica colores, grosor y texto; `erd_field_move` reordena campos por ID; `stage_split` divide una etapa en dos o tres columnas. La nulabilidad se conserva y es editable mediante `erd_field_upsert`. Las nuevas hojas empiezan vacías.
