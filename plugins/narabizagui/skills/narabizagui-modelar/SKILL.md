---
name: narabizagui-modelar
description: Crear o modificar procesos BPMN y modelos ER mediante el MCP de NaraBizagui, con planificación proporcional, preservación de IDs y controles incrementales. Aplica a cambios solicitados, no a una revisión sin edición.
---

# Modelar con NaraBizagui

Lee [el contrato común](../../shared/workflow.md) y, para operaciones o propiedades, [modelado](../../shared/modeling.md). Opera la pestaña vinculada por MCP. El navegador sirve para vinculación autorizada y evaluación visual; una capacidad faltante no autoriza editar el proceso por interfaz o JavaScript.

Antes de un montaje o reorganización amplia, prepara un plan en el proyecto del usuario: fuentes vigentes y discrepancias resueltas, claves de actividades, responsables, etapas, decisiones y conexiones. Usa los requisitos ya establecidos. Los carriles representan responsables internos; participantes separados, procesos independientes. Las etapas ordenan la presentación y no crean esperas de negocio.

Escala ese plan al modo de interacción definido en la skill coordinadora. Para una prueba visual genérica en voz basta un esquema corto con supuestos provisionales visibles; no bloquees el primer borrador por nombres pendientes ni crees archivos locales del proceso sin que sean necesarios o solicitados. En texto exploratorio, resuelve el diseño con el usuario antes de ejecutar y entrega el conjunto consolidado. La solicitud explícita de ejecución autónoma elimina consultas de rutina dentro del alcance autorizado, sin autorizar reglas de negocio nuevas.

Para una matriz de responsables por etapas usa `matrix` con carriles y columnas nativos y figuras referenciadas por claves. Los índices de carril y etapa empiezan en uno. La matriz y sus conexiones se prevalidan y se aplican como un solo cambio reversible. `clear` limpia únicamente la hoja activa; conserva las demás hojas. Usa un identificador de solicitud estable al aplicar el bloque. `fit` encaja y `view` amplía/restaura el lienzo por MCP sin modificar el BPMN.

Comprueba las capacidades que requiere el plan en `read.capabilities`, `serverVersion`, `editorVersion` y `editorBuild`. Para una capacidad nueva o dudosa, prueba el patrón con datos genéricos antes de construir todo el proceso. Una actualización necesita conservar los cambios y volver a comprobar la sesión; no recargues una pestaña con cambios sin conservar.

Para un proceso grande, monta primero un tramo representativo y verifica reglas, devolución y enlace. Dimensiona carriles/columnas, reserva espacio para etiquetas y recorridos y después extiende el patrón. No reconstruyas figuras o conexiones para corregir geometría: conserva IDs, extremos, documentación y asociaciones.

`narabizagui_edit_batch` agrupa hasta el límite declarado en capacidades. Usa alias para figuras nuevas y conexiones, `dryRun:true` para comprobar un bloque importante y un UUID de solicitud para aplicarlo. Deshacer afecta el bloque completo. Construye el proceso completo en un paquete cuando el alcance esté definido: matriz opcional, actividades, decisiones, eventos, bucles, subprocesos expandidos, conexiones, condiciones y documentación. Hojas y ER conservan operaciones individuales; no los introduzcas en bloques que no los soportan. Mantén las llamadas mutantes secuenciales y utiliza la revisión confirmada.

Para un cambio sencillo sigue el recorrido de tres pasos de la coordinadora. Pide `response:"summary"`, combina `presentation.expandedCanvas` y `fit` en el bloque y utiliza su validación nativa confirmada. No hagas un `dryRun` separado por rutina: el bloque ya prevalida antes de aplicar. Usa el ensayo explícito para propuestas que el usuario quiera revisar sin ejecutar o para incertidumbre técnica relevante. `response:"full"` queda para corregir geometría o inspeccionar un rechazo que requiera figuras completas. No exportes y captures dos imágenes del mismo resultado sin una finalidad distinta.

Para evitar operaciones repetidas, el [script compartido](../../shared/snapshot-cli.mjs) permite `plan snapshot.json operations.json`; elimina cambios comprobablemente idénticos y conserva el orden. No omitas operaciones basándote en un estado anterior a movimientos con efectos sobre rutas.

Usa `properties` para la configuración semántica; `label` cambia el texto visible. Los enlaces necesitan nombre interno y contraparte del mismo ámbito. Las etiquetas Sí/No no equivalen a condiciones formales. Consulta `read` con `includePropertyFields:true` y `elementIds` cuando necesites las opciones de un elemento.

Valida cada bloque significativo antes de acumular más detalle. Atiende incidencias relacionadas con el cambio, revisa límites reales de etiquetas después de aplicar y comprueba visualmente el PNG cuando corresponda. Conserva puntos de recuperación en el proyecto en cambios estructurales, actualizaciones de versión y entrega, sin pedir autorización de nuevo para acciones ya autorizadas. No incorpores cifras, reglas o fuentes no confirmadas.

Para correcciones de texto, tamaño, rutas, documentos y notas, sigue [edición visual y calidad](../../shared/visual-editing.md). Preserva las correcciones manuales y usa un bloque compatible por conjunto afectado.

## Proyectos en paralelo

Cada pestaña conserva su documento y cuenta. Usa una vinculación distinta por proyecto; identifica `sessionId`, archivo y `documentId` al leer. Envía `expectedDocumentId` junto con `expectedRevision` al editar/guardar. Si se omite, el puente utiliza el documento de la última lectura confirmada; no sustituye el destino por el de una pestaña nueva. Ante `DOCUMENT_MISMATCH` vuelve a identificar el documento y conserva el trabajo. Un archivo abierto en consulta por otra pestaña rechaza ediciones con `FILE_READ_ONLY`; pide transferir su edición mediante **Editar aquí**, sin forzarla ni desconectar la sesión original.
