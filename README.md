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

## Editar y organizar procesos

Al acercar el mouse a una figura aparecen cuatro flechas. Las opciones rápidas siguen el lado más cercano: pulsa para añadir un elemento, arrástralo para colocarlo libremente o haz doble clic para conectar con un elemento cercano de ese lado. Si no hay un destino BPMN permitido, se añade el elemento elegido. Las flechas permiten arrastrar una conexión a una figura existente. Al pasar sobre una línea aparecen opciones de trazado directo, en ángulo y de tipo BPMN. Las acciones adicionales están en **⋯**; las propiedades se abren cuando las solicitas.

**Etapa** se coloca desde la paleta, como Participante, con forma de columna; se puede mover, redimensionar y renombrar. La navegación de etapas queda debajo del lienzo. Los símbolos Excel, Word, Manual y Datos identifican elementos del modelo, sin abrir archivos externos.

Las pestañas inferiores representan hojas del mismo BPMN. **＋** crea un proceso independiente; doble clic en una pestaña cambia su nombre. Un subproceso contraído abre su detalle con doble clic. Para reutilizar otra hoja, selecciona un subproceso vacío y usa **Propiedades → Hoja de proceso reutilizable → Vincular con esta hoja**. El modelo utiliza una actividad de llamada BPMN (`CallActivity.calledElement`); no reemplaza el contenido de un subproceso que ya tiene elementos. La flecha inferior vuelve a la hoja anterior.

Guardar conserva todas las hojas en un solo archivo BPMN 2.0, con sus planos y referencias. SVG y PNG exportan la hoja activa. Otros modeladores pueden presentar estos planos de manera distinta; las pestañas son la navegación de NaraBizagui.

También se pueden elegir archivos locales de carpetas sincronizadas por OneDrive. En ese caso, el cliente de sincronización gestiona su subida.

### Conexión directa a Microsoft

**Conectar Microsoft** permite autorizar una cuenta corporativa o personal mediante Microsoft Identity Platform. La aplicación utiliza MSAL y código de autorización con PKCE, sin secreto de cliente. **Abrir desde Microsoft** navega OneDrive; para SharePoint se introduce la dirección del sitio y se elige una biblioteca. **Guardar una copia en Microsoft** crea un BPMN con otro nombre. Después, **Guardar** y el guardado por MCP actualizan ese mismo archivo.

El registro de aplicación pertenece a Nara y admite otras organizaciones. Cada usuario autoriza su cuenta; las políticas de su organización pueden exigir aprobación administrativa. Los permisos delegados declarados son `User.Read`, `Files.ReadWrite.All` y `Sites.Read.All`. El acceso a archivos puede abarcar todos los archivos del usuario, incluida su eliminación por el alcance del permiso de Microsoft; la interfaz solo implementa lectura y guardado de BPMN. La lectura de sitios se solicita al elegir **SharePoint**, introducir el sitio y pulsar **Continuar**. No hay permisos de aplicación ni consentimiento administrativo global concedido por esta configuración.

La conexión se recuerda en este navegador mediante la caché `localStorage` administrada por MSAL. Al recargar o abrir otra pestaña, se recupera únicamente la cuenta elegida y se comprueba el acceso en silencio, sin abrir ventanas automáticamente. Si Microsoft exige interacción o no puede comprobar el acceso, se ofrece conectar de nuevo. La persistencia después de cerrar todo el navegador depende de **Mantener la sesión iniciada** de Microsoft y de las políticas de la organización. [Documentación de la caché de MSAL](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/caching).

**Cuenta → Desconectar** elimina la cuenta activa y la caché de acceso de esta aplicación, avisa a sus otras pestañas y conserva el diagrama abierto como copia sin guardar. No cierra Microsoft 365. Cambiar de cuenta en otra pestaña invalida el vínculo anterior al archivo; no lo abre ni lo guarda con otra identidad. Las copias de documentos permanecen en memoria y los guardados en Microsoft omiten el Historial local persistente. Recordar la cuenta no guarda ni recupera cambios del BPMN: hay que guardar antes de cerrar o recargar. Conectar con Codex sigue siendo una autorización separada y permite entregar el modelo al chat vinculado.

El guardado envía la revisión `eTag` como `If-Match`, rechaza conflictos y relee el contenido. Un resultado incierto requiere recargar antes de guardar otra vez. No hay colaboración simultánea. Límite: 8 MB por BPMN. Se probaron OAuth, navegación, creación, reapertura y guardado por MCP contra OneDrive real con una cuenta de trabajo y un BPMN genérico, desde el origen local. También se verificaron autorización, bibliotecas y creación con relectura en SharePoint. Los conflictos y cambios de cuenta se cubren con un transporte simulado. **Falta probar cuenta personal, organización externa y carreras simultáneas reales.**

