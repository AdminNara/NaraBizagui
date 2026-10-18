---
name: narabizagui-entregar
description: Conservar una versión editable de NaraBizagui, comprobar el guardado y exportar PNG para chat, Word o PDF con trazabilidad de revisión y hoja. No requiere remodelar el proceso.
---

# Conservar y entregar

Lee [el contrato común](../../shared/workflow.md). Identifica la hoja y revisión solicitadas; no vuelvas a construir o validar todo el proceso para una exportación sencilla. Si existen hallazgos relevantes de la revisión, consérvalos como límites de la entrega.

Para guardado nativo usa `narabizagui_save` solo con el archivo elegido y autorizado en el visor. Si falta destino o permiso, explica el paso específico en la interfaz; no simules selectores ni inventes rutas. Informa guardado únicamente con `saved:true` y hash comprobado. El destino puede ser local o Microsoft; conectar Microsoft y conectar el MCP son autorizaciones distintas.

Cuando esté autorizado conservar una copia local del XML leído, guarda el contenido exacto de `read(includeXml:true)` en el proyecto o destino acordado y verifica su hash. Identifícala como copia exportada: no acredita guardado nativo ni permite cerrar un lienzo con cambios pendientes por inferencia.

Exporta con `narabizagui_export_png` sobre la revisión actual y confirma `sheetId`, `sheetName`, dimensiones, hash y `effectiveScale`. Revisa la imagen devuelta. El `filePath` es temporal; copia el PNG a la carpeta de entrega si se utilizará en un informe. Conserva el BPMN editable y la revisión de origen junto con la imagen derivada. Exportar no modifica ni guarda el BPMN.

Un archivo puede contener varias hojas; el PNG incluye únicamente la activa. Exporta las solicitadas, leyendo de nuevo al cambiar de hoja. No inventes recortes por etapas ni reorganices un diagrama grande para conseguir una imagen. Si un informe requiere paginación, propón el formato respetando la preferencia del usuario.

Entrega enlaces utilizables a los archivos, qué se comprobó y cualquier limitación material. No presentes XML válido, una imagen o un guardado como aprobación funcional o de negocio.
