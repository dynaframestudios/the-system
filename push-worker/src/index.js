import webpush from 'web-push';

const json=(data,status=200,origin='')=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','access-control-allow-origin':origin,'vary':'Origin','cache-control':'no-store'}});
function originFor(req,env){const origin=req.headers.get('origin')||'';return origin===env.APP_ORIGIN?origin:''}
function cors(req,env){const origin=originFor(req,env);return new Response(null,{status:204,headers:{'access-control-allow-origin':origin,'access-control-allow-methods':'GET,POST,DELETE,OPTIONS','access-control-allow-headers':'content-type,authorization','access-control-max-age':'600','vary':'Origin'}})}
async function hash(s){const bytes=new TextEncoder().encode(s);return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('')}
function validTime(t){return typeof t==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(t)}
function validTimezone(t){try{new Intl.DateTimeFormat('en',{timeZone:t});return true}catch{return false}}
function configure(env){if(!env.VAPID_PUBLIC||!env.VAPID_PRIVATE||!env.VAPID_SUBJECT)throw Error('Missing VAPID secrets');webpush.setVapidDetails(env.VAPID_SUBJECT,env.VAPID_PUBLIC,env.VAPID_PRIVATE)}
async function send(sub,payload,env){configure(env);return webpush.sendNotification(JSON.parse(sub.subscription),JSON.stringify(payload),{TTL:900,urgency:'normal'})}
async function handle(req,env){const origin=originFor(req,env);if(!origin)return json({error:'Origin not allowed'},403,'');const url=new URL(req.url);if(req.method==='GET'&&url.pathname==='/api/config')return json({publicKey:env.VAPID_PUBLIC},200,origin);
 if(!['/api/subscription','/api/test','/api/notification-prefs','/api/step-checkin'].includes(url.pathname))return json({error:'Not found'},404,origin);
 const token=(req.headers.get('authorization')||'').replace(/^Bearer /,'');if(token.length<32||token.length>200)return json({error:'Missing subscription token'},401,origin);const tokenHash=await hash(token);
 if(req.method==='DELETE'&&url.pathname==='/api/subscription'){await env.DB.prepare('DELETE FROM notification_preferences WHERE token_hash=?').bind(tokenHash).run();await env.DB.prepare('DELETE FROM subscriptions WHERE token_hash=?').bind(tokenHash).run();return json({ok:true},200,origin)}
 if(req.method==='POST'&&url.pathname==='/api/notification-prefs'){
  const sub=await env.DB.prepare('SELECT id FROM subscriptions WHERE token_hash=?').bind(tokenHash).first();
  if(!sub)return json({error:'Enable push first'},409,origin);
  let b;try{b=await req.json()}catch{return json({error:'Invalid JSON'},400,origin)}
  const keys=['steps','workout','gate','streak','hydration','trial'];
  if(!b||!validTime(b.reminderTime)||!validTime(b.quietStart)||!validTime(b.quietEnd)||!validTime(b.workoutTime)||!validTime(b.hydrationTime)||!Array.isArray(b.freeDays)||b.freeDays.length>7||b.freeDays.some(x=>!Number.isInteger(x)||x<0||x>6)||keys.some(k=>typeof b[k]!=='boolean'))return json({error:'Invalid notification preferences'},400,origin);
  const data=JSON.stringify({reminderTime:b.reminderTime,quietStart:b.quietStart,quietEnd:b.quietEnd,quietEnabled:!!b.quietEnabled,workoutTime:b.workoutTime,hydrationTime:b.hydrationTime,freeDays:[...new Set(b.freeDays)],...Object.fromEntries(keys.map(k=>[k,b[k]]))});
  await env.DB.prepare(`INSERT INTO notification_preferences(token_hash,prefs) VALUES(?,?) ON CONFLICT(token_hash) DO UPDATE SET prefs=excluded.prefs`).bind(tokenHash,data).run();
  return json({ok:true},200,origin);
 }
 if(req.method==='POST'&&url.pathname==='/api/step-checkin'){
  const sub=await env.DB.prepare('SELECT id FROM subscriptions WHERE token_hash=?').bind(tokenHash).first();if(!sub)return json({error:'Enable push first'},409,origin);
  let b;try{b=await req.json()}catch{return json({error:'Invalid JSON'},400,origin)}
  if(!b||!/^\d{4}-\d{2}-\d{2}$/.test(b.date)||typeof b.logged!=='boolean')return json({error:'Invalid check-in'},400,origin);
  // Date is a local calendar day; no numeric step data is ever uploaded.
  await env.DB.prepare('UPDATE notification_preferences SET steps_logged_date=? WHERE token_hash=?').bind(b.logged?b.date:null,tokenHash).run();return json({ok:true},200,origin)
 }

 if(req.method==='POST'&&url.pathname==='/api/subscription'){
  let b;try{b=await req.json()}catch{return json({error:'Invalid JSON'},400,origin)}
  const s=b.subscription,tz=b.timezone;
  if(!s||typeof s.endpoint!=='string'||!s.endpoint.startsWith('https://')||s.endpoint.length>2000||!s.keys?.p256dh||!s.keys?.auth||!validTimezone(tz)||!validTime(b.morningTime)||!validTime(b.eveningTime)||JSON.stringify(s).length>5000)return json({error:'Invalid subscription/preferences'},400,origin);
  const id=await hash(s.endpoint);const old=await env.DB.prepare('SELECT token_hash FROM subscriptions WHERE id=?').bind(id).first();if(old&&old.token_hash!==tokenHash)return json({error:'Subscription already registered with another device token'},409,origin);
  await env.DB.prepare(`INSERT INTO subscriptions(id,token_hash,subscription,tz,morning_enabled,morning_time,evening_enabled,evening_time) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET subscription=excluded.subscription,tz=excluded.tz,morning_enabled=excluded.morning_enabled,morning_time=excluded.morning_time,evening_enabled=excluded.evening_enabled,evening_time=excluded.evening_time`).bind(id,tokenHash,JSON.stringify(s),tz,b.morningEnabled?1:0,b.morningTime,b.eveningEnabled?1:0,b.eveningTime).run();return json({ok:true},200,origin)
 }
 if(req.method==='POST'&&url.pathname==='/api/test'){
  const sub=await env.DB.prepare('SELECT subscription FROM subscriptions WHERE token_hash=?').bind(tokenHash).first();if(!sub)return json({error:'No active subscription'},404,origin);
  try{await send(sub,{title:'THE SYSTEM · Connection established',body:'Background alerts are enabled on this device.',url:env.APP_ORIGIN},env);return json({ok:true},200,origin)}catch(e){return json({error:'Push send failed: '+(e.statusCode||'delivery error')},502,origin)}
 }
 return json({error:'Method not allowed'},405,origin)
}
async function scheduled(env){configure(env);const result=await env.DB.prepare('SELECT s.*,p.prefs AS v191_prefs,p.steps_logged_date FROM subscriptions s LEFT JOIN notification_preferences p ON p.token_hash=s.token_hash').all();for(const sub of result.results||[]){let date,time;try{const parts=new Intl.DateTimeFormat('en-CA',{timeZone:sub.tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));date=`${p.year}-${p.month}-${p.day}`;time=`${p.hour}:${p.minute}`}catch{continue}
  let prefs=null;try{prefs=sub.v191_prefs?JSON.parse(sub.v191_prefs):null}catch{}
  const withinQuiet=(t)=>{if(!prefs?.quietEnabled)return false;const a=prefs.quietStart,b=prefs.quietEnd;return a<b?t>=a&&t<b:(t>=a||t<b)};
  const now=new Date();const localParts=new Intl.DateTimeFormat('en-US',{timeZone:sub.tz,weekday:'short'}).format(now);
  const dayIndex=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(localParts);
  const notifyChoices=prefs?[['steps',prefs.reminderTime,'Have you logged your steps today?','Your weekly Hunter Movement goal is waiting. Log your daily total when you can.','growth'],['workout',prefs.workoutTime,'Training opportunity','Hunter, your training window is here. Move safely and respect recovery.','quests'],['gate',prefs.workoutTime,'A Gate may be waiting','You have free time today. Open The System to check for a Gate Event.','quests'],['streak',prefs.reminderTime,'Your progress awaits','You can still complete a manageable objective today. No pressure.','quests'],['hydration',prefs.hydrationTime,'Hydration check-in','Take a moment to drink when you need it and log your water.','growth'],['trial',prefs.reminderTime,'Hunter Trial check-in','Your active challenge is ready for a check-in when you have time.','quests']]:[];
  const countRow=await env.DB.prepare('SELECT COUNT(*) AS n FROM notification_delivery WHERE subscription_id=? AND marker LIKE ?').bind(sub.id,'%:'+date).first();
  let supplementalSent=Number(countRow?.n||0);for(const [kind,at,title,body,section] of notifyChoices){
   if(!prefs[kind]||!validTime(at)||at>time||withinQuiet(time)||supplementalSent>=2)continue;
   if((kind==='gate'||kind==='workout')&&!prefs.freeDays.includes(dayIndex))continue;
   if(kind==='steps'&&sub.steps_logged_date===date)continue;
   const marker=`${kind}:${date}`;
   const claim=await env.DB.prepare('INSERT OR IGNORE INTO notification_delivery(subscription_id,marker) VALUES(?,?)').bind(sub.id,marker).run();if(!claim.meta?.changes)continue;supplementalSent++;
   try{await send(sub,{title:'THE SYSTEM · '+title,body,url:env.APP_ORIGIN+'/#'+section,tag:marker},env)}catch(e){if([404,410].includes(e.statusCode))await env.DB.prepare('DELETE FROM subscriptions WHERE id=?').bind(sub.id).run();else console.error('Push failed',kind,e.statusCode||e.message)}
  }
  for(const kind of ['morning','evening']){if(!sub[kind+'_enabled']||sub[kind+'_time']>time||sub['last_'+kind]===date||withinQuiet(time))continue;
   // Mark before sending: duplicates are more disruptive than an occasional missed reminder.
   const result=await env.DB.prepare(`UPDATE subscriptions SET last_${kind}=? WHERE id=? AND (last_${kind} IS NULL OR last_${kind}!=?)`).bind(date,sub.id,date).run();if(!result.meta?.changes)continue;
   const payload=kind==='morning'?{title:'THE SYSTEM · Morning briefing',body:'Your missions await. Open The System to review today’s quests.'}:{title:'THE SYSTEM · Evening check-in',body:'Review today’s progress and unfinished missions.'};payload.url=env.APP_ORIGIN;
   try{await send(sub,payload,env)}catch(e){if([404,410].includes(e.statusCode))await env.DB.prepare('DELETE FROM subscriptions WHERE id=?').bind(sub.id).run();else console.error('Push failed',e.statusCode||e.message)}
  }
 }
}
export default {async fetch(req,env){if(req.method==='OPTIONS')return cors(req,env);try{return await handle(req,env)}catch(err){console.error(err);return json({error:'Service unavailable'},500,originFor(req,env))}},async scheduled(_event,env,ctx){ctx.waitUntil(scheduled(env))}};
