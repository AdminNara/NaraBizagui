var NaraModelAudit = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // plugins/narabizagui/shared/audit.mjs
  var audit_exports = {};
  __export(audit_exports, {
    BATCH_LIMIT: () => BATCH_LIMIT,
    BATCH_OPERATIONS: () => BATCH_OPERATIONS,
    BPMN_CREATE_TYPES: () => BPMN_CREATE_TYPES,
    EVENT_KINDS: () => EVENT_KINDS,
    PROTOCOL_VERSION: () => PROTOCOL_VERSION,
    compareSnapshots: () => compareSnapshots,
    lineHitsBox: () => lineHitsBox,
    planOperations: () => planOperations,
    segmentContact: () => segmentContact,
    segments: () => segments,
    validateSnapshot: () => validateSnapshot
  });

  // plugins/narabizagui/shared/contract.mjs
  var PROTOCOL_VERSION = 2;
  var BATCH_LIMIT = 50;
  var BATCH_OPERATIONS = ["label", "documentation", "create", "connect", "move", "resize", "move_elements", "route", "properties"];
  var BPMN_CREATE_TYPES = ["bpmn:Task", "bpmn:ManualTask", "bpmn:UserTask", "bpmn:ServiceTask", "bpmn:SendTask", "bpmn:ReceiveTask", "bpmn:ScriptTask", "bpmn:BusinessRuleTask", "bpmn:SubProcess", "bpmn:CallActivity", "bpmn:StartEvent", "bpmn:EndEvent", "bpmn:IntermediateCatchEvent", "bpmn:IntermediateThrowEvent", "bpmn:ExclusiveGateway", "bpmn:InclusiveGateway", "bpmn:ParallelGateway", "bpmn:ComplexGateway", "bpmn:EventBasedGateway", "bpmn:TextAnnotation", "bpmn:DataObjectReference", "bpmn:DataStoreReference", "bpmn:Participant"];
  var EVENT_KINDS = {
    "bpmn:StartEvent": ["Message", "Timer", "Conditional", "Signal"],
    "bpmn:EndEvent": ["Message", "Signal", "Error", "Escalation", "Terminate", "Compensate"],
    "bpmn:IntermediateCatchEvent": ["Message", "Timer", "Conditional", "Link", "Signal"],
    "bpmn:IntermediateThrowEvent": ["Message", "Signal", "Escalation", "Link", "Compensate"]
  };

  // plugins/narabizagui/shared/audit.mjs
  var containers = /* @__PURE__ */ new Set(["bpmn:Participant", "bpmn:Lane", "bpmn:Group", "bpmn:TextAnnotation", "bpmn:Collaboration", "bpmn:Process"]);
  var conditional = /* @__PURE__ */ new Set(["bpmn:ExclusiveGateway", "bpmn:InclusiveGateway", "bpmn:ComplexGateway"]);
  var same = (a, b) => Math.abs(a - b) < 0.01;
  var pointEqual = (a, b) => same(a.x, b.x) && same(a.y, b.y);
  var cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  var between = (p, a, b) => Math.abs(cross(a, b, p)) < 0.01 && p.x >= Math.min(a.x, b.x) - 0.01 && p.x <= Math.max(a.x, b.x) + 0.01 && p.y >= Math.min(a.y, b.y) - 0.01 && p.y <= Math.max(a.y, b.y) + 0.01;
  var segments = (flow) => (flow.waypoints || []).slice(1).map((p, i) => [flow.waypoints[i], p]);
  function segmentContact(a, b, c, d) {
    const r = { x: b.x - a.x, y: b.y - a.y }, s = { x: d.x - c.x, y: d.y - c.y }, denominator = r.x * s.y - r.y * s.x;
    if (Math.abs(denominator) < 1e-4) {
      if (Math.abs(cross(a, b, c)) > 0.01) return null;
      const common = [a, b, c, d].filter((p) => between(p, a, b) && between(p, c, d));
      const unique = common.filter((p, i) => !common.slice(0, i).some((q) => pointEqual(p, q)));
      return unique.length > 1 ? { type: "overlap" } : unique.length ? { type: "contact", point: unique[0] } : null;
    }
    const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / denominator;
    const u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / denominator;
    if (t < -1e-5 || t > 1.00001 || u < -1e-5 || u > 1.00001) return null;
    return { type: t > 1e-5 && t < 0.99999 && u > 1e-5 && u < 0.99999 ? "crossing" : "contact", point: { x: a.x + t * r.x, y: a.y + t * r.y } };
  }
  function lineHitsBox(a, b, box, padding = 0) {
    const left = box.x - padding + 0.01, top = box.y - padding + 0.01, right = box.x + box.width + padding - 0.01, bottom = box.y + box.height + padding - 0.01;
    let low = 0, high = 1;
    for (const [origin, delta, min, max] of [[a.x, b.x - a.x, left, right], [a.y, b.y - a.y, top, bottom]]) {
      if (Math.abs(delta) < 1e-5) {
        if (origin < min || origin > max) return false;
      } else {
        const x = (min - origin) / delta, y = (max - origin) / delta;
        low = Math.max(low, Math.min(x, y));
        high = Math.min(high, Math.max(x, y));
        if (low > high) return false;
      }
    }
    return high >= 0 && low <= 1;
  }
  var boxesOverlap = (a, b) => a.x < b.x + b.width - 0.01 && a.x + a.width > b.x + 0.01 && a.y < b.y + b.height - 0.01 && a.y + a.height > b.y + 0.01;
  function validateSnapshot(snapshot, { profile = "review", geometry = true, maxIssues = 200 } = {}) {
    if (!["review", "formal"].includes(profile)) throw Error("profile must be review or formal");
    const issues = [], seen = /* @__PURE__ */ new Set();
    let detected = 0, errors = 0, warnings = 0;
    const add = (code, severity, ids, message, extra = {}) => {
      const key = code + ":" + [...ids].sort().join(",");
      if (seen.has(key)) return;
      seen.add(key);
      detected++;
      if (severity === "error") errors++;
      else warnings++;
      if (issues.length < maxIssues) issues.push({ code, severity, elementIds: ids, message, ...extra });
    };
    const elements = snapshot.elements || [], index = new Map(elements.map((e) => [e.id, e]));
    const coverage = { geometryRequested: geometry, missingFigureBounds: [], missingRoutes: [], missingLabelBounds: [] };
    const source = Object.fromEntries(["fileName", "revision", "sha256", "activeSheetId", "editorVersion", "editorBuild"].filter((key) => snapshot[key] !== void 0).map((key) => [key, snapshot[key]]));
    if (snapshot.elementsTruncated || snapshot.elementsFiltered) add("INCOMPLETE_SNAPSHOT", "error", [], "La lectura est\xE1 truncada o filtrada; no se puede declarar validaci\xF3n completa.");
    if (snapshot.unappliedProperties) add("FORM_PENDING", "warning", snapshot.selectedIds || [], "Hay propiedades sin aplicar; esta revisi\xF3n analiza el modelo confirmado.");
    for (const warning of snapshot.warnings || []) add("IMPORT_WARNING", "warning", [], String(warning));
    if (snapshot.diagramType === "erd") {
      const model = snapshot.dataModel || {}, tables = new Map((model.tables || []).map((t) => [t.id, t]));
      for (const table of tables.values()) {
        const names = /* @__PURE__ */ new Set();
        for (const field of table.fields || []) {
          if (names.has(field.name)) add("DUPLICATE_FIELD", "error", [table.id, field.id], "Nombre de campo repetido.");
          names.add(field.name);
        }
      }
      for (const relation of model.relationships || []) for (const side of ["source", "target"]) {
        if (!tables.get(relation[side + "TableId"])?.fields.some((f) => f.id === relation[side + "FieldId"])) add("DANGLING_RELATIONSHIP", "error", [relation.id], "La relaci\xF3n tiene un extremo inexistente.");
      }
    } else {
      const groups = /* @__PURE__ */ new Map();
      for (const e of elements) {
        for (const definition of e.eventDefinitions || []) {
          if (definition.type === "bpmn:LinkEventDefinition") {
            if (!definition.name?.trim()) {
              add("LINK_NAME_MISSING", "error", [e.id], "Falta el nombre interno del enlace.");
              continue;
            }
            const key = (e.flowScopeId || e.parentId || "") + ":" + definition.name;
            const group = groups.get(key) || [];
            group.push(e);
            groups.set(key, group);
          }
          if (definition.type === "bpmn:TimerEventDefinition" && !["timeDate", "timeDuration", "timeCycle"].some((k) => definition[k]?.body?.trim())) add("TIMER_VALUE_MISSING", "error", [e.id], "Falta el valor del temporizador.");
          if (definition.type === "bpmn:ConditionalEventDefinition" && !definition.condition?.body?.trim()) add("EVENT_CONDITION_MISSING", "error", [e.id], "Falta la condici\xF3n del evento.");
        }
        if (e.type === "bpmn:SequenceFlow") {
          const source2 = index.get(e.sourceId), target = index.get(e.targetId);
          if (!source2 || !target) add("DANGLING_FLOW", "error", [e.id], "La conexi\xF3n tiene un extremo inexistente.");
          else if (source2.flowScopeId && target.flowScopeId && source2.flowScopeId !== target.flowScopeId) add("SEQUENCE_CROSSES_SCOPE", "error", [e.id, source2.id, target.id], "Un flujo de secuencia cruza procesos o subprocesos.");
          if (source2?.defaultFlowId === e.id && e.condition?.body) add("DEFAULT_HAS_CONDITION", "error", [e.id], "La salida predeterminada no debe tener condici\xF3n.");
          if (["bpmn:ParallelGateway", "bpmn:EventBasedGateway"].includes(source2?.type) && e.condition?.body) add("UNSUPPORTED_FLOW_CONDITION", "error", [e.id, source2.id], "Esta compuerta no eval\xFAa condiciones en sus salidas.");
        }
        if (conditional.has(e.type)) {
          const outgoing = elements.filter((f) => f.type === "bpmn:SequenceFlow" && f.sourceId === e.id);
          if (e.defaultFlowId && !outgoing.some((f) => f.id === e.defaultFlowId)) add("INVALID_DEFAULT_FLOW", "error", [e.id], "La salida predeterminada no pertenece a esta compuerta.");
          if (outgoing.length > 1) {
            for (const f of outgoing) if (f.id !== e.defaultFlowId && !f.condition?.body?.trim()) add("BRANCH_CONDITION_MISSING", profile === "formal" ? "error" : "warning", [e.id, f.id], "La rama tiene una etiqueta, pero no una condici\xF3n BPMN formal.");
          }
        }
      }
      for (const group of groups.values()) {
        const catches = group.filter((e) => e.type === "bpmn:IntermediateCatchEvent"), throws = group.filter((e) => e.type === "bpmn:IntermediateThrowEvent"), ids = group.map((e) => e.id);
        if (catches.length > 1) add("DUPLICATE_LINK_CATCH", "error", ids, "Hay varias entradas con igual nombre interno en el mismo \xE1mbito.");
        if (!catches.length || !throws.length) add("INCOMPLETE_LINK_PAIR", profile === "formal" ? "error" : "warning", ids, "Falta la entrada o la salida del enlace en el mismo proceso o subproceso.");
      }
    }
    if (geometry) {
      for (const e of elements) {
        const connection = /(?:Flow|Association)$/.test(e.type) || Boolean(e.sourceId || e.targetId);
        if (connection && !(e.waypoints?.length > 1 && e.waypoints.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)))) coverage.missingRoutes.push(e.id);
        else if (!connection && !containers.has(e.type) && !(Number.isFinite(e.x) && Number.isFinite(e.y) && e.width > 0 && e.height > 0)) coverage.missingFigureBounds.push(e.id);
        const external = e.externalLabelExpected ?? (Boolean(e.name?.trim()) && /(?:Event|Gateway|Flow|Reference)$/.test(e.type));
        if (external && !(e.labelBounds && Number.isFinite(e.labelBounds.x) && Number.isFinite(e.labelBounds.y) && e.labelBounds.width > 0 && e.labelBounds.height > 0)) coverage.missingLabelBounds.push(e.id);
      }
      for (const [key, message] of [["missingFigureBounds", "Faltan l\xEDmites de figuras."], ["missingRoutes", "Faltan recorridos completos."], ["missingLabelBounds", "Faltan l\xEDmites de etiquetas externas."]]) if (coverage[key].length) add("GEOMETRY_UNAVAILABLE", "warning", coverage[key], message + " La revisi\xF3n geom\xE9trica es parcial.", { coverage: key });
      const nodes = elements.filter((e) => Number.isFinite(e.x) && Number.isFinite(e.y) && e.width > 0 && e.height > 0 && !containers.has(e.type) && !e.waypoints);
      const flows = elements.filter((e) => e.waypoints?.length > 1), labels = elements.filter((e) => e.labelBounds && !["bpmn:Group", "bpmn:Lane", "bpmn:Participant"].includes(e.type));
      const ancestors = (e) => {
        const ids = /* @__PURE__ */ new Set();
        for (let p = index.get(e.parentId); p && !ids.has(p.id); p = index.get(p.parentId)) ids.add(p.id);
        return ids;
      };
      for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        if (a.attachedToId !== b.id && b.attachedToId !== a.id && !ancestors(a).has(b.id) && !ancestors(b).has(a.id) && boxesOverlap(a, b)) add("FIGURE_OVERLAP", "warning", [a.id, b.id], "Las figuras se superponen.");
      }
      for (const f of flows) for (const n of nodes) if (![f.sourceId, f.targetId].includes(n.id) && segments(f).some(([a, b]) => lineHitsBox(a, b, n))) add("FLOW_THROUGH_FIGURE", "error", [f.id, n.id], "La l\xEDnea atraviesa una figura ajena.");
      for (let i = 0; i < flows.length; i++) for (let j = i + 1; j < flows.length; j++) {
        const a = flows[i], b = flows[j];
        for (const [p, q] of segments(a)) for (const [r, s] of segments(b)) {
          const hit = segmentContact(p, q, r, s);
          if (!hit) continue;
          const shared = [a.sourceId, a.targetId].some((id) => id && [b.sourceId, b.targetId].includes(id));
          const endpoint = (f) => hit.point && [f.waypoints[0], f.waypoints.at(-1)].some((p2) => pointEqual(p2, hit.point));
          if (hit.type === "contact" && shared && endpoint(a) && endpoint(b)) continue;
          add(hit.type === "overlap" ? "LINE_OVERLAP" : hit.type === "crossing" ? "LINE_CROSSING" : "UNINTENDED_CONTACT", "warning", [a.id, b.id], "Las conexiones se superponen, cruzan o se tocan fuera de un extremo compartido.", hit.point ? { point: hit.point } : {});
        }
      }
      for (let i = 0; i < labels.length; i++) {
        const e = labels[i], bounds = e.labelBounds;
        for (const f of flows) if (segments(f).some(([a, b]) => lineHitsBox(a, b, bounds))) add("LABEL_OVER_LINE", "warning", [e.id, f.id], "Una etiqueta se superpone a una l\xEDnea.");
        for (const n of nodes) if (n.id !== e.id && boxesOverlap(bounds, n)) add("LABEL_OVER_FIGURE", "warning", [e.id, n.id], "Una etiqueta se superpone a una figura.");
        for (const other of labels.slice(i + 1)) if (boxesOverlap(bounds, other.labelBounds)) add("LABEL_OVERLAP", "warning", [e.id, other.id], "Dos etiquetas se superponen.");
      }
    }
    return { source, coverage, profile, valid: errors === 0, complete: !snapshot.elementsTruncated && !snapshot.elementsFiltered && detected <= maxIssues && !Object.values(coverage).some((value) => Array.isArray(value) && value.length), issues, totalIssues: detected, errors, warnings, scope: "active-sheet", businessApproval: false };
  }
  function compareSnapshots(before, after) {
    const previous = new Map((before.elements || []).map((e) => [e.id, e])), current = new Map((after.elements || []).map((e) => [e.id, e]));
    const fields = ["type", "name", "documentation", "parentId", "flowScopeId", "sourceId", "targetId", "x", "y", "width", "height", "waypoints", "labelBounds", "semanticProperties", "defaultFlowId", "condition", "eventDefinitions"];
    return { added: [...current.keys()].filter((id) => !previous.has(id)), removed: [...previous.keys()].filter((id) => !current.has(id)), changed: [...previous].filter(([id]) => current.has(id)).map(([id, a]) => ({ id, fields: fields.filter((key) => JSON.stringify(a[key]) !== JSON.stringify(current.get(id)[key])) })).filter((e) => e.fields.length) };
  }
  function planOperations(snapshot, operations) {
    const state = new Map((snapshot.elements || []).map((e) => [e.id, structuredClone(e)])), result = [], skipped = [];
    for (const [i, operation] of operations.entries()) {
      const e = state.get(operation.elementId), op = structuredClone(operation);
      let noOp = false;
      if (e) {
        if (op.type === "label") {
          noOp = e.name === op.text && (!op.bounds || JSON.stringify(e.labelBounds) === JSON.stringify(op.bounds));
          e.name = op.text;
          if (op.bounds) e.labelBounds = op.bounds;
        }
        if (op.type === "documentation") {
          noOp = e.documentation === op.text;
          e.documentation = op.text;
        }
        if (op.type === "route") {
          noOp = JSON.stringify(e.waypoints) === JSON.stringify(op.waypoints);
          e.waypoints = op.waypoints;
        }
        if (op.type === "move" && !op.parentId) {
          noOp = op.dx === 0 && op.dy === 0;
          e.x += op.dx;
          e.y += op.dy;
        }
        if (op.type === "properties") {
          noOp = Object.entries(op.values).every(([key, value]) => e.semanticProperties?.[key] === value);
          e.semanticProperties = { ...e.semanticProperties, ...op.values };
        }
      }
      if (noOp) skipped.push(i);
      else {
        result.push(op);
        if (!["label", "documentation", "route"].includes(op.type)) state.clear();
        else if (op.type === "route" && e) delete e.labelBounds;
      }
    }
    return { sourceRevision: snapshot.revision, originalCount: operations.length, operations: result, skippedIndices: skipped, batchSizeLimit: 50 };
  }
  return __toCommonJS(audit_exports);
})();
