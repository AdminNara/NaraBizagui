# Operaciones y propiedades

## Construcción y geometría

`create.x/y` son el centro de una figura BPMN; `move.dx/dy` son desplazamientos. `resize` usa esquina y dimensiones. Las tablas ER usan esquina superior izquierda y su altura deriva de los campos.

Usa `lane_split`/`lane_add` para responsables internos, `stage` para columnas y `move_elements` para transferencias conjuntas conservando conexiones. Las etapas no modifican la lógica. Las conexiones se corrigen con `route` y las etiquetas externas con `label.bounds`; utiliza los límites realmente devueltos por `read`, pues el texto ajusta su altura.

`read` devuelve solo la hoja activa; `includeXml` contiene el archivo completo. `sheet_create/open/rename`, `subprocess_open` y `sheet_link` conservan planos nativos. Vincular una hoja usa `CallActivity.calledElement`, requiere un subproceso vacío y no permite autorreferencia. No reemplaces contenido para resolver falta de capacidad.

En ER utiliza `erd_sheet_create`, `erd_table_create/update`, `erd_field_upsert/delete/move`, `erd_relationship_create/update` y `erd_delete`. Conserva tipo, PK/FK y nulabilidad al actualizar. Eliminar una tabla/campo también elimina relaciones; evalúa ese impacto. `style` conserva formato. No introduzcas ER en bloques BPMN.

## Propiedades semánticas

`read` expone `semanticProperties`, `eventDefinitions`, `condition`, `defaultFlowId`, `flowScopeId` y `labelBounds`. Para las opciones precisas lee `includePropertyFields:true` con `elementIds` del elemento. Una lectura filtrada no sirve como validación integral.

Aplica `operation:{type:"properties",elementId:"ID",values:{...}}`; solo se aceptan las claves y tipos admitidos para ese elemento. Reutiliza la configuración de la interfaz. Ejemplos de claves:

- Enlaces: `linkName`. Un nombre por ámbito (proceso/subproceso), una entrada y una o varias salidas. Se permiten extremos incompletos durante construcción, pero deben quedar identificados al validar. La etiqueta visible es independiente.
- Decisiones/actividades con salidas: `defaultFlow` contiene el ID de una conexión saliente; `condition:ID_CONEXION` contiene su expresión. Al seleccionar una predeterminada se elimina su condición. La conexión puede editarse directamente con `isDefault`, `flowCondition`, `flowLanguage`.
- Temporizador: `timerKind` (`timeDate`, `timeDuration`, `timeCycle`) y `timerValue`. Condicional: `eventCondition`, `eventLanguage`.
- Mensaje/señal/error/escalación: `referenceId` reutiliza una definición existente; con ID vacío, `referenceName` crea una y `referenceCode` permite código para error/escalación. No renombres referencias compartidas por inferencia.
- Actividades: `loopMode` (`none`, `standard`, `sequential`, `parallel`), `loopCondition`, `loopCardinality`. Borde: `interrupting`. Objetos de datos: `isCollection`.

`create` admite `eventDefinition` (por ejemplo `Timer`, `Message`, `Signal`, `Conditional`, `Link`) según el tipo de evento, además de `linkName` para enlaces. Configura después sus propiedades. No ejecuta expresiones ni certifica compatibilidad con un motor.

## Bloques y alias

El contrato `coordination-v1` añade `presentation:{expandedCanvas:true}` al bloque y `response:"summary"` (predeterminado en el MCP). `fit:true` encaja después de cambiar la vista. La respuesta compacta conserva revisión, hash, alias, incidencias y estado de guardado; omite figuras/XML. Usa `response:"full"` cuando necesites la geometría completa o `previewElements` de un rechazo. El formato de respuesta puede cambiar en un reenvío del mismo bloque; cambiar operaciones o presentación con el mismo identificador se rechaza. Un `dryRun` nunca presenta ni encaja la vista.

