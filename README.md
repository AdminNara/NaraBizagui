# NaraBizagui by NaraLab

Editor de procesos BPMN en el navegador, con carriles por responsable, columnas de etapas, documentos y comentarios. Interfaz propia de NaraLab basada en bpmn-js.

## Abrir

Web: **https://demo.naraconsultores.com/NaraBizagui/**

También puede ejecutarse el código localmente desde esta carpeta:

```sh
python -m http.server 8766 --bind 127.0.0.1
```

Abrir `http://127.0.0.1:8766/`. No hay servidor de documentos ni base de datos.

## Archivos

- **Nuevo:** inicia un BPMN sin datos de cliente.
- **Abrir BPMN:** elige un archivo del equipo. En Edge/Chrome de escritorio se conserva acceso al archivo autorizado.
- **Guardar:** actualiza el archivo elegido; **Guardar como** permite elegir otro destino. Navegadores sin File System Access descargan una copia.
- **Exportar:** descarga BPMN, SVG o PNG.
- **Historial local:** permite descargar revisiones anteriores conservadas en este navegador. Borrar datos del navegador elimina este historial.

Se pueden elegir archivos de carpetas de OneDrive/SharePoint sincronizadas. El cliente de sincronización gestiona su subida a Microsoft. No está implementada una conexión directa a Microsoft Graph.

Los diagramas seleccionados no se suben a este sitio ni a este repositorio. Solo se publica el editor y sus recursos. Cada persona conserva sus archivos y permisos.

## Trabajo con Codex

Codex necesita acceso al mismo archivo BPMN local/sincronizado o una conexión documental autorizada. Si el navegador mantiene un FileSystemFileHandle válido, la aplicación vuelve a leer el archivo abierto y compara su contenido. Sin ediciones pendientes recarga el diagrama; con cambios pendientes muestra el conflicto y rechaza sobrescribir una base distinta. El botón **Recargar diagrama** permite volver a leer el archivo sin recargar la página completa.

El selector HTML usado como alternativa abre una copia en memoria y no puede detectar modificaciones posteriores del archivo original. La detección se reanuda al abrirlo otra vez. Las pestañas en segundo plano pueden retrasar la comprobación. No existe todavía un MCP conectado al modelo abierto; el puente MCP es una mejora propuesta.

## Recursos

`index.html`, `modelador.js`, `archivos.js`, `modelador.css` y `assets/` forman la aplicación. `manifest.json` registra sus hashes al empaquetar. Las dependencias y su licencia se conservan en `vendor/`.

La licencia de bpmn-js exige conservar visible el distintivo bpmn.io; se muestra fuera del lienzo. Ver [licencia incluida](vendor/LICENSE.txt).

## Alcance de la web pública

El código y la herramienta son públicos. No hay registro de usuarios, permisos por repositorio ni almacenamiento de documentos de clientes en GitHub Pages. Publicar un archivo BPMN en este repositorio lo haría público: los documentos de trabajo deben permanecer fuera del repositorio.
