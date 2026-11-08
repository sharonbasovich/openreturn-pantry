// One disposable worker per job. Cancellation terminates CPU work, not just its UI.
export class CalculationCancelled extends Error {
  constructor() { super('Calculation cancelled. Applied data, results and drafts are unchanged.'); this.name='CalculationCancelled'; }
}
export function createCalculator(factory = () => new Worker(new URL('./calculation-worker.mjs', import.meta.url), {type:'module'})) {
  let active=null, sequence=0;
  return {
    get busy() { return active!==null; },
    cancel() { active?.finish(new CalculationCancelled()); },
    run(kind, scenario) {
      if(active)return Promise.reject(new Error('A calculation is already running.'));
      return new Promise((resolve,reject)=>{
        const id=++sequence;
        const job={worker:null,finish(error,result){
          if(active!==job)return;
          active=null;
          if(job.worker){job.worker.onmessage=null;job.worker.onerror=null;job.worker.onmessageerror=null;job.worker.terminate();}
          error?reject(error):resolve(result);
        }};
        active=job;
        try {
          job.worker=factory();
          job.worker.onmessage=event=>{
            if(active!==job||event.data?.id!==id)return;
            const data=event.data;
            if(data.ok===true&&data.result && typeof data.result==='object')job.finish(null,data.result);
            else job.finish(new Error(data.ok===false?String(data.error||'Calculation failed.'):'Invalid calculation response.'));
          };
          job.worker.onerror=event=>{event.preventDefault?.();job.finish(new Error('Calculation worker failed. Please retry.'));};
          job.worker.onmessageerror=()=>job.finish(new Error('Calculation response could not be read. Please retry.'));
          job.worker.postMessage({id,kind,scenario});
        } catch {job.finish(new Error('Background calculation is unavailable. Serve this app over HTTP in a browser with module-worker support, then retry. No changes were applied.'));}
      });
    }
  };
}
