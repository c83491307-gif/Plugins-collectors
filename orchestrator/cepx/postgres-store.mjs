import {createHash} from "node:crypto";

const MIGRATIONS = [
 {version:1,name:"cepx_state_store",sql:`
  CREATE TABLE IF NOT EXISTS cepx_state (
   namespace TEXT PRIMARY KEY,
   state JSONB NOT NULL,
   updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
 `}
];

const checksum = value => createHash("sha256").update(value).digest("hex");
const EMPTY_STATE = () => ({schema:1,projects:{}});

/**
 * PostgreSQL-backed CEPX state store.
 * A singleton JSONB document keeps the engine's domain model and JSON backend
 * semantics intact while PostgreSQL supplies cross-process transactions,
 * row locking, advisory serialization and durable commits.
 */
export class CEPXPostgresStore {
 constructor({pool,namespace="default",lockKey=0x43455058}={}){
  if(!pool || typeof pool.connect!=="function") throw Error("CEPX_POSTGRES_POOL_REQUIRED");
  this.pool=pool;this.namespace=namespace;this.lockKey=lockKey;this.migrationPromise=null;
 }
 async migrate(){
  if(this.migrationPromise)return this.migrationPromise;
  this.migrationPromise=(async()=>{
   const client=await this.pool.connect();
   try{
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)",[this.lockKey]);
    await client.query("CREATE TABLE IF NOT EXISTS cepx_schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
    for(const migration of MIGRATIONS){
     const digest=checksum(migration.sql);
     const prior=await client.query("SELECT name, checksum FROM cepx_schema_migrations WHERE version=$1",[migration.version]);
     if(prior.rowCount){
      if(prior.rows[0].name!==migration.name||prior.rows[0].checksum!==digest)throw Error("CEPX_MIGRATION_CHECKSUM_MISMATCH:"+migration.version);
      continue;
     }
     await client.query(migration.sql);
     await client.query("INSERT INTO cepx_schema_migrations(version,name,checksum) VALUES($1,$2,$3)",[migration.version,migration.name,digest]);
    }
    await client.query("COMMIT");
   }catch(error){await client.query("ROLLBACK").catch(()=>{});throw error;}
   finally{client.release();}
  })().catch(error=>{this.migrationPromise=null;throw error;});
  return this.migrationPromise;
 }
 async read(){
  await this.migrate();
  const result=await this.pool.query("SELECT state FROM cepx_state WHERE namespace=$1",[this.namespace]);
  if(!result.rowCount)return EMPTY_STATE();
  const state=result.rows[0].state;
  if(!state||state.schema!==1||!state.projects||typeof state.projects!=="object")throw Error("CEPX_STATE_CORRUPT");
  return state;
 }
 async transaction(fn){
  await this.migrate();
  const client=await this.pool.connect();
  try{
   await client.query("BEGIN");
   // Transaction-scoped lock serializes every writer, including across hosts.
   await client.query("SELECT pg_advisory_xact_lock($1)",[this.lockKey]);
   const selected=await client.query("SELECT state FROM cepx_state WHERE namespace=$1 FOR UPDATE",[this.namespace]);
   const state=selected.rowCount?selected.rows[0].state:EMPTY_STATE();
   if(!state||state.schema!==1||!state.projects||typeof state.projects!=="object")throw Error("CEPX_STATE_CORRUPT");
   const value=await fn(state);
   await client.query(
    "INSERT INTO cepx_state(namespace,state,updated_at) VALUES($1,$2::jsonb,NOW()) ON CONFLICT(namespace) DO UPDATE SET state=EXCLUDED.state, updated_at=EXCLUDED.updated_at",
    [this.namespace,JSON.stringify(state)]
   );
   await client.query("COMMIT");
   return value;
  }catch(error){await client.query("ROLLBACK").catch(()=>{});throw error;}
  finally{client.release();}
 }
 async close(){if(typeof this.pool.end==="function")await this.pool.end();}
}