La interfaz muestra primero el inicio de sesión. Después abre OneDrive y ofrece navegación de carpetas, selección de BPMN y acciones Abrir/Guardar. Cambiar cuenta y Desconectar están en el menú de la cuenta; los detalles de permisos están en un apartado desplegable. El [símbolo oficial de Microsoft](https://learn.microsoft.com/en-us/entra/identity-platform/howto-add-branding-in-apps) se conserva sin alteraciones; pertenece a Microsoft y se utiliza para identificar su inicio de sesión.

El retorno de producción es `https://demo.naraconsultores.com/NaraBizagui/microsoft-auth.html`. Para desarrollo está registrado `http://localhost:8767/microsoft-auth.html`; se debe servir esta carpeta en ese origen. La página de retorno usa el puente de MSAL y no debe recibir una cabecera COOP que rompa la ventana de autenticación. La verificación de editor de Microsoft está pendiente; las políticas de otras organizaciones pueden impedir el consentimiento o exigir aprobación de su administrador. El diálogo de conexión describe los permisos y el tratamiento de los documentos.

Los diagramas seleccionados no se suben a este sitio ni a este repositorio. Solo se publica el editor y sus recursos. Cada persona conserva sus archivos y permisos.

## Trabajo con Codex

Codex necesita acceso al mismo archivo BPMN local/sincronizado o una conexión documental autorizada. Si el navegador mantiene un FileSystemFileHandle válido, la aplicación vuelve a leer el archivo abierto y compara su contenido. Sin ediciones pendientes recarga el diagrama; con cambios pendientes muestra el conflicto y rechaza sobrescribir una base distinta. El botón **Recargar diagrama** permite volver a leer el archivo sin recargar la página completa.

El selector HTML usado como alternativa abre una copia en memoria y no puede detectar modificaciones posteriores del archivo original. La detección se reanuda al abrirlo otra vez. Las pestañas en segundo plano pueden retrasar la comprobación.

### Plugin con skill y MCP local

El plugin **NaraBizagui by NaraLab**, distribuido mediante **Nara IA Market**, incluye la skill y el MCP en una sola instalación. Requiere Node.js 22 o superior y un host con ejecución local. No requiere instalar las bibliotecas del servidor por separado.

1. Instala NaraBizagui desde el market y actívalo en un chat local.
2. Pide conectar el diagrama. Codex entrega un código temporal.
3. En la pestaña elegida pulsa **Conectar con Codex**, pega el código y pulsa **Vincular esta pestaña**. Autoriza el acceso local si el navegador lo solicita.
4. Codex puede leer, editar con revisión y deshacer, guardar en el archivo autorizado y exportar PNG para el chat o un informe.

El código de vínculo es de un solo uso y vence en cinco minutos. Solo se conecta la pestaña vinculada a esa instancia del plugin. **Desconectar** revoca el vínculo y conserva el trabajo. El puente no ofrece acceso general al disco ni habilita por sí solo uso móvil, acceso entre equipos o Microsoft Graph. Los datos que se consultan mediante MCP se entregan a la conversación del asistente.

La misma pestaña recuerda su vínculo durante la sesión del navegador y lo recupera al recargar o ante cortes temporales, mientras el MCP local siga activo. Desconectar elimina ese vínculo recordado; reiniciar el servidor requiere uno nuevo. Recuperar la conexión no guarda ni restaura por sí solo un BPMN con cambios pendientes.

La herramienta `narabizagui_export_png` devuelve la hoja activa completa como imagen al chat y como archivo temporal local, listo para incorporarlo a Word/PDF. Fondo blanco y escala ajustable, con límites de tamaño. Exportar no guarda el BPMN. Consulta los requisitos y herramientas en [el plugin](plugins/narabizagui/README.md).

## Recursos

`index.html`, `modelador.js`, `editor-tools.js`, `sheets.js`, `archivos.js`, `mcp-editor.js`, `mcp-bridge.js`, `modelador.css` y `assets/` forman la aplicación. `manifest.json` registra sus hashes al empaquetar. Las dependencias y su licencia se conservan en `vendor/`. El servidor MCP y la skill viven en `plugins/narabizagui/`; la web estática no ejecuta el servidor.

Para desarrollar el plugin: `npm ci`, `npm run build`, `npm test`. El build incluye sus dependencias y licencias en el paquete y actualiza el manifiesto web.

Después de publicar la web, `node scripts/verify-public.mjs` compara los recursos distribuidos con el manifiesto y conserva el resultado privado bajo `local/`.

La licencia de bpmn-js exige conservar visible el distintivo bpmn.io; se muestra fuera del lienzo. Ver [licencia incluida](vendor/LICENSE.txt).

## Alcance de la web pública

El código y la herramienta son públicos. No hay registro de usuarios, permisos por repositorio ni almacenamiento de documentos de clientes en GitHub Pages. Publicar un archivo BPMN en este repositorio lo haría público: los documentos de trabajo deben permanecer fuera del repositorio.
