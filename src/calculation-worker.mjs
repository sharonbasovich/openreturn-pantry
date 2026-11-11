import { auditDecision, auditSensitivity } from './decision.mjs';
import { validateScenario } from './model.mjs';
// Exported for deterministic protocol tests; model/CLI APIs stay synchronous.
export function calculateRequest({id,kind,scenario}) {
  try {
    const normalized=validateScenario(scenario);
    if(kind==='comparison') {
      const decision=auditDecision(normalized);
      return {id,ok:true,result:{normalized,result:decision.comparison,decision}};
    }
    if(kind==='sensitivity')return {id,ok:true,result:auditSensitivity(normalized)};
    throw new Error('Unknown calculation kind.');
  } catch(error) { return {id,ok:false,error:error.message}; }
}
if(typeof self!=='undefined')self.onmessage=event=>self.postMessage(calculateRequest(event.data));
