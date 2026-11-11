import {parentPort, workerData} from 'node:worker_threads';
globalThis.self={postMessage:message=>parentPort.postMessage(message)};
await import(workerData.module);
parentPort.on('message',message=>self.onmessage({data:message}));
