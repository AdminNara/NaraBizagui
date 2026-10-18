---
name: narabizagui-validar
description: Revisar un proceso BPMN o modelo ER de NaraBizagui sin modificarlo, informando incidencias semánticas, geométricas y de legibilidad con IDs y revisión de origen.
---

# Validar sin editar

Lee [el contrato común](../../shared/workflow.md). En una sesión conectada, identifica archivo, sesión y hoja mediante `read(detail:"full")`; comprueba que la lectura sea completa. Si recibes un snapshot local, usa sus metadatos sin exigir conexión; declara cualquier procedencia o revisión ausente. No cambies el diagrama para realizar una auditoría.

Usa `narabizagui_validate` con la revisión vigente. `profile:review` corresponde a diagramas explicativos o para revisión; `formal` exige condiciones BPMN en las ramas aplicables. Ningún perfil certifica ejecución ni aprobación del negocio. Mantén el perfil declarado por el proyecto; no inventes reglas para eliminar avisos.

Clasifica las incidencias por impacto e incluye sus `code`, `elementIds` y revisión: enlaces incompletos o duplicados por ámbito, extremos inválidos, condiciones/predeterminadas, temporizadores y condiciones de eventos, líneas atravesando figuras, cruces/contactos/superposiciones y etiquetas. Distingue errores de avisos. Un resultado incompleto o con incidencias truncadas no es un pase integral.

Para un snapshot local autorizado, ejecuta `node <plugin>/shared/snapshot-cli.mjs validate <snapshot.json> [--formal]`. Para contrastar antes/después, usa `diff <before.json> <after.json>`; evalúa el cambio esperado y la preservación de elementos ajenos. Los scripts no editan el modelo.

Cuando exista una sesión o imagen autorizada, complementa el análisis con una única evidencia visual de la hoja/revisión: el lienzo visible o su PNG, sin duplicarlos por rutina. Si solo hay un snapshot, declara la comprobación visual pendiente o no disponible; no conectes ni edites para completar una auditoría local. Comprueba lectura real de textos al tamaño de uso, disposición de etapas/carriles y trayectorias; la ausencia de incidencias geométricas no demuestra legibilidad. Revisa `coverage` y `source`: la falta de geometría de figuras, recorridos o etiquetas impide un pase geométrico integral. Si el PNG reduce escala por sus límites, informa esa limitación y respeta la preferencia de una sola hoja.

Entrega hallazgos verificables, alcance cubierto y pendientes; separa validación técnica, contenido del proceso y aceptación del cliente. Si el usuario pidió además corregir, devuelve los hallazgos a modelado; una solicitud de análisis sola no autoriza aplicar cambios.