`timings` separa preparación, lectura, prevalidación, aplicación, presentación, confirmación y transporte. `firstVisibleMs` abarca desde la entrada al bloque en el editor hasta un cuadro visible confirmado; no incluye el tiempo de razonamiento, voz o coordinación anterior. Si la pestaña está oculta, vence la espera de cuadro o falla la presentación, `presentation.paintConfirmed` es falso y no se informa `firstVisibleMs`. La presentación se espera como máximo 250 ms y nunca revierte un modelo confirmado por un problema de vista.

`narabizagui_edit_batch` admite hasta 200 operaciones de `capabilities.batchOperations`, exclusivamente BPMN, con un coste estructural máximo de 500. Permite procesos completos con actividades, decisiones, eventos, condiciones, bucles, documentación, geometría y enlaces. Añade `matrix` para participante/carriles/etapas y `clear` con `scope:"active"` para limpiar esa hoja. `lane_split/lane_add` se agrupan también. Los cambios de archivo, hojas y ER siguen separados; las mutaciones no se paralelizan ni se ejecutan una por una cuando pueden agruparse.

La matriz devuelve alias `pool`, `lane1…`, `stage1…` y las claves de figuras. Un paso posterior usa `parentId:"@lane2"` para asignación nativa de responsable. Un `create` de `bpmn:SubProcess` acepta `expanded:true`; puedes redimensionarlo y crear sus figuras internas con su alias dentro del mismo bloque. Las conexiones internas deben permanecer en su ámbito BPMN. El MCP recibe el plan entero, lo prevalida, aplica y devuelve IDs, revisión, validación y duración. `fit:true` encaja el conjunto sin una llamada de navegador.

Para una geometría ya dimensionada, `create` y `resize` aceptan `autoResize:false`: conserva los contenedores previstos y exige que las figuras creadas quepan en su padre. El comportamiento nativo de ampliación automática se conserva si se omite. `requireValid:true` rechaza el bloque cuando la auditoría de la copia contiene errores, sin cambiar el lienzo; devuelve incidencias y `previewElements` para corregir la disposición. `dryRun` también devuelve esa geometría. Los IDs de la copia no son IDs del documento real.

`clear` + `matrix` + operaciones sobre `@alias` permiten reemplazar solo el contenido autorizado de la hoja en un Deshacer. La matriz es aditiva si no se limpia primero; `poolId` solo reutiliza un participante vacío. La escritura no se fuerza al terminar: comprueba el estado de autoguardado de la respuesta o de una lectura resumida cuando sea necesario.

Un `create`/`connect` puede declarar `as:"revision"`; pasos siguientes referencian `@revision` en IDs. También sirven alias en `values.defaultFlow` y claves `condition:@flujo`. El resultado devuelve los IDs reales en `aliases`. Los IDs del `dryRun` pertenecen a la copia temporal; no los uses como IDs reales.

Ejemplo mínimo:

```json
[
  {"type":"create","as":"inicio","bpmnType":"bpmn:StartEvent","x":120,"y":160},
  {"type":"create","as":"tarea","bpmnType":"bpmn:UserTask","name":"Revisar","x":300,"y":160},
  {"type":"connect","sourceId":"@inicio","targetId":"@tarea"}
]
```

La prevalidación usa un modelador temporal con la hoja y extensiones del archivo; no sustituye al modelo vinculado. Un bloque correcto se aplica en un paso de deshacer. Si la prevalidación falla no cambia el original. Ante un fallo inesperado se intenta deshacer y se comprueba el hash anterior; el resultado distingue reversión verificada de recuperación pendiente. Comprueba siempre `applied`, `replayed`, `rolledBack` y `recoveryRequired`.

## Texto, rutas y edición localizada

Consulta [edición visual](visual-editing.md) para fit_text, route_orthogonal, compact_container, documentFormat/documentUse, formato agrupado y respuestas canónicas. Ninguna de estas operaciones requiere reconstruir el archivo.
