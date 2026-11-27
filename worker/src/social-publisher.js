import { buildSocialCardHtml, normalizeSocialRate, socialCaption, socialMarker, socialRateKey } from "./social-card.js";

const GRAPH_VERSION="v27.0";
const STATE_KEY="social:state";
const IMAGE_PREFIX="social:image:";
const PUBLISHED_PREFIX="social:published:";
const IMAGE_TTL=60*60*24*30;
const HISTORY_TTL=60*60*24*365*5;
const STALE_MS=20*60*1000;

export function socialPublishingEnabled(env){
  return Boolean(env.PUSH_STORE&&env.BROWSER&&env.META_PAGE_ID&&env.META_PAGE_ACCESS_TOKEN&&env.META_INSTAGRAM_BUSINESS_ACCOUNT_ID&&env.META_USER_ACCESS_TOKEN);
}
function imageKey(rate,slug){return IMAGE_PREFIX+slug+":"+socialRateKey(rate);}
function imageUrl(env,rate,slug){return String(env.SOCIAL_IMAGE_BASE_URL||"").replace(/\/$/,"")+"/api/social-image/"+encodeURIComponent(slug)+"/"+encodeURIComponent(socialRateKey(rate))+".jpg";}
function historyKey(rate,slug){return PUBLISHED_PREFIX+slug+":"+socialRateKey(rate);}
function errInfo(data,status){const e=data&&data.error;return {status,code:(e&&e.code)??null,subcode:(e&&e.error_subcode)??null,type:(e&&e.type)??null,message:e&&e.message?String(e.message).slice(0,300):"Meta API request failed"};}

