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

En tareas combinadas coordina modelado → validación → entrega, conservando la misma sesión, hoja y versión. El archivo y su contenido pertenecen al proyecto elegido; las mejoras genéricas de la herramienta se trabajan con pruebas genéricas en su propio repositorio. No incluyas datos de clientes en el paquete del plugin.
