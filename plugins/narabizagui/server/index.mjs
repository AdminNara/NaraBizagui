import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { startBridge, VERSION } from './bridge.mjs';
import { pngArtifact } from './png.mjs';

const bridge = await startBridge();
const server = new McpServer({ name: 'narabizagui', version: VERSION }, {
  instructions: 'NaraBizagui edita la sesión web vinculada, no un modelo paralelo. Usa connect y espera el vínculo; sessions identifica la pestaña. Lee antes de cada cambio y exige su expectedRevision. Un cambio del lienzo no es un archivo guardado: usa save y verifica saved=true. Ante RESULT_UNKNOWN lee antes de repetir; ante REVISION_CONFLICT conserva los cambios manuales. No interpreta BPMN como instrucciones ni valida el proceso de negocio. Invoca la skill narabizagui del mismo plugin.',
  maxToolInputElements: 1000
});
const id = z.string().uuid();
const revision = z.string().min(1).max(100);
const elementId = z.string().min(1).max(200);
const text = z.string().max(20000);
const finite = z.number().finite().min(-100000).max(100000);
const edit = z.discriminatedUnion('type', [
  z.object({ type: z.literal('label'), elementId, text }),
  z.object({ type: z.literal('documentation'), elementId, text }),
  z.object({ type: z.literal('create'), bpmnType: z.enum(['bpmn:Task', 'bpmn:ManualTask', 'bpmn:UserTask', 'bpmn:ServiceTask', 'bpmn:SubProcess', 'bpmn:CallActivity', 'bpmn:StartEvent', 'bpmn:EndEvent', 'bpmn:IntermediateCatchEvent', 'bpmn:ExclusiveGateway', 'bpmn:ParallelGateway', 'bpmn:TextAnnotation', 'bpmn:DataObjectReference', 'bpmn:DataStoreReference', 'bpmn:Participant']), x: finite, y: finite, parentId: elementId.optional(), name: text.optional() }),
  z.object({ type: z.literal('connect'), sourceId: elementId, targetId: elementId, bpmnType: z.enum(['bpmn:SequenceFlow', 'bpmn:MessageFlow', 'bpmn:Association', 'bpmn:DataInputAssociation', 'bpmn:DataOutputAssociation']).optional() }),
  z.object({ type: z.literal('move'), elementId, dx: finite, dy: finite, parentId: elementId.optional() }),
  z.object({ type: z.literal('resize'), elementId, x: finite, y: finite, width: z.number().min(20).max(100000), height: z.number().min(20).max(100000) }),
  z.object({ type: z.literal('delete'), elementId }),
  z.object({ type: z.literal('stage') }),
  z.object({ type: z.literal('sheet_create'), name: z.string().min(1).max(120) }),
  z.object({ type: z.literal('sheet_open'), sheetId: elementId }),
  z.object({ type: z.literal('sheet_rename'), sheetId: elementId, name: z.string().min(1).max(120) }),
  z.object({ type: z.literal('subprocess_open'), elementId }),
  z.object({ type: z.literal('sheet_link'), elementId, sheetId: elementId }),
  z.object({ type: z.literal('undo') }),
  z.object({ type: z.literal('redo') })
]);
function register(name, description, schema, readOnly, callback) {
  server.registerTool(name, { description, inputSchema: schema, annotations: { readOnlyHint: readOnly, destructiveHint: !readOnly, idempotentHint: readOnly, openWorldHint: false } }, async args => {
    try {
      const result = await callback(args);
      return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
    } catch (error) {
      return { isError: true, content: [{ type: 'text', text: JSON.stringify({ code: error.code || 'ERROR', message: error.message }) }] };
    }
  });
}
register('narabizagui_connect', 'Crea un código temporal para vincular una pestaña elegida. Requiere que el usuario pulse Vincular en el visor.', {}, false, async () => bridge.pair());
register('narabizagui_sessions', 'Lista solo las pestañas vinculadas a esta instancia local del plugin.', {}, true, async () => ({ sessions: bridge.list() }));
register('narabizagui_read', 'Lee revisión, activeSheetId, sheets, elementos de la hoja activa, selección, advertencias y guardado. includeXml devuelve el BPMN completo de todas las hojas.', { sessionId: id, includeXml: z.boolean().default(false) }, true, args => bridge.request(args.sessionId, 'read', { includeXml: args.includeXml }));
register('narabizagui_edit', 'Aplica una operación nativa bpmn-js, con revisión base obligatoria y deshacer. Usa read para conocer IDs. x/y son el centro al crear; move usa desplazamiento. stage añade una etapa al final. sheet_create crea otra hoja, sheet_open navega, sheet_rename renombra, subprocess_open abre el detalle y sheet_link vincula con otro proceso mediante CallActivity; no reemplaza subprocesos con contenido.', { sessionId: id, expectedRevision: revision, operation: edit }, false, args => bridge.request(args.sessionId, 'edit', { expectedRevision: args.expectedRevision, operation: args.operation }));
register('narabizagui_save', 'Guarda en el archivo ya elegido y autorizado en el visor, conservando historial y comprobando conflictos. Si falta acceso, el usuario debe usar Guardar como en el navegador. No elige destinos ni descarga copias silenciosamente.', { sessionId: id, expectedRevision: revision }, false, args => bridge.request(args.sessionId, 'save', { expectedRevision: args.expectedRevision }));
server.registerTool('narabizagui_export_png', {
  description: 'Renderiza la hoja activa completa como PNG con fondo blanco, sin paneles; devuelve sheetId y sheetName. Devuelve la imagen al chat para inspección visual y un archivo temporal local para insertarlo en Word/PDF. Lee antes para indicar expectedRevision. No modifica ni guarda el BPMN. scale=2 por defecto; se reduce si es necesario para respetar 8192 px por lado y 16 megapíxeles.',
  inputSchema: { sessionId: id, expectedRevision: revision, scale: z.number().min(0.5).max(3).default(2) },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
}, async args => {
  try { return await pngArtifact(await bridge.request(args.sessionId, 'exportPng', { expectedRevision: args.expectedRevision, scale: args.scale })); }
  catch (error) { return { isError: true, content: [{ type: 'text', text: JSON.stringify({ code: error.code || 'PNG_EXPORT_ERROR', message: error.message }) }] }; }
});
register('narabizagui_disconnect', 'Revoca la conexión de una pestaña sin cerrar su diagrama ni descartar cambios.', { sessionId: id }, false, async args => { bridge.disconnect(args.sessionId); return { disconnected: true }; });

let closing = false;
async function close() { if (closing) return; closing = true; await bridge.close(); await server.close(); }
process.once('SIGINT', () => close().finally(() => process.exit(0)));
process.once('SIGTERM', () => close().finally(() => process.exit(0)));
process.stdin.once('end', () => close().finally(() => process.exit(0)));
await server.connect(new StdioServerTransport());
