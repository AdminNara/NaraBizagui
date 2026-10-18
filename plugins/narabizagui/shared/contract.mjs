export const PROTOCOL_VERSION = 2;
export const BATCH_LIMIT = 50;
export const BATCH_OPERATIONS = ['label','documentation','create','connect','move','resize','move_elements','route','properties'];
export const BPMN_CREATE_TYPES = ['bpmn:Task','bpmn:ManualTask','bpmn:UserTask','bpmn:ServiceTask','bpmn:SendTask','bpmn:ReceiveTask','bpmn:ScriptTask','bpmn:BusinessRuleTask','bpmn:SubProcess','bpmn:CallActivity','bpmn:StartEvent','bpmn:EndEvent','bpmn:IntermediateCatchEvent','bpmn:IntermediateThrowEvent','bpmn:ExclusiveGateway','bpmn:InclusiveGateway','bpmn:ParallelGateway','bpmn:ComplexGateway','bpmn:EventBasedGateway','bpmn:TextAnnotation','bpmn:DataObjectReference','bpmn:DataStoreReference','bpmn:Participant'];
export const EVENT_KINDS = {
  'bpmn:StartEvent': ['Message','Timer','Conditional','Signal'], 'bpmn:EndEvent': ['Message','Signal','Error','Escalation','Terminate','Compensate'],
  'bpmn:IntermediateCatchEvent': ['Message','Timer','Conditional','Link','Signal'], 'bpmn:IntermediateThrowEvent': ['Message','Signal','Escalation','Link','Compensate']
};
