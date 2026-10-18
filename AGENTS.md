# NaraBizagui by NaraLab

## Punto de entrada

Leer `local/RESUMEN_CONSTRUCCION.md` y `local/estado_proyecto.json` para retomar el estado de esta instalación. Los archivos bajo `local/` son privados del equipo y están excluidos de Git. No cargarlos en la web ni publicarlos.

## Alcance

Este proyecto contiene la herramienta BPMN reutilizable, su experiencia de edición, alojamiento, integraciones y pruebas. La validación de procesos de clientes pertenece a sus proyectos respectivos. No cargar transcripciones, Excel, BPMN reales ni contexto de clientes para desarrollar la herramienta, salvo instrucción específica y con copia de prueba.

## Trabajo

- Fuente web: archivos raíz y `assets/`, `vendor/`. Repo remoto público `AdminNara/NaraBizagui`; sitio `https://demo.naraconsultores.com/NaraBizagui/`.
- Los procesos se guardan como BPMN independientes. Un cambio de proceso no crea otro visor ni requiere publicar la herramienta.
- Preservar IDs, asociaciones, documentación y geometría de elementos no afectados. Separar mejora de interfaz, prueba técnica y validación del proceso.
- No incluir fuentes de clientes, credenciales, configuración del equipo, historiales privados o capturas con datos reales en un commit público. Inspeccionar archivos preparados antes de publicar.
- Conservar las licencias y atribución de dependencias. La licencia local de bpmn-js exige mantener visible su distintivo.
- El plugin `plugins/narabizagui/` contiene la skill y el MCP local con puente explícito a una pestaña. La mera instalación o presencia de otros MCP BPMN no demuestra conexión: comprobar sesión, revisión y confirmación del visor. Microsoft directo sigue siendo una propuesta.
- El PNG del MCP es una imagen derivada y un archivo temporal para informes; no equivale a guardado del BPMN ni a validación del proceso. Preservar el archivo editable y la revisión de origen.
- Probar con temporales o ejemplos genéricos. Verificar el sitio renderizado y los recursos de la versión publicada cuando se modifique la web. Actualizar hashes de `manifest.json` si cambian recursos distribuidos.

## Contexto separado

Toda mejora adicional del modelador se trabaja aquí. Cada proyecto de cliente conserva su BPMN, fuentes, estado de revisión y enlaces a la herramienta; no requiere cargar la historia de construcción de esta aplicación.
