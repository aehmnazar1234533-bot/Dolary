const TTL=28800,COOKIE="dolary_dev_session";
const token=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,"0")).join("");
async function digest(v){const h=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));return Array.from(new Uint8Array(h),b=>b.toString(16).padStart(2,"0")).join("")}
function cookie(v,max){return COOKIE+"="+v+"; Max-Age="+max+"; Path=/; HttpOnly; Secure; SameSite=Strict"}
function equal(a,b){if(typeof a!=="string"||typeof b!=="string"||a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0}
export async function checkAdminPassword(v,env){return Boolean(env.ADMIN_PASSWORD&&typeof v==="string"&&equal(v,env.ADMIN_PASSWORD))}
export async function createDevSession(env){const raw=token(),hash=await digest(raw);await env.PUSH_STORE.put("dev:session:"+hash,JSON.stringify({createdAt:Date.now()}),{expirationTtl:TTL});return{setCookie:cookie(raw,TTL)}}
export async function verifyDevSession(req,env){if(!env.PUSH_STORE)return null;const h=req.headers.get("Cookie")||"",m=h.match(new RegExp("(?:^|;\\s*)"+COOKIE+"=([^;]+)"));if(!m)return null;const hash=await digest(m[1]);const v=await env.PUSH_STORE.get("dev:session:"+hash,"json");return v?{hash,...v}:null}
export async function destroyDevSession(req,env){const s=await verifyDevSession(req,env);if(s)await env.PUSH_STORE.delete("dev:session:"+s.hash);return{cookie:cookie("",0)}}