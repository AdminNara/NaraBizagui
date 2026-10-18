---
name: narabizagui-modelar
description: Crear o modificar procesos BPMN y modelos ER mediante el MCP de NaraBizagui, con planificación proporcional, preservación de IDs y controles incrementales. Aplica a cambios solicitados, no a una revisión sin edición.
---

# Modelar con NaraBizagui

Lee [el contrato común](../../shared/workflow.md) y, para operaciones o propiedades, [modelado](../../shared/modeling.md). Opera la pestaña vinculada por MCP. El navegador sirve para vinculación autorizada y evaluación visual; una capacidad faltante no autoriza editar el proceso por interfaz o JavaScript.

Antes de un montaje o reorganización amplia, prepara un plan en el proyecto del usuario: fuentes vigentes y discrepancias resueltas, claves de actividades, responsables, etapas, decisiones y conexiones. Usa los requisitos ya establecidos. Los carriles representan responsables internos; participantes separados, procesos independientes. Las etapas ordenan la presentación y no crean esperas de negocio.

Comprueba las capacidades que requiere el plan en `read.capabilities`, `serverVersion`, `editorVersion` y `editorBuild`. Para una capacidad nueva o dudosa, prueba el patrón con datos genéricos antes de construir todo el proceso. Una actualización necesita conservar los cambios y volver a comprobar la sesión; no recargues una pestaña con cambios sin conservar.

Para un proceso grande, monta primero un tramo representativo y verifica reglas, devolución y enlace. Dimensiona carriles/columnas, reserva espacio para etiquetas y recorridos y después extiende el patrón. No reconstruyas figuras o conexiones para corregir geometría: conserva IDs, extremos, documentación y asociaciones.

`narabizagui_edit_batch` agrupa hasta el límite declarado en capacidades. Usa alias para figuras nuevas, `dryRun:true` para comprobar un bloque importante y un UUID de solicitud para aplicarlo. Deshacer afecta el bloque completo. Hojas, etapas, carriles y ER se editan con sus operaciones individuales admitidas; no los introduzcas en un bloque que no los soporte. Mantén las llamadas mutantes secuenciales y utiliza la revisión confirmada.

Para evitar operaciones repetidas, el [script compartido](../../shared/snapshot-cli.mjs) permite `plan snapshot.json operations.json`; elimina cambios comprobablemente idénticos y conserva el orden. No omitas operaciones basándote en un estado anterior a movimientos con efectos sobre rutas.

Usa `properties` para la configuración semántica; `label` cambia el texto visible. Los enlaces necesitan nombre interno y contraparte del mismo ámbito. Las etiquetas Sí/No no equivalen a condiciones formales. Consulta `read` con `includePropertyFields:true` y `elementIds` cuando necesites las opciones de un elemento.

Valida cada bloque significativo antes de acumular más detalle. Atiende incidencias relacionadas con el cambio, revisa límites reales de etiquetas después de aplicar y comprueba visualmente el PNG cuando corresponda. Conserva puntos de recuperación en el proyecto en cambios estructurales, actualizaciones de versión y entrega, sin pedir autorización de nuevo para acciones ya autorizadas. No incorpores cifras, reglas o fuentes no confirmadas.
