import {createHash} from "node:crypto";
export class ExperimentEngine {
  constructor(){this.tests=new Map();}
  create(test){if(!test?.id||!Array.isArray(test.variants)||!test.variants.length)throw new TypeError("experiment requires id and variants");this.tests.set(test.id,{...test});return this.tests.get(test.id);}
  assign(testId,subjectId){const t=this.tests.get(testId);if(!t)throw new Error("EXPERIMENT_NOT_FOUND");const hash=createHash("sha256").update(testId+":"+subjectId).digest("hex");const n=parseInt(hash.slice(0,8),16)%t.variants.length;return t.variants[n];}
}