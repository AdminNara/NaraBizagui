(() => {
  // node_modules/min-dash/dist/index.js
  var nativeToString = Object.prototype.toString;
  var nativeHasOwnProperty = Object.prototype.hasOwnProperty;
  function isUndefined(obj) {
    return obj === void 0;
  }
  function isNil(obj) {
    return obj == null;
  }
  function isArray(obj) {
    return nativeToString.call(obj) === "[object Array]";
  }
  function isFunction(obj) {
    const tag = nativeToString.call(obj);
    return tag === "[object Function]" || tag === "[object AsyncFunction]" || tag === "[object GeneratorFunction]" || tag === "[object AsyncGeneratorFunction]" || tag === "[object Proxy]";
  }
  function has(target, key) {
    return !isNil(target) && nativeHasOwnProperty.call(target, key);
  }
  function find(collection, matcher) {
    const matchFn = toMatcher(matcher);
    let match;
    forEach(collection, function(val, key) {
      if (matchFn(val, key)) {
        match = val;
        return false;
      }
    });
    return match;
  }
  function filter(collection, matcher) {
    const matchFn = toMatcher(matcher);
    let result = [];
    forEach(collection, function(val, key) {
      if (matchFn(val, key)) {
        result.push(val);
      }
    });
    return result;
  }
  function forEach(collection, iterator) {
    let val, result;
    if (isUndefined(collection)) {
      return;
    }
    const convertKey = isArray(collection) ? toNum : identity;
    for (let key in collection) {
      if (has(collection, key)) {
        val = collection[key];
        result = iterator(val, convertKey(key));
        if (result === false) {
          return val;
        }
      }
    }
  }
  function map(collection, fn) {
    let result = [];
    forEach(collection, function(val, key) {
      result.push(fn(val, key));
    });
    return result;
  }
  function toMatcher(matcher) {
    return isFunction(matcher) ? matcher : (e) => {
      return e === matcher;
    };
  }
  function identity(arg) {
    return arg;
  }
  function toNum(arg) {
    return Number(arg);
  }

  // node_modules/bpmn-js/lib/import/Util.js
  function elementToString(e) {
    if (!e) {
      return "<null>";
    }
    return "<" + e.$type + (e.id ? ' id="' + e.id : "") + '" />';
  }

  // node_modules/bpmn-js/lib/util/CompatibilityUtil.js
  var DI_ERROR_MESSAGE = "Tried to access di from the businessObject. The di is available through the diagram element only. For more information, see https://github.com/bpmn-io/bpmn-js/issues/1472";
  function ensureCompatDiRef(businessObject) {
    if (!has(businessObject, "di")) {
      Object.defineProperty(businessObject, "di", {
        enumerable: false,
        get: function() {
          throw new Error(DI_ERROR_MESSAGE);
        }
      });
    }
  }

  // node_modules/bpmn-js/lib/import/BpmnTreeWalker.js
  function is(element, type) {
    return element.$instanceOf(type);
  }
  function findDisplayCandidate(definitions) {
    return find(definitions.rootElements, function(e) {
      return is(e, "bpmn:Process") || is(e, "bpmn:Collaboration");
    });
  }
  function BpmnTreeWalker(handler) {
    var handledElements = {};
    var deferred = [];
    var diMap = {};
    function contextual(fn, ctx) {
      return function(e) {
        fn(e, ctx);
      };
    }
    function handled(element) {
      handledElements[element.id] = element;
    }
    function isHandled(element) {
      return handledElements[element.id];
    }
    function visit(element, ctx) {
      var gfx = element.gfx;
      if (gfx) {
        throw new Error(
          `already rendered ${elementToString(element)}`
        );
      }
      return handler.element(element, diMap[element.id], ctx);
    }
    function visitRoot(element, diagram) {
      return handler.root(element, diMap[element.id], diagram);
    }
    function visitIfDi(element, ctx) {
      try {
        var gfx = diMap[element.id] && visit(element, ctx);
        handled(element);
        return gfx;
      } catch (error) {
        logError(error.message, { element, error });
        console.error(`failed to import ${elementToString(element)}`, error);
      }
    }
    function logError(message, context) {
      handler.error(message, context);
    }
    var registerDi = this.registerDi = function registerDi2(di) {
      var bpmnElement = di.bpmnElement;
      if (bpmnElement) {
        if (diMap[bpmnElement.id]) {
          logError(
            `multiple DI elements defined for ${elementToString(bpmnElement)}`,
            { element: bpmnElement }
          );
        } else {
          diMap[bpmnElement.id] = di;
          ensureCompatDiRef(bpmnElement);
        }
      } else {
        logError(
          `no bpmnElement referenced in ${elementToString(di)}`,
          { element: di }
        );
      }
    };
    function handleDiagram(diagram) {
      handlePlane(diagram.plane);
    }
    function handlePlane(plane) {
      registerDi(plane);
      forEach(plane.planeElement, handlePlaneElement);
    }
    function handlePlaneElement(planeElement) {
      registerDi(planeElement);
    }
    this.handleDefinitions = function handleDefinitions(definitions, diagram) {
      var diagrams = definitions.diagrams;
      if (diagram && diagrams.indexOf(diagram) === -1) {
        throw new Error("diagram not part of <bpmn:Definitions />");
      }
      if (!diagram && diagrams && diagrams.length) {
        diagram = diagrams[0];
      }
      if (!diagram) {
        throw new Error("no diagram to display");
      }
      diMap = {};
      handleDiagram(diagram);
      var plane = diagram.plane;
      if (!plane) {
        throw new Error(
          `no plane for ${elementToString(diagram)}`
        );
      }
      var rootElement = plane.bpmnElement;
      if (!rootElement) {
        rootElement = findDisplayCandidate(definitions);
        if (!rootElement) {
          throw new Error("no process or collaboration to display");
        } else {
          logError(
            `correcting missing bpmnElement on ${elementToString(plane)} to ${elementToString(rootElement)}`
          );
          plane.bpmnElement = rootElement;
          registerDi(plane);
        }
      }
      var ctx = visitRoot(rootElement, plane);
      if (is(rootElement, "bpmn:Process") || is(rootElement, "bpmn:SubProcess")) {
        handleProcess(rootElement, ctx);
      } else if (is(rootElement, "bpmn:Collaboration")) {
        handleCollaboration(rootElement, ctx);
        handleUnhandledProcesses(definitions.rootElements, ctx);
      } else {
        throw new Error(
          `unsupported bpmnElement for ${elementToString(plane)}: ${elementToString(rootElement)}`
        );
      }
      handleDeferred(deferred);
    };
    var handleDeferred = this.handleDeferred = function handleDeferred2() {
      var fn;
      while (deferred.length) {
        fn = deferred.shift();
        fn();
      }
    };
    function handleProcess(process, context) {
      handleFlowElementsContainer(process, context);
      handleIoSpecification(process.ioSpecification, context);
      handleArtifacts(process.artifacts, context);
      handled(process);
    }
    function handleUnhandledProcesses(rootElements, ctx) {
      var processes = filter(rootElements, function(e) {
        return !isHandled(e) && is(e, "bpmn:Process") && e.laneSets;
      });
      processes.forEach(contextual(handleProcess, ctx));
    }
    function handleMessageFlow(messageFlow, context) {
      visitIfDi(messageFlow, context);
    }
    function handleMessageFlows(messageFlows, context) {
      forEach(messageFlows, contextual(handleMessageFlow, context));
    }
    function handleDataAssociation(association, context) {
      visitIfDi(association, context);
    }
    function handleDataInput(dataInput, context) {
      visitIfDi(dataInput, context);
    }
    function handleDataOutput(dataOutput, context) {
      visitIfDi(dataOutput, context);
    }
    function handleArtifact(artifact, context) {
      visitIfDi(artifact, context);
    }
    function handleArtifacts(artifacts, context) {
      forEach(artifacts, function(e) {
        if (is(e, "bpmn:Association")) {
          deferred.push(function() {
            handleArtifact(e, context);
          });
        } else {
          handleArtifact(e, context);
        }
      });
    }
    function handleIoSpecification(ioSpecification, context) {
      if (!ioSpecification) {
        return;
      }
      forEach(ioSpecification.dataInputs, contextual(handleDataInput, context));
      forEach(ioSpecification.dataOutputs, contextual(handleDataOutput, context));
    }
    var handleSubProcess = this.handleSubProcess = function handleSubProcess2(subProcess, context) {
      handleFlowElementsContainer(subProcess, context);
      handleArtifacts(subProcess.artifacts, context);
    };
    function handleFlowNode(flowNode, context) {
      var childCtx = visitIfDi(flowNode, context);
      if (is(flowNode, "bpmn:SubProcess")) {
        handleSubProcess(flowNode, childCtx || context);
      }
      if (is(flowNode, "bpmn:Activity")) {
        handleIoSpecification(flowNode.ioSpecification, context);
      }
      deferred.push(function() {
        forEach(flowNode.dataInputAssociations, contextual(handleDataAssociation, context));
        forEach(flowNode.dataOutputAssociations, contextual(handleDataAssociation, context));
      });
    }
    function handleSequenceFlow(sequenceFlow, context) {
      visitIfDi(sequenceFlow, context);
    }
    function handleDataElement(dataObject, context) {
      visitIfDi(dataObject, context);
    }
    function handleLane(lane, context) {
      deferred.push(function() {
        var newContext = visitIfDi(lane, context);
        if (lane.childLaneSet) {
          handleLaneSet(lane.childLaneSet, newContext || context);
        }
        wireFlowNodeRefs(lane);
      });
    }
    function handleLaneSet(laneSet, context) {
      forEach(laneSet.lanes, contextual(handleLane, context));
    }
    function handleLaneSets(laneSets, context) {
      forEach(laneSets, contextual(handleLaneSet, context));
    }
    function handleFlowElementsContainer(container, context) {
      handleFlowElements(container.flowElements, context);
      if (container.laneSets) {
        handleLaneSets(container.laneSets, context);
      }
    }
    function handleFlowElements(flowElements, context) {
      forEach(flowElements, function(flowElement) {
        if (is(flowElement, "bpmn:SequenceFlow")) {
          deferred.push(function() {
            handleSequenceFlow(flowElement, context);
          });
        } else if (is(flowElement, "bpmn:BoundaryEvent")) {
          deferred.unshift(function() {
            handleFlowNode(flowElement, context);
          });
        } else if (is(flowElement, "bpmn:FlowNode")) {
          handleFlowNode(flowElement, context);
        } else if (is(flowElement, "bpmn:DataObject")) {
        } else if (is(flowElement, "bpmn:DataStoreReference")) {
          handleDataElement(flowElement, context);
        } else if (is(flowElement, "bpmn:DataObjectReference")) {
          handleDataElement(flowElement, context);
        } else {
          logError(
            `unrecognized flowElement ${elementToString(flowElement)} in context ${elementToString(context && context.businessObject)}`,
            {
              element: flowElement,
              context
            }
          );
        }
      });
    }
    function handleParticipant(participant, context) {
      var newCtx = visitIfDi(participant, context);
      var process = participant.processRef;
      if (process) {
        handleProcess(process, newCtx || context);
      }
    }
    function handleCollaboration(collaboration, context) {
      forEach(collaboration.participants, contextual(handleParticipant, context));
      deferred.push(function() {
        handleMessageFlows(collaboration.messageFlows, context);
      });
      handleArtifacts(collaboration.artifacts, context);
    }
    function wireFlowNodeRefs(lane) {
      forEach(lane.flowNodeRef, function(flowNode) {
        var lanes = flowNode.get("lanes");
        if (lanes) {
          lanes.push(lane);
        }
      });
    }
  }

  // node_modules/bpmn-js/lib/util/ModelUtil.js
  function is2(element, type) {
    var bo = getBusinessObject(element);
    return bo && typeof bo.$instanceOf === "function" && bo.$instanceOf(type);
  }
  function getBusinessObject(element) {
    return element && element.businessObject || element;
  }

  // node_modules/bpmn-js/lib/import/Importer.js
  function importBpmnDiagram(diagram, definitions, bpmnDiagram) {
    var importer, eventBus, canvas;
    var error, warnings = [];
    function render(definitions2, bpmnDiagram2) {
      var visitor = {
        root: function(element, di) {
          return importer.add(element, di);
        },
        element: function(element, di, parentShape) {
          return importer.add(element, di, parentShape);
        },
        error: function(message, context) {
          warnings.push({ message, context });
        }
      };
      var walker = new BpmnTreeWalker(visitor);
      bpmnDiagram2 = bpmnDiagram2 || definitions2.diagrams && definitions2.diagrams[0];
      var diagramsToImport = getDiagramsToImport(definitions2, bpmnDiagram2);
      if (!diagramsToImport) {
        throw new Error("no diagram to display");
      }
      forEach(diagramsToImport, function(diagram2) {
        walker.handleDefinitions(definitions2, diagram2);
      });
      var rootId = bpmnDiagram2.plane.bpmnElement.id;
      canvas.setRootElement(
        canvas.findRoot(rootId + "_plane") || canvas.findRoot(rootId)
      );
    }
    return new Promise(function(resolve, reject) {
      try {
        importer = diagram.get("bpmnImporter");
        eventBus = diagram.get("eventBus");
        canvas = diagram.get("canvas");
        eventBus.fire("import.render.start", { definitions });
        render(definitions, bpmnDiagram);
        eventBus.fire("import.render.complete", {
          error,
          warnings
        });
        return resolve({ warnings });
      } catch (e) {
        e.warnings = warnings;
        return reject(e);
      }
    });
  }
  function getDiagramsToImport(definitions, bpmnDiagram) {
    if (!bpmnDiagram || !bpmnDiagram.plane) {
      return;
    }
    var bpmnElement = bpmnDiagram.plane.bpmnElement, rootElement = bpmnElement;
    if (!is2(bpmnElement, "bpmn:Process") && !is2(bpmnElement, "bpmn:Collaboration")) {
      rootElement = findRootProcess(bpmnElement);
    }
    var collaboration;
    if (is2(rootElement, "bpmn:Collaboration")) {
      collaboration = rootElement;
    } else {
      collaboration = find(definitions.rootElements, function(element) {
        if (!is2(element, "bpmn:Collaboration")) {
          return;
        }
        return find(element.participants, function(participant) {
          return participant.processRef === rootElement;
        });
      });
    }
    var rootElements = [rootElement];
    if (collaboration) {
      rootElements = map(collaboration.participants, function(participant) {
        return participant.processRef;
      });
      rootElements.push(collaboration);
    }
    var allChildren = selfAndAllFlowElements(rootElements);
    var diagramsToImport = [bpmnDiagram];
    var handledElements = [bpmnElement];
    forEach(definitions.diagrams, function(diagram) {
      if (!diagram.plane) {
        return;
      }
      var businessObject = diagram.plane.bpmnElement;
      if (allChildren.indexOf(businessObject) !== -1 && handledElements.indexOf(businessObject) === -1) {
        diagramsToImport.push(diagram);
        handledElements.push(businessObject);
      }
    });
    return diagramsToImport;
  }
  function selfAndAllFlowElements(elements) {
    var result = [];
    forEach(elements, function(element) {
      if (!element) {
        return;
      }
      result.push(element);
      result = result.concat(selfAndAllFlowElements(element.flowElements));
    });
    return result;
  }
  function findRootProcess(element) {
    var parent = element;
    while (parent) {
      if (is2(parent, "bpmn:Process")) {
        return parent;
      }
      parent = parent.$parent;
    }
  }

  // scripts/sheets-import-entry.js
  window.NaraImportBpmnDiagram = importBpmnDiagram;
})();
