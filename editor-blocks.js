'use strict';
(() => {
  const fail = (code, message) => Object.assign(Error(message), { code });
  function create({ modeler, read, guard, describe, getRevision }) {
    const runner = window.NaraMcpOperations.create(modeler), stack = modeler.get('commandStack'), requests = new Map();
    let recovery = null;
    function Block() { this.preExecute = c => { c.result = runner.run(c.operations); }; this.execute = this.revert = () => []; }
    stack.registerHandler('nara.mcp.block', Block);
    const recent = () => [...requests].map(([requestId, r]) => ({ requestId, status: r.status, beforeRevision: r.beforeRevision, committedRevision: r.result?.committedRevision, operationCount: r.count })).slice(-64);
    const remember = (id, entry) => { requests.set(id, entry); if (requests.size > 64) requests.delete(requests.keys().next().value); };
    async function preview(xml, operations) {
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:-20000px;top:0;width:1200px;height:800px;visibility:hidden'; document.body.appendChild(host);
      const draft = new BpmnJS({ container: host, moddleExtensions: window.NaraERModdle ? { nara: window.NaraERModdle } : {} });
      try {
        const active = modeler.get('canvas').getRootElement().businessObject.id;
        const { warnings } = await draft.importXML(xml);
        const diagram = (draft.getDefinitions().diagrams || []).find(d => d.plane.bpmnElement.id === active);
        if (draft.get('canvas').getRootElement().businessObject.id !== active) {
          if (!diagram) throw fail('BATCH_SCOPE_UNAVAILABLE', 'No se puede prevalidar la hoja activa sin cambiar su ámbito.');
          await draft.open(diagram);
        }
        if (warnings.length) throw fail('BATCH_IMPORT_WARNING', 'La copia temporal tiene advertencias de importación; revisa antes de agrupar.');
        const draftRunner = window.NaraMcpOperations.create(draft);
        const before = { elements: draft.get('elementRegistry').getAll().filter(e => e.businessObject && !e.labelTarget && draft.get('canvas').findRoot(e) === draft.get('canvas').getRootElement()).map(e => describe(e, draft)) };
        const result = draftRunner.run(operations);
        const after = { diagramType: 'bpmn', elements: draft.get('elementRegistry').getAll().filter(e => e.businessObject && !e.labelTarget && draft.get('canvas').findRoot(e) === draft.get('canvas').getRootElement()).map(e => describe(e, draft)) };
        return { ...result, diff: window.NaraModelAudit.compareSnapshots(before, after), validation: window.NaraModelAudit.validateSnapshot(after) };
      } finally { draft.destroy(); host.remove(); }
    }
    async function batch({ expectedRevision, requestId, operations, dryRun = false }) {
      if (typeof requestId !== 'string' || !requestId.length || requestId.length > 100) throw fail('INVALID_BATCH', 'El bloque requiere un identificador de solicitud.');
      if (recovery) throw fail('BATCH_RECOVERY_REQUIRED', 'Conserva la copia anterior y revisa el estado antes de continuar.');
      if (!Array.isArray(operations) || !operations.length || operations.length > 50 || operations.some(op => !runner.supported.includes(op.type))) throw fail('INVALID_BATCH', 'El bloque admite de 1 a 50 operaciones BPMN compatibles.');
      const fingerprint = JSON.stringify({ expectedRevision, operations }), previous = requests.get(requestId);
      if (!dryRun && previous) {
        if (previous.fingerprint !== fingerprint) throw fail('REQUEST_ID_REUSED', 'El identificador ya pertenece a otro bloque o revisión.');
        return { ...(previous.result || { applied:false, requestId, reconciliationRequired:true, status:previous.status }), replayed: true, state: await read() };
      }
      guard(expectedRevision); const before = await read({ includeXml: true }); guard(expectedRevision);
      if (before.diagramType !== 'bpmn' || before.elementsTruncated) throw fail('BATCH_SCOPE_UNAVAILABLE', 'Agrupar requiere una hoja BPMN con lectura completa.');
      const planned = await preview(before.xml, operations); guard(expectedRevision);
      if (dryRun) return { applied: false, dryRun: true, sourceRevision: expectedRevision, operationCount: operations.length, previewAliases: planned.aliases, diff: planned.diff, validation: planned.validation };
      const record = { fingerprint, beforeRevision: expectedRevision, count: operations.length, status: 'applying' }; remember(requestId, record);
      // bpmn-js 18.16: retain history/redo and unwind a failed native command.
      // This path is regression-tested against the pinned CommandStack runtime.
      const history = { actions: stack._stack.slice(), index: stack._stackIdx, execution: { ...stack._currentExecution, actions: [...stack._currentExecution.actions], dirty: [...stack._currentExecution.dirty] } };
      const context = { operations };
      let failure;
      try { stack.execute('nara.mcp.block', context); } catch (cause) { failure = cause; }
      if (!failure) {
        record.status = 'applied'; record.result = { applied: true, requestId, committedRevision: getRevision(), operationCount: operations.length, ...context.result };
        // A concurrent manual edit during serialization must never be undone.
        try { const after = await read(); record.result.state = after; record.result.validation = window.NaraModelAudit.validateSnapshot(after); }
        catch { record.result.reconciliationRequired = true; }
        return record.result;
      } else {
        try {
          stack._currentExecution = { actions: [], dirty: [], atomic: false, trigger: null };
          if (stack._stackIdx > history.index) stack.undo();
        } catch { /* Verify actual content below; never claim an unverified rollback. */ }
        stack._currentExecution = history.execution;
        let after;
        try { after = await read({ includeXml:true }); } catch { /* Preserve any concurrent edit and stop. */ }
        const rolledBack = after?.sha256 === before.sha256;
        if (rolledBack) { stack._stack = history.actions; stack._stackIdx = history.index; }
        else recovery = { requestId, beforeRevision: before.revision, beforeSha256: before.sha256, xml: before.xml };
        record.status = rolledBack ? 'rolled_back' : 'recovery_required';
        record.result = { applied: false, requestId, rolledBack, recoveryRequired: !rolledBack, code: rolledBack ? 'BATCH_ROLLED_BACK' : 'BATCH_RECOVERY_REQUIRED', message: failure.message, state: after ? { ...after, xml: undefined } : undefined, ...(recovery ? { recoverySnapshot: recovery } : {}) };
        return record.result;
      }
    }
    return { batch, apply: runner.apply, recent, recovery: includeXml => recovery ? { ...recovery, xml: includeXml ? recovery.xml : undefined } : null };
  }
  window.NaraMcpBlocks = { create };
})();
