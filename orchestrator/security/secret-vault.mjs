import {randomUUID,createCipheriv,createDecipheriv,createHash,randomBytes} from "node:crypto";

const encode=value=>Buffer.from(value).toString("base64url");
const decode=value=>Buffer.from(value,"base64url");

export class SecretVault{
  constructor({masterKey=process.env.APP_MASTER_KEY}={}){
    this.key=masterKey?createHash("sha256").update(masterKey).digest():randomBytes(32);
    this.items=new Map();
  }

  encrypt(value){
    const iv=randomBytes(12);
    const cipher=createCipheriv("aes-256-gcm",this.key,iv);
    const ciphertext=Buffer.concat([cipher.update(String(value),"utf8"),cipher.final()]);
    return {ciphertext:encode(ciphertext),iv:encode(iv),tag:encode(cipher.getAuthTag())};
  }

  decrypt(item){
    const decipher=createDecipheriv("aes-256-gcm",this.key,decode(item.iv));
    decipher.setAuthTag(decode(item.tag));
    return Buffer.concat([decipher.update(decode(item.ciphertext)),decipher.final()]).toString("utf8");
  }

  put(name,value){
    const id=randomUUID();
    const encrypted=this.encrypt(value);
    this.items.set(name,{id,...encrypted,version:1,rotatedAt:Date.now()});
    return {name,id,version:1};
  }

  get(name){
    const item=this.items.get(name);
    return item?this.decrypt(item):undefined;
  }

  rotate(name,value){
    const item=this.items.get(name);
    if(!item)return this.put(name,value);
    Object.assign(item,this.encrypt(value),{version:item.version+1,rotatedAt:Date.now()});
    return {name,id:item.id,version:item.version};
  }

  metadata(){
    return [...this.items].map(([name,item])=>({name,id:item.id,version:item.version,rotatedAt:item.rotatedAt}));
  }
}