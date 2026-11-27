const DRAFT="dev:draft",INDEX="dev:history:index",PREFIX="dev:history:",PREVIEW="dev:preview:";
export async function getDevDraft(env){const v=await env.PUSH_STORE.get(DRAFT,"json");return v?.config||null}
export async function putDevDraft(env,config){await env.PUSH_STORE.put(DRAFT,JSON.stringify({config,updatedAt:new Date().toISOString()}));return config}
export async function createDevPreviewToken(env,config){const token=crypto.randomUUID().replaceAll("-","");await env.PUSH_STORE.put(PREVIEW+token,JSON.stringify(config),{expirationTtl:900});return token}
export async function getDevPreview(env,token){if(!/^[a-f0-9]{32}$/i.test(String(token||"")))return null;return env.PUSH_STORE.get(PREVIEW+token,"json")}
export async function listDevHistory(env){const v=await env.PUSH_STORE.get(INDEX,"json");return Array.isArray(v)?v.slice(0,10):[]}
export async function getDevHistory(env,id){if(!/^[a-zA-Z0-9_-]{1,80}$/.test(String(id||"")))return null;return env.PUSH_STORE.get(PREFIX+id,"json")}
export async function addDevHistory(env,entry){const id=crypto.randomUUID().replaceAll("-","").slice(0,24),record={id,...entry,createdAt:new Date().toISOString()},old=await listDevHistory(env);await env.PUSH_STORE.put(PREFIX+id,JSON.stringify(record));const next=[record,...old].slice(0,10);await env.PUSH_STORE.put(INDEX,JSON.stringify(next));for(const x of old.slice(9))await env.PUSH_STORE.delete(PREFIX+x.id);return record}
const ICON_PENDING="dev:icon:pending";
export async function getDevIcon(env){return env.PUSH_STORE.get(ICON_PENDING,"json")}
export async function putDevIcon(env,icon){await env.PUSH_STORE.put(ICON_PENDING,JSON.stringify(icon));return icon}
export async function clearDevIcon(env){await env.PUSH_STORE.delete(ICON_PENDING)}

const ICON_PUBLISHED="dev:icon:published";
export async function getDevPublishedIcon(env){return env.PUSH_STORE.get(ICON_PUBLISHED,"json")}
export async function putDevPublishedIcon(env,icon){await env.PUSH_STORE.put(ICON_PUBLISHED,JSON.stringify(icon));return icon}
