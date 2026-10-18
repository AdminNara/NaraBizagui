---
name: narabizagui
description: Coordinar solicitudes de NaraBizagui, identificar la sesión y dirigir el trabajo a modelado, validación o entrega. Usar cuando el usuario elija este modelador o necesite un trabajo que combine esas acciones.
---

# Coordinar NaraBizagui

Este plugin contiene cuatro skills, scripts compartidos y un MCP local; se instala una sola vez desde Nara IA Market. Usa el editor existente y archivos BPMN independientes. No generes otro visor ni instales un segundo MCP.

Lee [el contrato compartido](../../shared/workflow.md) para conexión, capacidades, revisiones, recuperación y conservación. Reutiliza una sesión que corresponda al archivo solicitado; la presencia del plugin no demuestra conexión. Con varias pestañas no identificables, pide solo el dato que falta.

Selecciona el objetivo y carga únicamente su skill:

- Crear o cambiar el diagrama: [narabizagui-modelar](../narabizagui-modelar/SKILL.md).
- Revisar un diagrama: [narabizagui-validar](../narabizagui-validar/SKILL.md). Una revisión por sí sola no autoriza correcciones.
- Guardar, exportar o preparar un informe: [narabizagui-entregar](../narabizagui-entregar/SKILL.md).

Para un montaje nuevo, resuelve con las fuentes y decisiones existentes: alcance, nivel de formalización (representación para revisión o reglas BPMN formales), responsables internos/participantes independientes, etapas, detalle/hojas y destino editable. Pregunta solamente lo que no se pueda inferir y cambie materialmente el resultado. No repitas preguntas ya resueltas ni impongas un levantamiento completo para una corrección pequeña.

## Ritmo según el modo de interacción

Usa la señal de voz o texto que proporcione el host. Una transcripción o una frase coloquial no demuestra que la voz siga activa. Si el host no informa el modo, sigue la preferencia explícita del usuario; no hagas una pregunta adicional solo para clasificarlo. Si cambia de modo, conserva lo ya acordado y adapta el ritmo.

En voz o cuando pide «muéstrame», prioriza un borrador visible y reversible. Resuelve decisiones de presentación con criterio; marca responsables, etapas o pasos desconocidos como «por definir». No inventes reglas de negocio. Evita cuestionarios previos, relatos de herramientas y anuncios repetidos. Comunica solo un resultado, bloqueo real o pregunta indispensable. Si una operación no existe, dilo al comprobarlo, antes de anunciar que vas a ejecutarla. No prometas tiempos de respuesta que no hayas medido.

Por escrito, si el usuario está explorando o planificando, ayuda a precisar el diseño mediante preguntas breves y opciones concretas. Consolida sus decisiones y ofrece una sola entrega coherente cuando el diseño esté listo. No publiques sucesivos borradores sin que aporten valor. Una petición directa de ejecutar, rapidez o borrador visual prevalece sobre este ritmo; planificar no autoriza implementar.

Comprueba sesión, versión y operaciones del contrato realmente cargado antes de una edición estructural. Una versión instalada no actualiza un chat abierto. Si este conserva herramientas antiguas, no pruebes tipos que su esquema no admite ni crees un contenedor incompleto anunciándolo como una matriz. Indica la recuperación soportada sin perder el documento; no uses un segundo servidor para ocultar esa limitación.

Reutiliza la sesión y las lecturas confirmadas. Para una matriz usa la operación estructural; para varias ediciones compatibles usa un bloque con alias. La respuesta confirmada aporta la revisión siguiente: no repitas lecturas completas sin motivo. La lectura resumida sirve para estado, no para una revisión integral. Deja que el autoguardado gestione el destino ya autorizado; no abras selectores, hagas copias locales ni fuerces guardados por rutina. Encajar o mostrar el lienzo se solicita por MCP. El navegador solo cubre vinculación o evaluación visual autorizada, no sustituye operaciones que faltan en un chat antiguo.

En tareas combinadas coordina modelado → validación → entrega, conservando la misma sesión, hoja y versión. El archivo y su contenido pertenecen al proyecto elegido; las mejoras genéricas de la herramienta se trabajan con pruebas genéricas en su propio repositorio. No incluyas datos de clientes en el paquete del plugin.