async function meta(path,params,token,method="POST"){
  const u=new URL("https://graph.facebook.com/"+GRAPH_VERSION+"/"+path.replace(/^\//,""));
  const form=new URLSearchParams();
  for(const [k,v] of Object.entries(params||{}))if(v!==undefined&&v!==null)form.set(k,String(v));
  if(method==="GET"){form.set("access_token",token);u.search=form.toString();}
  const r=await fetch(u,{method,headers:method==="GET"?{"Accept":"application/json"}:{"Content-Type":"application/x-www-form-urlencoded"},body:method==="GET"?undefined:form,signal:AbortSignal.timeout(12000)});
  let d=null;try{d=await r.json();}catch(_){}
  if(!r.ok||d?.error){const e=new Error(errInfo(d,r.status).message);e.meta=errInfo(d,r.status);throw e;}
  return d||{};
}

async function renderImage(env,rate,province,slug){
  const html=buildSocialCardHtml(rate,province,env.SOCIAL_LOGO_URL||"https://aehamtech.top/dolary/dolary-mark.svg");
  const response=await env.BROWSER.quickAction("screenshot",{
    html,
    viewport:{width:1080,height:1350,deviceScaleFactor:1},
    screenshotOptions:{type:"jpeg",quality:94,fullPage:true}
  });
  const bytes=await response.arrayBuffer();
  const key=imageKey(rate,slug);
  await env.PUSH_STORE.put(key,bytes,{expirationTtl:IMAGE_TTL});
  return {key,url:imageUrl(env,rate,slug)};
}

async function findFacebook(env,marker){
  try{
    const d=await meta(env.META_PAGE_ID+"/feed",{fields:"id,message,created_time",limit:25},env.META_PAGE_ACCESS_TOKEN,"GET");
    return (d.data||[]).find(x=>typeof x.message==="string"&&x.message.includes(marker))?.id||null;
  }catch(e){console.warn("Facebook duplicate check failed:",e.message);return null;}
}
async function publishFacebook(env,url,caption,marker){
  const existing=await findFacebook(env,marker);if(existing)return {id:existing,deduped:true};
  const d=await meta(env.META_PAGE_ID+"/photos",{url,caption,published:"true"},env.META_PAGE_ACCESS_TOKEN);
  if(!d.id)throw new Error("Facebook API returned no photo id");
  return {id:d.id,deduped:false};
}

async function findInstagram(env,marker){
  try{
    const d=await meta(env.META_INSTAGRAM_BUSINESS_ACCOUNT_ID+"/media",{fields:"id,caption,timestamp",limit:25},env.META_USER_ACCESS_TOKEN,"GET");
    return (d.data||[]).find(x=>typeof x.caption==="string"&&x.caption.includes(marker))?.id||null;
  }catch(e){console.warn("Instagram duplicate check failed:",e.message);return null;}
}
async function waitInstagram(env,id){
  for(let i=0;i<6;i++){
    await new Promise(r=>setTimeout(r,i===0?1500:2500));
    const d=await meta(id,{fields:"status_code,status"},env.META_USER_ACCESS_TOKEN,"GET");
    const s=String(d.status_code||d.status||"").toUpperCase();
    if(s==="FINISHED"||s==="PUBLISHED")return;
    if(s==="ERROR"||s==="EXPIRED")throw new Error("Instagram media container status: "+s);
  }
  throw new Error("Instagram media container did not become ready in time");
}
async function publishInstagram(env,url,caption,marker){
  const existing=await findInstagram(env,marker);if(existing)return {id:existing,deduped:true};
  const c=await meta(env.META_INSTAGRAM_BUSINESS_ACCOUNT_ID+"/media",{image_url:url,caption,media_type:"IMAGE"},env.META_USER_ACCESS_TOKEN);
  if(!c.id)throw new Error("Instagram API returned no creation id");
  await waitInstagram(env,c.id);
  const p=await meta(env.META_INSTAGRAM_BUSINESS_ACCOUNT_ID+"/media_publish",{creation_id:c.id},env.META_USER_ACCESS_TOKEN);
  if(!p.id)throw new Error("Instagram API returned no published media id");
  return {id:p.id,deduped:false};
}

export async function publishSocialRate(env,city,rate){
  if(!socialPublishingEnabled(env))return {enabled:false,skipped:"not_configured"};
  const n=normalizeSocialRate(rate);if(n==null)return {enabled:false,skipped:"invalid_rate"};
  const slug=String(city?.slug||env.SOCIAL_RATE_SLUG||"baghdad");
  const province=String(city?.name_ar||city?.province||city?.name||city?.label||"بغداد").slice(0,60);
  const hk=historyKey(n,slug);
  const old=await env.PUSH_STORE.get(hk,"json");
  if(old?.rate===n)return {enabled:true,skipped:"already_published",state:old};

  let state=await env.PUSH_STORE.get(STATE_KEY,"json");
  if(!state||state.slug!==slug||Number(state.rate)!==n){
    state={version:1,slug,province,rate:n,imageKey:null,imageUrl:null,facebook:{status:"pending",id:null,error:null},instagram:{status:"pending",id:null,error:null},createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  }
  if(!state.imageUrl||!state.imageKey){
    const image=await renderImage(env,n,province,slug);
    state.imageKey=image.key;state.imageUrl=image.url;state.updatedAt=new Date().toISOString();
    await env.PUSH_STORE.put(STATE_KEY,JSON.stringify(state));
  }
  const marker=socialMarker(n),caption=socialCaption(n,province)+"\n"+marker;
  for(const [platform,publish] of [
    ["facebook",()=>publishFacebook(env,state.imageUrl,caption,marker)],
    ["instagram",()=>publishInstagram(env,state.imageUrl,caption,marker)]
  ]){
    const ps=state[platform];
    if(ps?.id&&ps.status==="published")continue;
    if(ps?.status==="publishing"&&ps.updatedAt&&Date.now()-Date.parse(ps.updatedAt)<STALE_MS)continue;
    ps.status="publishing";ps.error=null;ps.updatedAt=new Date().toISOString();state.updatedAt=ps.updatedAt;
    await env.PUSH_STORE.put(STATE_KEY,JSON.stringify(state));
    try{
      const r=await publish();
      ps.status="published";ps.id=r.id;ps.deduped=Boolean(r.deduped);ps.error=null;
    }catch(e){
      ps.status="failed";ps.error=e?.meta||{message:String(e?.message||"unknown_error").slice(0,300)};
      console.error("Dolary social "+platform+" publish failed:",ps.error);
    }
    ps.updatedAt=new Date().toISOString();state.updatedAt=ps.updatedAt;
    await env.PUSH_STORE.put(STATE_KEY,JSON.stringify(state));
  }
  if(state.facebook.status==="published"&&state.instagram.status==="published"){
    await env.PUSH_STORE.put(hk,JSON.stringify({rate:n,slug,province,imageKey:state.imageKey,imageUrl:state.imageUrl,facebookId:state.facebook.id,instagramId:state.instagram.id,publishedAt:new Date().toISOString()}),{expirationTtl:HISTORY_TTL});
  }
  return {enabled:true,state};
}

export async function socialImageResponse(request,env){
  const m=new URL(request.url).pathname.match(/^\/api\/social-image\/([a-z0-9-]{1,40})\/(\d+)\.jpg$/i);
  if(!m)return null;
  const bytes=await env.PUSH_STORE?.get(IMAGE_PREFIX+m[1]+":"+m[2],"arrayBuffer");
  if(!bytes)return new Response("Not found",{status:404,headers:{"Cache-Control":"no-store"}});
  return new Response(bytes,{headers:{"Content-Type":"image/jpeg","Cache-Control":"public,max-age=2592000,immutable"}});
}
