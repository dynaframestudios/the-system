const KEY='the-system-save-v1';
const $=s=>document.querySelector(s);
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const dayGap=(a,b)=>Math.round((new Date(b+'T12:00:00')-new Date(a+'T12:00:00'))/86400000);
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rankFor=w=>w>=90?'E':w>=85?'D':w>=80?'C':w>=75?'B':w>=70?'A':'S';
const levelFor=x=>{let level=1,remaining=x;while(remaining>=40*level&&level<999){remaining-=40*level;level++}return {level,remaining,needed:40*level}};
const newState=()=>({version:1,created:today(),name:'',weight:99,goal:68,mode:'hybrid',trainingCycle:0,cycleDay:'',xp:0,coins:0,stats:{strength:1,endurance:1,discipline:1,intelligence:1,agility:1},quests:[],records:{},weighIns:[],logs:[],penalties:[],claimed:[],schedules:[],xpHistory:[],settings:{reminders:false,reminderTime:'20:00',morningTime:'08:00',morningReminders:false,penaltiesEnabled:true,graceDays:0,deadlineAlerts:false,deadlineLead:30}});

// V8 state lives inside the existing save key and is included in normal JSON backup.
function normalizeV8(input){const x=input&&typeof input==='object'?input:{};return {waterGoal:Number.isFinite(Number(x.waterGoal))&&Number(x.waterGoal)>=500&&Number(x.waterGoal)<=5000?Number(x.waterGoal):2000,water:x.water&&typeof x.water==='object'?x.water:{},fitness:Array.isArray(x.fitness)?x.fitness:[],recovery:x.recovery&&typeof x.recovery==='object'?x.recovery:{},waterAwarded:x.waterAwarded&&typeof x.waterAwarded==='object'?x.waterAwarded:{},lastWater:x.lastWater||null,reflections:Array.isArray(x.reflections)?x.reflections:[],ascended:!!x.ascended,ascendedAt:x.ascendedAt||null}}
let state;try{state={...newState(),...JSON.parse(localStorage.getItem(KEY)||'null')};}catch{state=newState()}
state.schedules=Array.isArray(state.schedules)?state.schedules:[];
state.xpHistory=Array.isArray(state.xpHistory)?state.xpHistory:[];
state.customAchievements=Array.isArray(state.customAchievements)?state.customAchievements:[];
state.unlocked=Array.isArray(state.unlocked)?state.unlocked:[];
state.lastBackup=state.lastBackup||null;
state.inbox=Array.isArray(state.inbox)?state.inbox:[];
state.v8=normalizeV8(state.v8);
state.settings={...newState().settings,...state.settings};
let tab='dashboard',toastTimer;
const inboxUnread=()=>state.inbox.filter(n=>!n.read).length;
function addInbox(title,body,kind='info',key=''){if(key&&state.inbox.some(n=>n.key===key))return false;state.inbox.unshift({id:crypto.randomUUID(),title,body,kind,key,date:new Date().toISOString(),read:false});state.inbox=state.inbox.slice(0,150);save();return true}

const save=()=>localStorage.setItem(KEY,JSON.stringify(state));
const log=(msg)=>{state.logs.unshift({date:new Date().toISOString(),msg});state.logs=state.logs.slice(0,150)};
const notify=msg=>{document.querySelector('.toast')?.remove();let n=document.createElement('div');n.className='toast';n.textContent=msg;document.body.append(n);clearTimeout(toastTimer);toastTimer=setTimeout(()=>n.remove(),3500)};
const award=(xp,stat,msg)=>{const oldLevel=levelFor(state.xp).level;state.xp+=xp;state.coins+=Math.max(1,Math.floor(xp/10));if(stat)state.stats[stat]=(state.stats[stat]||1)+1;state.xpHistory.unshift({date:new Date().toISOString(),xp,source:msg});state.xpHistory=state.xpHistory.slice(0,500);log(`+${xp} XP · ${msg}`);if(levelFor(state.xp).level>oldLevel){state.pendingLevel=levelFor(state.xp).level;log(`LEVEL UP · Level ${state.pendingLevel}`)}};
const baseQuests=[{id:'pushups',title:'20 push-ups',stat:'strength',xp:20,mode:'training'},{id:'situps',title:'20 sit-ups',stat:'strength',xp:20,mode:'training'},{id:'squats',title:'20 squats',stat:'endurance',xp:20,mode:'training'},{id:'walk',title:'10-minute walk or run',stat:'endurance',xp:25,mode:'training'},{id:'stretch',title:'30 minutes of gentle mobility or stretching',stat:'agility',xp:25,mode:'recovery'},{id:'code',title:'30 minutes of coding or focused study',stat:'intelligence',xp:25,mode:'both'},{id:'plan',title:'Plan tomorrow and tidy your space',stat:'discipline',xp:15,mode:'both'}];
const getCycle=()=>{const diff=Math.max(0,dayGap(state.created,today()));return Math.floor(diff/3)%2===0?'training':'recovery'};
const defaultQuests=()=>baseQuests.filter(q=>q.mode==='both'||q.mode===getCycle());
const weekday=(date)=>new Date(date+'T12:00:00').getDay();
const applies=(s,date)=>s.active!==false&&s.start<=date&&(s.repeat==='daily'||s.repeat==='weekly'&&weekday(date)===Number(s.weekday)||s.repeat==='once'&&s.start===date);
const scheduledFor=(date)=>state.schedules.filter(s=>applies(s,date)).map(s=>({id:'schedule-'+s.id,title:s.title,stat:s.stat,xp:s.xp,mode:'custom',done:false,deadline:s.deadline||'',scheduled:true}));
const freshQuests=(date)=>[...baseQuests.filter(q=>q.mode==='both'||q.mode===cycleFor(date)).map(q=>({...q,done:false})),...scheduledFor(date)];
const dateShift=(date,days)=>{const d=new Date(date+'T12:00:00');d.setDate(d.getDate()+days);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const cycleFor=(date)=>Math.floor(Math.max(0,dayGap(state.created,date))/3)%2===0?'training':'recovery';
function syncDay(){
 if(!state.name)return;
 const date=today();if(state.cycleDay===date)return;
 const start=state.cycleDay || state.created;
 // Settle every previously recorded day, not just the most recent one.
 for(const [day,r] of Object.entries(state.records)){
  if(day>=date||r.settled)continue;
  const misses=(r.quests||[]).filter(q=>!q.done&&!q.excused);
  if(misses.length&&state.settings?.penaltiesEnabled!==false){
   const prior=state.penalties.filter(q=>!q.done).length;const missCount=(r.quests||[]).filter(q=>!q.done&&!q.excused).length;
   state.penalties.push({id:crypto.randomUUID(),created:date,sourceDay:day,amount:misses.length,severity:prior>=3?'high':prior>=1?'medium':'low',title:`Recovery: ${misses.length} unfinished quest${misses.length===1?'':'s'} from ${day}`,task:prior>=3?'Complete a 15-minute planning and reset session':prior>=1?'Complete a 10-minute planning and reset session':'Review unfinished missions and write one actionable next step',done:false});
   log(`${misses.length} unfinished quest(s) from ${day} added to recovery queue`);
  }
  r.settled=true;
 }
 // Mark days missed while the app was closed as skipped, without manufacturing XP or punishment.
 const skipped=Math.max(0,dayGap(start,date)-1);
 if(skipped)log(`${skipped} day(s) passed while the app was closed; no automatic penalties assigned`);
 state.cycleDay=date;
 const old=state.records[date];
 state.quests=old?old.quests:freshQuests(date);
 updateRecord();save();
}

function updateRecord(){state.records[today()]={...(state.records[today()]||{}),quests:state.quests.map(q=>({...q})),type:getCycle()}}
const progress=()=>levelFor(state.xp);
const nav=[['habits','◉','Habits'],['inbox','♧','Notices'],['analytics','▥','Analytics'],['dashboard','⌂','Overview'],['quests','▣','Quests'],['planner','◷','Planner'],['status','◈','Status'],['rewards','✦','Rewards'],['settings','⚙','Settings']];
function questHtml(q){return `<div class="quest ${q.done?'done':''}"><div class="quest-main"><strong>${safe(q.title)}</strong><small>${safe(q.stat)} · ${q.scheduled?'Scheduled quest':q.mode==='custom'?'Personal quest':'Daily mission'}${q.deadline?' · Due '+safe(q.deadline):''}</small></div><span class="xp">+${q.xp} XP</span><button class="btn small ${q.done?'secondary':''}" data-action="quest" data-id="${safe(q.id)}" ${q.done?'disabled':''}>${q.done?'✓ Done':'Complete'}</button></div>`}
const percent=(a,b)=>Math.min(100,Math.max(0,Math.round(a/b*100)));
function streak(){let n=0;let d=new Date(today()+'T12:00:00');if(!state.records[today()]?.quests?.some(q=>q.done))d.setDate(d.getDate()-1);for(let i=0;i<365;i++){let key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;if(!state.records[key]?.quests?.some(q=>q.done))break;n++;d.setDate(d.getDate()-1)}return n}
function pageDashboard(){const p=progress(),completed=state.quests.filter(q=>q.done).length,all=state.quests.length;return `<section class="panel hero"><div class="hero-inner"><div><div class="eyebrow">[ SYSTEM ACTIVE ]</div><h1>Welcome back, ${safe(state.name)}</h1><p>Your awakening is in progress. Each quest moves you closer to the next version of yourself.</p><p class="week-label">${getCycle()==='training'?'⚔ TRAINING DAY':'✧ RECOVERY DAY'} · ${safe(today())}</p></div><div class="crest">${rankFor(state.weight)}</div></div></section><div class="section-head"><h2>Hunter overview</h2><span class="pill">Rank ${rankFor(state.weight)}</span></div><div class="grid three"><section class="panel stat-tile"><div class="muted">LEVEL</div><div class="number">${p.level}</div><div class="progress"><i style="width:${percent(p.remaining,p.needed)}%"></i></div><small>${p.remaining}/${p.needed} XP</small></section><section class="panel stat-tile"><div class="muted">TOTAL XP</div><div class="number">${state.xp}</div><small>Earned through action</small></section><section class="panel stat-tile"><div class="muted">STREAK</div><div class="number">${streak()} <small>days</small></div><small>Quest completion days</small></section></div><div class="section-head"><h2>Daily quests</h2><button class="btn ghost" data-tab="quests">View all →</button></div><section class="panel"><div class="spread"><span class="eyebrow">Daily objectives</span><span>${completed}/${all} complete</span></div><div class="progress"><i style="width:${percent(completed,all||1)}%"></i></div><div class="list" style="margin-top:15px">${state.quests.slice(0,5).map(questHtml).join('')||'<p class="empty">No quests scheduled.</p>'}</div></section><div class="section-head"><h2>Recent activity</h2></div><section class="panel">${state.logs.slice(0,5).map(l=>`<div class="log-item"><span>${safe(l.msg)}</span><small>${new Date(l.date).toLocaleDateString()}</small></div>`).join('')||'<p class="empty">Your journey begins today.</p>'}</section>`}
function pageQuests(){const p=state.penalties.filter(x=>!x.done);return `<div class="section-head"><h2>Quest board</h2><span class="pill">${getCycle()==='training'?'Training':'Recovery'} rotation</span></div><section class="panel"><div class="spread"><div><div class="eyebrow">Today's assignments</div><p class="footnote">Progress is saved on this device. Training and recovery alternate in 3-day blocks.</p></div><strong>${state.quests.filter(q=>q.done).length}/${state.quests.length}</strong></div><div class="list">${state.quests.map(questHtml).join('')}</div></section><div class="section-head"><h2>Personal quests</h2></div><section class="panel"><form id="quest-form"><div class="field"><label for="qtitle">Quest title</label><input class="input" id="qtitle" maxlength="100" required placeholder="E.g. Finish my assignment"></div><div class="form-row"><div class="field"><label for="qstat">Stat</label><select class="input" id="qstat"><option value="discipline">Discipline</option><option value="intelligence">Intelligence</option><option value="strength">Strength</option><option value="endurance">Endurance</option><option value="agility">Agility</option></select></div><div class="field"><label for="qxp">XP reward</label><select class="input" id="qxp"><option value="10">10 XP · Easy</option><option value="20" selected>20 XP · Normal</option><option value="30">30 XP · Challenging</option></select></div></div><button class="btn" type="submit">Add quest for today</button></form></section><div class="section-head"><h2>Penalty zone</h2><span class="pill red">${p.length} active</span></div><section class="panel">${p.length?p.map(q=>`<div class="quest"><div class="quest-main"><strong>${safe(q.title)}</strong><small>Severity: ${safe(q.severity||'low')} · ${safe(q.task||'Review missed quests and plan your next step')} · No XP loss</small></div><button class="btn small secondary" data-action="penalty" data-id="${safe(q.id)}">Resolve</button><button class="btn small ghost" data-action="excuse" data-id="${safe(q.id)}">Excuse</button></div>`).join(''):'<p class="empty">No penalties pending. Keep your commitments.</p>'}<p class="footnote">Unfinished quests become manageable recovery tasks when the next day begins. You can disable new recovery tasks in Settings. No XP loss, forced workouts, or punishment for days the app was closed.</p></section>`}
function pageStatus(){let p=progress();let history=state.weighIns.slice().reverse();return `<div class="section-head"><h2>Hunter status</h2></div><div class="grid two"><section class="panel"><span class="eyebrow">Current rank</span><div class="rank">${rankFor(state.weight)}</div><p>Rank is determined by your recorded weight thresholds. It is separate from your earned XP level.</p><div class="spread"><b>Level ${p.level}</b><small>${p.remaining} / ${p.needed} XP</small></div><div class="progress"><i style="width:${percent(p.remaining,p.needed)}%"></i></div></section><section class="panel"><span class="eyebrow">Weekly weigh-in</span><div class="big-stat">${Number(state.weight).toFixed(1)} <span>kg</span></div><p>Personal goal: ${Number(state.goal).toFixed(1)} kg</p><form id="weight-form"><div class="field"><label for="weight">Weight (kg)</label><input id="weight" class="input" type="number" min="20" max="500" step="0.1" value="${state.weight}" required></div><button class="btn" type="submit">Record weigh-in</button></form><small class="footnote">Weight is just one optional progress measure. Only record it when useful and appropriate.</small></section></div><div class="section-head"><h2>Attributes</h2></div><section class="panel">${Object.entries(state.stats).map(([s,v])=>`<div class="stat-bar"><span>${safe(s)}</span><div class="progress"><i style="width:${percent(v,Math.max(...Object.values(state.stats),10))}%"></i></div><b>${v}</b></div>`).join('')}</section><div class="section-head"><h2>Weigh-in history</h2></div><section class="panel">${history.map(w=>`<div class="log-item"><span>${safe(w.date)}</span><b>${Number(w.weight).toFixed(1)} kg</b></div>`).join('')||'<p class="empty">No weigh-ins yet.</p>'}</section>`}
function xpTimeline(){return `<div class="section-head"><h2>XP history</h2></div><section class="panel">${state.xpHistory.slice(0,35).map(x=>`<div class="log-item"><span>${safe(x.source)} · ${new Date(x.date).toLocaleString()}</span><b class="xp">+${x.xp} XP</b></div>`).join('')||'<p class="empty">Complete quests to generate a progression history.</p>'}</section>`}
function pageRewards(){let done=Object.values(state.records).flatMap(r=>r.quests||[]).filter(q=>q.done).length;let total=Object.values(state.records).flatMap(r=>r.quests||[]).length;let eligible=total>=10&&done/total>=.8;return `<div class="section-head"><h2>Rewards inventory</h2></div><div class="grid two"><section class="panel"><div class="eyebrow">Earned coins</div><div class="big-stat">${state.coins} <span>coins</span></div><p>Coins are in-app milestones, not currency.</p></section><section class="panel"><div class="eyebrow">Quest completion</div><div class="big-stat">${total?percent(done,total):0}<span>%</span></div><p>${done} of ${total} recorded quests completed</p></section></div><div class="section-head"><h2>Achievement vault</h2></div><div class="grid two"><section class="panel"><span class="pill ${state.xp>=100?'green':''}">${state.xp>=100?'Unlocked':'Locked'}</span><h3>First Awakening</h3><p>Earn 100 total XP.</p></section><section class="panel"><span class="pill ${streak()>=7?'green':''}">${streak()>=7?'Unlocked':'Locked'}</span><h3>Seven-Day Resolve</h3><p>Complete at least one quest for 7 consecutive days.</p></section><section class="panel"><span class="pill ${eligible?'green':''}">${eligible?'Unlocked':'Locked'}</span><h3>Cheat Meal Ticket</h3><p>Recognition for 80% quest completion after at least 10 logged assignments. Personal reward; no food rules enforced.</p></section><section class="panel"><span class="pill ${rankFor(state.weight)==='S'?'green':''}">${rankFor(state.weight)==='S'?'Unlocked':'Locked'}</span><h3>Shadow Monarch</h3><p>Reach the S-rank threshold defined in your plan.</p></section></div>${xpTimeline()}${achievementEditor()}`}
function pagePlanner(){const opts=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];return `<div class="section-head"><h2>Quest scheduler</h2><span class="pill">${state.schedules.filter(x=>x.active!==false).length} active plans</span></div><section class="panel"><div class="eyebrow">Create recurring mission</div><p>Scheduled missions automatically appear on their assigned day, even if you close the app. A mission is generated when you next open The System.</p><form id="schedule-form"><div class="field"><label for="sched-title">Mission name</label><input id="sched-title" class="input" maxlength="100" placeholder="Example: Review coursework" required></div><div class="form-row"><div class="field"><label for="sched-repeat">Repeat</label><select id="sched-repeat" class="input"><option value="daily">Every day</option><option value="weekly">Every week</option><option value="once">One time</option></select></div><div class="field"><label for="sched-weekday">Weekly day</label><select id="sched-weekday" class="input">${opts.map((x,i)=>`<option value="${i}" ${i===weekday(today())?'selected':''}>${x}</option>`).join('')}</select></div></div><div class="form-row"><div class="field"><label for="sched-start">First date</label><input id="sched-start" class="input" type="date" value="${today()}" required></div><div class="field"><label for="sched-deadline">Deadline time (optional)</label><input id="sched-deadline" class="input" type="time"></div></div><div class="form-row"><div class="field"><label for="sched-stat">Attribute</label><select id="sched-stat" class="input">${Object.keys(state.stats).map(s=>`<option value="${s}">${s}</option>`).join('')}</select></div><div class="field"><label for="sched-xp">Difficulty</label><select id="sched-xp" class="input"><option value="10">Easy · 10 XP</option><option value="20" selected>Normal · 20 XP</option><option value="30">Hard · 30 XP</option></select></div></div><button class="btn" type="submit">Schedule mission</button></form></section><div class="section-head"><h2>Your schedule</h2></div><section class="panel"><div class="list">${state.schedules.map(s=>`<div class="quest"><div class="quest-main"><strong>${safe(s.title)}</strong><small>${s.repeat==='weekly'?opts[s.weekday]:s.repeat==='daily'?'Daily':'Once'} · From ${safe(s.start)}${s.deadline?' · '+safe(s.deadline):''} · ${s.xp} XP ${s.active===false?'· Paused':''}</small></div><button class="btn small secondary" data-action="toggle-schedule" data-id="${safe(s.id)}">${s.active===false?'Resume':'Pause'}</button><button class="btn small danger" data-action="delete-schedule" data-id="${safe(s.id)}">Delete</button></div>`).join('')||'<p class="empty">No missions scheduled yet.</p>'}</div><p class="footnote">Editing your schedule does not change missions already assigned for previous days.</p></section>`}
function pageInbox(){return `<div class="section-head"><h2>System notification center</h2><span class="pill">${inboxUnread()} unread</span></div><section class="panel"><p class="footnote">Reminders and mission deadlines are recorded here while the app runs. Browser alerts are optional. For guaranteed alerts when the app is completely closed, a separate push service is required.</p><div class="top-actions"><button class="btn secondary" data-action="read-all">Mark all read</button><button class="btn ghost" data-action="clear-read">Clear read notices</button><button class="btn secondary" data-action="test-alert">Send test notice</button></div><div class="list">${state.inbox.map(n=>`<div class="quest ${n.read?'done':''}"><div class="quest-main"><strong>${safe(n.title)}</strong><p>${safe(n.body)}</p><small>${safe(new Date(n.date).toLocaleString())} · ${safe(n.kind)}</small></div>${n.read?'':`<button class="btn small secondary" data-action="read-notice" data-id="${safe(n.id)}">Read</button>`}</div>`).join('')||'<p class="empty">No System notices yet.</p>'}</div></section>`}
function pageSettings(){return `<div class="section-head"><h2>System settings</h2></div><section class="panel"><form id="settings-form"><div class="field"><label for="setname">Hunter name</label><input class="input" id="setname" maxlength="50" value="${safe(state.name)}" required></div><div class="field"><label for="setgoal">Personal goal weight (kg)</label><input class="input" id="setgoal" type="number" min="20" max="500" step="0.1" value="${state.goal}"></div><button class="btn" type="submit">Save settings</button></form></section><div class="section-head"><h2>System alerts & accountability</h2></div><section class="panel"><form id="alert-form"><div class="field"><label for="reminder-time">Daily reminder time (your device time)</label><input class="input" type="time" id="reminder-time" value="${safe(state.settings?.reminderTime||'20:00')}"></div><div class="field"><label for="morning-time">Morning assignment reminder</label><input class="input" type="time" id="morning-time" value="${safe(state.settings?.morningTime||'08:00')}"></div><div class="field"><label><input type="checkbox" id="morning-reminders" ${state.settings?.morningReminders?'checked':''}> Enable morning check-in alerts</label></div><div class="field"><label><input type="checkbox" id="enable-reminders" ${state.settings?.reminders?'checked':''}> Enable in-app daily reminders</label></div><div class="field"><label><input type="checkbox" id="enable-penalties" ${state.settings?.penaltiesEnabled!==false?'checked':''}> Create recovery tasks for unfinished daily quests</label></div><div class="field"><label><input type="checkbox" id="deadline-alerts" ${state.settings?.deadlineAlerts?'checked':''}> Enable scheduled quest deadline alerts</label></div><div class="field"><label for="deadline-lead">Advance warning</label><select class="input" id="deadline-lead"><option value="15" ${Number(state.settings?.deadlineLead)===15?'selected':''}>15 minutes</option><option value="30" ${Number(state.settings?.deadlineLead||30)===30?'selected':''}>30 minutes</option><option value="60" ${Number(state.settings?.deadlineLead)===60?'selected':''}>60 minutes</option></select></div><div class="top-actions"><button class="btn" type="submit">Save alert preferences</button><button class="btn secondary" type="button" data-action="test-alert">Test notification</button></div></form><p class="footnote">Browser alerts require permission and normally work only while The System is open. For closed-app morning and evening reminders, enable V6 Background Push below and keep your deployed Cloudflare Worker configured. In-app deadline alerts require the app to be open. Your recovery tasks never subtract XP.</p></section><div class="section-head"><h2>System audio</h2></div><section class="panel"><p>Original synth sound effects play when you interact with the app. iPhone Web Push alert tones are controlled by iOS and cannot be replaced by website code.</p><div class="field"><label><input id="sfx-enabled" type="checkbox" ${window.SystemAudio?.get().enabled?'checked':''}> Enable interface sound effects</label></div><div class="field"><label for="sfx-volume">Effect volume</label><input class="input" type="range" id="sfx-volume" min="0" max="100" step="5" value="${window.SystemAudio?.get().volume??35}"></div><div class="field"><label for="sfx-profile">Sound style</label><select class="input" id="sfx-profile"><option value="arcane" ${window.SystemAudio?.get().profile==='arcane'?'selected':''}>Arcane / Hunter</option><option value="minimal" ${window.SystemAudio?.get().profile==='minimal'?'selected':''}>Minimal</option></select></div><div class="top-actions"><button class="btn secondary" data-action="test-sound" data-sound="quest" type="button">▶ Quest sound</button><button class="btn secondary" data-action="test-sound" data-sound="level" type="button">▶ Level up</button><button class="btn secondary" data-action="test-sound" data-sound="warning" type="button">▶ Warning</button></div><p class="footnote">Sounds work after you interact with the app. Silent Mode, browser audio permissions, and device volume can affect playback.</p></section><div class="section-head"><h2>Data control</h2></div><section class="panel"><p>All progress stays in this browser's local storage. It is not synced between devices. Export a backup before clearing browser data or changing phones.</p><p class="footnote">Last exported backup: ${safe(state.lastBackup?new Date(state.lastBackup).toLocaleString():'Not yet exported')} · Recommended: weekly</p><div class="top-actions"><button class="btn" data-action="export">Export JSON backup</button><label class="btn secondary" for="import-file" style="margin:0;cursor:pointer">Import backup</label><input id="import-file" type="file" accept="application/json,.json" class="sr-only"><button class="btn danger" data-action="reset">Reset all progress</button></div><hr class="divider"><p class="footnote">The System works offline after its first successful installation. There are no accounts, third-party analytics, or subscriptions.</p></section>`}

function questTotals(){const entries=Object.values(state.records||{}).flatMap(r=>r.quests||[]);return {done:entries.filter(q=>q.done).length,total:entries.length}}
function achievementsMetric(metric){const totals=questTotals();return metric==='quests'?totals.done:metric==='streak'?streak():metric==='level'?progress().level:state.xp}
function achievementEditor(){return `<div class="section-head"><h2>Custom achievements</h2></div><section class="panel"><form id="achievement-form"><div class="field"><label for="achievement-title">Achievement title</label><input id="achievement-title" class="input" maxlength="70" required placeholder="E.g. Architect of Discipline"></div><div class="form-row"><div class="field"><label for="achievement-metric">Milestone type</label><select id="achievement-metric" class="input"><option value="quests">Completed quests</option><option value="xp">Total XP</option><option value="level">Hunter level</option><option value="streak">Current streak</option></select></div><div class="field"><label for="achievement-target">Target</label><input id="achievement-target" class="input" type="number" min="1" max="100000" value="10" required></div></div><button class="btn" type="submit">Create achievement</button></form></section><div class="grid two">${state.customAchievements.map(a=>`<section class="panel"><span class="pill ${achievementsMetric(a.metric)>=a.target?'green':''}">${achievementsMetric(a.metric)>=a.target?'Unlocked':'Locked'}</span><h3>${safe(a.title)}</h3><p>${achievementsMetric(a.metric)} / ${a.target} ${safe(a.metric)}</p><button class="btn small secondary" data-action="delete-achievement" data-id="${safe(a.id)}">Delete</button></section>`).join('')}</div>`}
function pageAnalytics(){const days=Array.from({length:7},(_,i)=>dateShift(today(),i-6));const counts=days.map(day=>{let quests=state.records[day]?.quests||[];return {day,done:quests.filter(q=>q.done).length,total:quests.length}});const max=Math.max(1,...counts.map(d=>d.total));const xp7=(state.xpHistory||[]).filter(e=>e.date.slice(0,10)>=days[0]).reduce((a,e)=>a+Number(e.xp||0),0);const all=questTotals();return `<div class="section-head"><h2>Hunter analytics</h2><span class="pill">Last seven days</span></div><div class="grid three"><section class="panel stat-tile"><div class="eyebrow">Weekly XP</div><div class="number">${xp7}</div></section><section class="panel stat-tile"><div class="eyebrow">Quests completed</div><div class="number">${all.done}</div></section><section class="panel stat-tile"><div class="eyebrow">Completion rate</div><div class="number">${all.total?percent(all.done,all.total):0}%</div></section></div><section class="panel"><h3>Seven-day activity</h3><div class="activity-chart">${counts.map(d=>`<div class="chart-col"><span>${d.done}/${d.total}</span><div class="chart-track"><i style="height:${d.total?Math.max(5,100*d.done/max):0}%"></i></div><small>${new Date(d.day+'T12:00:00').toLocaleDateString(undefined,{weekday:'short'})}</small></div>`).join('')}</div><p class="footnote">Days without saved assignments show 0/0; this is not treated as a failure.</p></section><section class="panel"><h3>Recovery queue</h3><p>${state.penalties.filter(p=>!p.done).length} pending · ${state.penalties.filter(p=>p.done).length} resolved or excused</p><h3>Recent XP awards</h3>${(state.xpHistory||[]).slice(0,12).map(e=>`<div class="log-item"><span>${safe(e.source)}</span><strong>+${Number(e.xp)||0} XP</strong></div>`).join('')||'<p class="empty">No XP history yet.</p>'}</section>`}
function showLevelUp(){window.SystemAudio?.play('level');const lvl=state.pendingLevel;state.pendingLevel=null;save();const overlay=document.createElement('div');overlay.className='level-overlay';overlay.innerHTML=`<section class="level-card" role="alertdialog" aria-label="Level up"><div class="eyebrow">[ SYSTEM NOTIFICATION ]</div><div class="level-glyph">✦</div><h2>LEVEL UP</h2><div class="level-number">${lvl}</div><p>Your effort has unlocked the next level.</p><button class="btn" id="dismiss-level">CONTINUE</button></section>`;document.body.append(overlay);overlay.querySelector('button').focus();overlay.querySelector('button').onclick=()=>overlay.remove();}

function shell(){syncDay();let title=tab==='dashboard'?'Awakening dashboard':nav.find(n=>n[0]===tab)?.[2];let pages={habits:pageHabits,inbox:pageInbox,analytics:pageAnalytics,dashboard:pageDashboard,quests:pageQuests,planner:pagePlanner,status:pageStatus,rewards:pageRewards,settings:pageSettings};$('#app').innerHTML=`<div class="app-shell"><aside class="side"><div class="brand">THE SYSTEM<span>AWAKENING</span></div><div class="nav">${nav.map(([id,ico,name])=>`<button class="nav-item ${tab===id?'active':''}" data-tab="${id}"><span>${ico}</span>${name}</button>`).join('')}</div></aside><main class="main"><div class="topline"><span class="system-tag">◈ THE SYSTEM</span><span>${safe(title)} · ${new Date().toLocaleDateString()} · ${inboxUnread()} unread notices</span></div>${pages[tab]()}</main><nav class="bottom-nav" aria-label="Main navigation">${nav.map(([id,ico,name])=>`<button class="${tab===id?'active':''}" data-tab="${id}"><span class="ico">${ico}</span>${name}</button>`).join('')}</nav></div>`}
function onboard(){document.querySelector('#app').innerHTML=`<main class="onboarding"><section class="panel onboarding-card"><header><div class="crest">✦</div><div class="eyebrow">SYSTEM NOTIFICATION</div><h1>THE AWAKENING</h1><p>Every quest is a choice. Every action shapes your story.</p></header><form id="start-form"><div class="field"><label for="name">What should the System call you?</label><input class="input" id="name" maxlength="50" placeholder="Hunter name" required autofocus></div><div class="form-row"><div class="field"><label for="startweight">Starting weight (kg)</label><input class="input" id="startweight" type="number" min="20" max="500" step="0.1" value="99" required></div><div class="field"><label for="goalweight">Personal goal (kg)</label><input class="input" id="goalweight" type="number" min="20" max="500" step="0.1" value="68" required></div></div><p class="footnote">You can update these anytime. Quests combine physical movement, study and personal discipline. Modify or skip exercise to suit your health and abilities.</p><button class="btn" style="width:100%" type="submit">ACCEPT THE SYSTEM</button></form></section></main>`}
function render(){state.name?shell():onboard();if(state.pendingLevel&&state.name)showLevelUp()}
$('#app').addEventListener('click',async e=>{const b=e.target.closest('[data-tab],[data-action]');if(!b)return;if(b.dataset.tab){tab=b.dataset.tab;render();return}const id=b.dataset.id;switch(b.dataset.action){case 'test-sound':{window.SystemAudio?.play(b.dataset.sound||'test');break}case 'read-notice':{const notice=state.inbox.find(n=>n.id===id);if(notice){notice.read=true;save();render()}break}case 'read-all':{state.inbox.forEach(n=>n.read=true);save();render();break}case 'clear-read':{state.inbox=state.inbox.filter(n=>!n.read);save();render();break}case 'test-alert':{showSystemAlert('SYSTEM NOTICE','Your daily quest reminder is ready.');break}case 'quest':{let q=state.quests.find(q=>q.id===id);if(!q||q.done)return;q.done=true;award(q.xp,q.stat,q.title);updateRecord();save();render();notify(`Quest complete! +${q.xp} XP`);break}case 'toggle-schedule':{const q=state.schedules.find(x=>x.id===id);if(q){q.active=q.active===false;save();render();notify('Schedule updated')}break}
case 'delete-schedule':{if(confirm('Delete this recurring schedule? Existing quest records will remain.')){state.schedules=state.schedules.filter(x=>x.id!==id);save();render()}break}
case 'excuse':{const q=state.penalties.find(x=>x.id===id);if(q&&!q.done){q.done=true;q.excused=true;log('Recovery task excused');save();render();notify('Task excused')}break}
case 'penalty':{let q=state.penalties.find(q=>q.id===id);if(q){q.done=true;log('Penalty resolved');save();render();notify('Penalty cleared')}}break;case 'export':{state.lastBackup=new Date().toISOString();save();const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`the-system-backup-${today()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);break}case 'delete-achievement':{state.customAchievements=state.customAchievements.filter(a=>a.id!==id);save();render();break}case 'reset':if(confirm('Erase all local System progress? Export a backup first.')){localStorage.removeItem(KEY);state=newState();state.v8=normalizeV8(null);tab='dashboard';render()}break}});
$('#app').addEventListener('submit',e=>{e.preventDefault();const id=e.target.id;if(id==='start-form'){state.name=$('#name').value.trim();if(!state.name)return;state.weight=Number($('#startweight').value);state.goal=Number($('#goalweight').value);state.weighIns.push({date:today(),weight:state.weight});log('Awakening accepted');save();render()}else if(id==='schedule-form'){
 const title=$('#sched-title').value.trim(),repeat=$('#sched-repeat').value,start=$('#sched-start').value;
 if(!title||!/^\d{4}-\d{2}-\d{2}$/.test(start))return;
 const entry={id:crypto.randomUUID(),title,repeat,start,weekday:Number($('#sched-weekday').value),deadline:$('#sched-deadline').value,stat:$('#sched-stat').value,xp:Number($('#sched-xp').value),active:true};
 state.schedules.push(entry);
 if(applies(entry,today())&&!state.quests.some(q=>q.id==='schedule-'+entry.id)){state.quests.push(scheduledFor(today()).find(q=>q.id==='schedule-'+entry.id));updateRecord()}
 save();render();notify('Mission scheduled');
 }else if(id==='achievement-form'){const title=$('#achievement-title').value.trim(),target=Number($('#achievement-target').value),metric=$('#achievement-metric').value;if(!title||!Number.isInteger(target)||target<1||target>100000)return;state.customAchievements.push({id:crypto.randomUUID(),title,metric,target});save();render();notify('Achievement added')}else if(id==='quest-form'){const title=$('#qtitle').value.trim();if(!title)return;state.quests.push({id:crypto.randomUUID(),title,stat:$('#qstat').value,xp:Number($('#qxp').value),mode:'custom',done:false});updateRecord();save();render();notify('Quest added')}else if(id==='weight-form'){let v=Number($('#weight').value);if(!Number.isFinite(v)||v<20||v>500)return;state.weight=v;state.weighIns.push({date:today(),weight:v});log(`Weigh-in recorded: ${v} kg`);save();render();notify('Weigh-in saved')}else if(id==='alert-form'){state.settings={...state.settings,reminders:$('#enable-reminders').checked,reminderTime:$('#reminder-time').value||'20:00',morningTime:$('#morning-time').value||'08:00',morningReminders:$('#morning-reminders').checked,penaltiesEnabled:$('#enable-penalties').checked,deadlineAlerts:$('#deadline-alerts').checked,deadlineLead:Number($('#deadline-lead').value)};save();render();notify('Alert preferences saved');if(state.settings.reminders||state.settings.morningReminders||state.settings.deadlineAlerts)requestNotifications();}else if(id==='settings-form'){state.name=$('#setname').value.trim()||state.name;state.goal=Number($('#setgoal').value)||state.goal;save();render();notify('Settings saved')}});
$('#app').addEventListener('change',async e=>{if(e.target.id!=='import-file')return;const file=e.target.files?.[0];if(!file)return;try{let obj=JSON.parse(await file.text());if(!obj||typeof obj.name!=='string'||!Array.isArray(obj.weighIns)||!Array.isArray(obj.quests)||!Number.isFinite(obj.xp))throw Error('Invalid System backup');if(!confirm('Replace all current progress with this backup?'))return;state={...newState(),...obj};state.settings={...newState().settings,...state.settings};state.schedules=Array.isArray(state.schedules)?state.schedules:[];state.xpHistory=Array.isArray(state.xpHistory)?state.xpHistory:[];state.customAchievements=Array.isArray(state.customAchievements)?state.customAchievements:[];state.unlocked=Array.isArray(state.unlocked)?state.unlocked:[];state.inbox=Array.isArray(state.inbox)?state.inbox:[];
state.v8=normalizeV8(state.v8);save();render();notify('Backup imported')}catch(err){notify('Backup could not be imported')}});
async function requestNotifications(){if('Notification'in window&&Notification.permission==='default')try{await Notification.requestPermission()}catch{}}
function showSystemAlert(title,body,kind='reminder',key=''){if(!addInbox(title,body,kind,key))return;notify(`${title}: ${body}`);if('Notification'in window&&Notification.permission==='granted'&&document.visibilityState==='visible')try{new Notification(title,{body,icon:'./assets/icon.svg',tag:'the-system-daily'})}catch{}}
function checkMorningReminder(){
 if(!state.name||!state.settings?.morningReminders)return;
 const now=new Date(),time=now.toTimeString().slice(0,5);
 if(time<(state.settings.morningTime||'08:00')||state.settings.lastMorning===today())return;
 state.settings.lastMorning=today();save();showSystemAlert('THE SYSTEM · Morning briefing',`${state.quests.length} missions assigned today. Your progression starts now.`,'morning','morning-'+today());
}
function checkDailyReminder(){
 if(!state.name||!state.settings?.reminders)return;
 const now=new Date(),current=now.toTimeString().slice(0,5),target=state.settings.reminderTime||'20:00';
 if(current<target||state.settings.lastReminder===today())return;
 const undone=state.quests.filter(q=>!q.done).length;
 if(undone){state.settings.lastReminder=today();save();showSystemAlert('THE SYSTEM · Daily check-in',`${undone} quest${undone===1?'':'s'} left today. Do what you reasonably can.`,'evening','evening-'+today())}
}
function checkQuestDeadlines(){
 if(!state.name||!state.settings.deadlineAlerts)return;
 const now=new Date(),clock=now.toTimeString().slice(0,5),lead=Number(state.settings.deadlineLead||30);
 for(const q of state.quests){
  if(q.done||!/^\d{2}:\d{2}$/.test(q.deadline||''))continue;
  const due=new Date(`${today()}T${q.deadline}:00`),minutes=(due-now)/60000;
  if(minutes>0&&minutes<=lead)showSystemAlert('QUEST DEADLINE APPROACHING',`${q.title} is due at ${q.deadline}.`,'deadline',`soon-${today()}-${q.id}`);
  else if(minutes<=0&&clock>=q.deadline)showSystemAlert('QUEST DEADLINE PASSED',`${q.title} is still incomplete. You can finish or adjust your plan.`,'deadline',`overdue-${today()}-${q.id}`);
 }
}

// V6 background push integration: only anonymous subscriptions and times leave the device.
const PUSH_TOKEN_KEY='the-system-push-token-v6';
function pushApi(){return String(window.THE_SYSTEM_PUSH_API||'').replace(/\/$/,'')}
function pushToken(){let t=localStorage.getItem(PUSH_TOKEN_KEY);if(!t){t=crypto.randomUUID()+crypto.randomUUID();localStorage.setItem(PUSH_TOKEN_KEY,t)}return t}
function decodeVapid(base64){const s=atob(base64.replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(s,c=>c.charCodeAt(0))}
async function pushRequest(path,method='POST',body){const response=await fetch(pushApi()+path,{method,headers:{'content-type':'application/json','authorization':'Bearer '+pushToken()},body:body?JSON.stringify(body):undefined});const data=await response.json();if(!response.ok)throw Error(data.error||'Push service error');return data}
async function pushEnable(){if(!pushApi())throw Error('Configure the Worker URL in push-config.js first');if(!('serviceWorker'in navigator)||!('PushManager'in window)||!('Notification'in window))throw Error('This browser does not support Web Push. On iPhone, install to Home Screen first.');const permission=await Notification.requestPermission();if(permission!=='granted')throw Error('Notification permission not granted');const registration=await navigator.serviceWorker.ready;const config=await pushRequest('/api/config','GET');let subscription=await registration.pushManager.getSubscription();if(!subscription)subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:decodeVapid(config.publicKey)});await pushRequest('/api/subscription','POST',{subscription:subscription.toJSON(),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone||'Africa/Johannesburg',morningEnabled:!!state.settings.morningReminders,morningTime:state.settings.morningTime||'08:00',eveningEnabled:!!state.settings.reminders,eveningTime:state.settings.reminderTime||'20:00'});localStorage.setItem('the-system-push-enabled','true');return true}
async function pushDisable(){if(pushApi())await pushRequest('/api/subscription','DELETE');const registration=await navigator.serviceWorker.ready;const sub=await registration.pushManager?.getSubscription();if(sub)await sub.unsubscribe();localStorage.removeItem('the-system-push-enabled')}
async function pushSync(){if(localStorage.getItem('the-system-push-enabled')==='true'&&pushApi()){try{await pushEnable()}catch(err){console.warn('Push sync failed',err)}}}
const originalPageSettings=pageSettings;
pageSettings=function(){return originalPageSettings()+`<div class="section-head"><h2>V6 · Background push</h2></div><section class="panel"><p>Morning and evening reminders can arrive while the app is closed once your Cloudflare Worker is configured. Requires permission and internet access. Device and browser support varies.</p><p class="footnote">Status: ${localStorage.getItem('the-system-push-enabled')==='true'?'Push enrolled on this device':'Not enrolled'} · ${pushApi()?'Worker configured':'Worker URL not set'}.</p><div class="top-actions"><button class="btn" data-action="push-enable">Enable background push</button><button class="btn secondary" data-action="push-test">Send test push</button><button class="btn danger" data-action="push-disable">Disable push</button></div><p class="footnote">Only an anonymous push endpoint, timezone, and reminder times are sent to the Worker. Quest details, body weight and XP stay local. No exact delivery-time guarantee.</p></section>`};
$('#app').addEventListener('click',async e=>{const el=e.target.closest('[data-action]');if(!el||!['push-enable','push-disable','push-test'].includes(el.dataset.action))return;try{el.disabled=true;if(el.dataset.action==='push-enable'){await pushEnable();notify('Background push enabled')}else if(el.dataset.action==='push-disable'){await pushDisable();notify('Background push disabled')}else{await pushRequest('/api/test');notify('Test push requested')}render()}catch(err){notify(err.message||'Push action failed')}finally{el.disabled=false}},true);
$('#app').addEventListener('submit',e=>{if(e.target.id==='alert-form')setTimeout(pushSync,100)},false);


// V8 — daily habits and optional fitness journal; no sexual habit data stored or transmitted.
const v8TodayWater=()=>Math.max(0,Number(state.v8.water[today()]||0));
const v8Goal=()=>state.v8.waterGoal;
const v8Dates=()=>Object.keys(state.v8.water).filter(d=>Number(state.v8.water[d])>=v8Goal()).length;
const v8SafeCount=(arr,condition)=>arr.filter(condition).length;
function v8Milestones(){
 const recordDays=Object.entries(state.records).filter(([d,r])=>(r.quests||[]).some(q=>q.done)).length;
 const exerciseDays=new Set(state.v8.fitness.map(f=>f.date)).size;
 const recoveryDays=Object.values(state.v8.recovery).filter(Boolean).length;
 const reflectionDays=new Set(state.v8.reflections.map(r=>r.date)).size;
 return [{label:'Hydration consistency',done:v8Dates(),required:7,detail:'Reach your chosen hydration target on 7 different days'},
 {label:'Measured training',done:exerciseDays,required:5,detail:'Record 5 separate days of controlled fitness sessions'},
 {label:'Recovery mastery',done:recoveryDays,required:3,detail:'Log 3 recovery days, including gentle rest'},
 {label:'Quest discipline',done:recordDays,required:10,detail:'Finish at least one quest on 10 different days'},
 {label:'Hunter reflection',done:reflectionDays,required:4,detail:'Write a short check-in on 4 different days'}];
}
function pageHabits(){
 const water=v8TodayWater(),goal=v8Goal(),pct=percent(water,goal),fitness=state.v8.fitness.slice().reverse().slice(0,8),rank=rankFor(state.weight),trials=v8Milestones(),eligible=rank==='S'&&trials.every(x=>x.done>=x.required);
 return `<div class="section-head"><h2>Daily Habits</h2><span class="pill">V8 · Reclamation</span></div>
 <div class="grid two"><section class="panel"><div class="eyebrow">HYDRATION PROTOCOL</div><div class="big-stat">${water}<span> / ${goal} ml</span></div><div class="progress"><i style="width:${pct}%"></i></div><p>${pct>=100?'Daily target met. Extra water does not earn extra XP.':'Add the water you drink as you go. No need to force extra water.'}</p><div class="top-actions"><button class="btn small" data-action="water" data-amount="150">+150 ml</button><button class="btn small" data-action="water" data-amount="250">+250 ml</button><button class="btn small" data-action="water" data-amount="500">+500 ml</button><button class="btn small secondary" data-action="water-undo">Undo last</button></div><form id="water-goal-form" style="margin-top:14px"><label for="water-goal">Personal daily target (ml)</label><div class="form-row"><input class="input" type="number" id="water-goal" min="500" max="5000" step="50" value="${goal}" required><button class="btn secondary" type="submit">Save target</button></div></form><p class="footnote">Water requirements vary. Drinks and water in food also contribute to hydration. The target is adjustable; avoid excessive intake. Hydration reward is capped at 10 XP once per day.</p></section>
 <section class="panel"><div class="eyebrow">RECOVERY LOG</div><h3>Rest counts as progress</h3><p>Recovery can mean rest, gentle mobility, or taking a lighter day. No forced exercise or penalty.</p><button class="btn ${state.v8.recovery[today()]?'secondary':''}" data-action="recovery" ${state.v8.recovery[today()]?'disabled':''}>${state.v8.recovery[today()]?'✓ Recovery logged today':'Log a recovery check-in'}</button><p class="footnote">${Object.values(state.v8.recovery).filter(Boolean).length} recovery days recorded. One 5 XP check-in per day.</p></section></div>
 <div class="section-head"><h2>Hunter evolution</h2></div><section class="panel"><p>Track your actual repetitions and effort. These are private measurements; no XP farming from repeated entries. Stop if you lose balance or technique.</p><form id="fitness-form"><div class="form-row"><div class="field"><label for="fit-type">Exercise</label><select id="fit-type" class="input"><option>Supported squats</option><option>Squats</option><option>Push-ups</option><option>Incline push-ups</option><option>Knee push-ups</option><option>Crunches</option><option>Walking</option><option>Other</option></select></div><div class="field"><label for="fit-reps">Reps or minutes</label><input class="input" id="fit-reps" type="number" min="1" max="1000" required placeholder="e.g. 8"></div></div><div class="form-row"><div class="field"><label for="fit-effort">Effort</label><select class="input" id="fit-effort"><option value="easy">Easy</option><option value="moderate" selected>Moderate</option><option value="hard">Hard but controlled</option></select></div><div class="field"><label for="fit-note">Note (optional)</label><input class="input" id="fit-note" maxlength="140" placeholder="Technique / rest taken"></div></div><button class="btn" type="submit">Save training record</button></form><div class="section-head"><h3>Recent training</h3></div>${fitness.length?fitness.map(f=>`<div class="log-item"><span>${safe(f.date)} · ${safe(f.type)} · ${safe(f.effort)}${f.note?' · '+safe(f.note):''}</span><b>${Number(f.reps)} ${f.type==='Walking'?'min':'reps'}</b></div>`).join(''):'<p class="empty">Your training journal starts with your next safe session.</p>'}</section>
 <div class="section-head"><h2>Hunter reflection</h2></div><section class="panel"><p>A short note about energy, training technique, or what you learned. No sensitive personal details required.</p><form id="reflection-form"><label for="reflect-note">Today’s observation</label><input id="reflect-note" class="input" maxlength="200" required placeholder="e.g. Squats felt more controlled with longer rest"><button type="submit" class="btn" style="margin-top:12px" ${state.v8.reflections.some(r=>r.date===today())?'disabled':''}>${state.v8.reflections.some(r=>r.date===today())?'✓ Reflected today':'Record today’s reflection'}</button></form><p class="footnote">One reflection per day. No XP rewards for repeat submissions.</p></section>
 <div class="section-head"><h2>${rank==='S'?'Classified transmission':'Classified objectives'}</h2></div><section class="panel">${rank!=='S'?`<div class="eyebrow">[ ACCESS RESTRICTED ]</div><h3>Further instructions are sealed.</h3><p>Continue growing at your own pace. The System will reveal what comes next if you qualify.</p>`:state.v8.ascended?`<div class="eyebrow">[ ASCENSION COMPLETE ]</div><h3>♛ ECLIPSE SOVEREIGN</h3><p>The hidden rank has been permanently unlocked. Continue your journey at your own pace.</p>`:`<div class="eyebrow">[ S-RANK VERIFIED · SPECIAL QUESTLINE ]</div><h3>THE FIVE TRIALS</h3><p>XP alone will not unlock the classified rank. No speedrunning or extra repetitions required.</p>${trials.map(x=>`<div class="trial"><div class="spread"><strong>${safe(x.label)}</strong><span class="pill ${x.done>=x.required?'green':''}">${Math.min(x.done,x.required)}/${x.required}</span></div><small>${safe(x.detail)}</small><div class="progress"><i style="width:${percent(x.done,x.required)}%"></i></div></div>`).join('')}<button class="btn" data-action="ascend" ${eligible?'':'disabled'}>${eligible?'Complete the final ascension':'Complete all five trials to unlock'}</button>`}</section>`;
}
// Capture V8 actions before the existing V7 button handler.
$('#app').addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(!b)return;const act=b.dataset.action;if(!['water','water-undo','recovery','ascend'].includes(act))return;e.stopImmediatePropagation();
 if(act==='water'){const amt=Number(b.dataset.amount);if(![150,250,500].includes(amt))return;const old=v8TodayWater(),next=Math.min(8000,old+amt);state.v8.water[today()]=next;state.v8.lastWater={date:today(),amount:next-old};if(old<v8Goal()&&next>=v8Goal()&&!state.v8.waterAwarded?.[today()]){state.v8.waterAwarded={...(state.v8.waterAwarded||{}),[today()]:true};award(10,'discipline','Hydration goal completed')}save();render();notify(`Water: ${next} ml`)}
 if(act==='water-undo'){const prev=state.v8.lastWater;if(prev?.date!==today()||!prev.amount)return notify('Nothing to undo today');state.v8.water[today()]=Math.max(0,v8TodayWater()-prev.amount);state.v8.lastWater=null;save();render();notify('Last water entry undone; any earned XP is retained')}
 if(act==='recovery'){if(state.v8.recovery[today()])return;state.v8.recovery[today()]=true;award(5,'agility','Recovery check-in');save();render();notify('Recovery logged')}
 if(act==='ascend'){if(state.v8.ascended||rankFor(state.weight)!=='S'||!v8Milestones().every(x=>x.done>=x.required))return;state.v8.ascended=true;state.v8.ascendedAt=new Date().toISOString();log('ECLIPSE SOVEREIGN ascension');addInbox('CLASSIFIED ASCENSION','The five trials are complete. ECLIPSE SOVEREIGN unlocked.','achievement','v8-ascension');save();render();window.SystemAudio?.play('level');notify('♛ ECLIPSE SOVEREIGN · ASCENSION COMPLETE')}
},true);
$('#app').addEventListener('submit',e=>{const id=e.target.id;if(!['water-goal-form','fitness-form','reflection-form'].includes(id))return;e.preventDefault();e.stopImmediatePropagation();
 if(id==='water-goal-form'){const val=Number($('#water-goal').value);if(!Number.isFinite(val)||val<500||val>5000)return notify('Choose a goal from 500 to 5000 ml');state.v8.waterGoal=val;save();render();notify('Hydration goal updated')}
 if(id==='fitness-form'){const reps=Number($('#fit-reps').value),type=$('#fit-type').value,effort=$('#fit-effort').value,note=$('#fit-note').value.trim();if(!Number.isInteger(reps)||reps<1||reps>1000)return;state.v8.fitness.push({date:today(),type,reps,effort,note});state.v8.fitness=state.v8.fitness.slice(-500);save();render();notify('Training record saved')}
 if(id==='reflection-form'){if(state.v8.reflections.some(r=>r.date===today()))return;const note=$('#reflect-note').value.trim();if(!note)return;state.v8.reflections.push({date:today(),note});state.v8.reflections=state.v8.reflections.slice(-365);award(5,'discipline','Daily reflection');save();render();notify('Reflection saved')}
},true);

render();document.addEventListener('visibilitychange',()=>{if(!document.hidden){syncDay();render();checkDailyReminder();checkMorningReminder();checkQuestDeadlines()}});setInterval(()=>{syncDay();checkDailyReminder();checkMorningReminder();checkQuestDeadlines()},60000);checkDailyReminder();checkMorningReminder();checkQuestDeadlines();if('serviceWorker'in navigator&&location.protocol!=='file:')window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));


/* ===== V8.5 HUNTER AWAKENING ===== */
const APP_PUBLIC_VERSION='1.9.0';
function normalizeV85(input){
 const x=input&&typeof input==='object'?input:{};
 return {
  initialized:!!x.initialized,
  profile:(x.profile&&typeof x.profile==='object')?x.profile:{objective:'hybrid',fitnessLevel:'beginner',duration:20,equipment:'none',freeDays:[1,3,5],weeklyStepGoal:35000},
  steps:(x.steps&&typeof x.steps==='object')?x.steps:{},
  stepAwards:(x.stepAwards&&typeof x.stepAwards==='object')?x.stepAwards:{},
  weeklyStepAwards:(x.weeklyStepAwards&&typeof x.weeklyStepAwards==='object')?x.weeklyStepAwards:{},
  events:(x.events&&typeof x.events==='object')?x.events:{},
  supportTotal:Number.isFinite(Number(x.supportTotal))?Number(x.supportTotal):0
 };
}
state.v85=normalizeV85(state.v85);
if(state.name && !state.v85.initialized){
 state.v85.initialized=true;
 state.v85.profile={...state.v85.profile,objective:'hybrid',fitnessLevel:'beginner',duration:20,equipment:'none',freeDays:[1,3,5],weeklyStepGoal:state.v85.profile.weeklyStepGoal||35000};
 save();
}
const nav85=[['home','⌂','Home'],['quests','▣','Quests'],['growth','✦','Growth'],['hunter','◈','Hunter']];
if(!nav85.some(n=>n[0]===tab))tab='home';
const dayNames=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const todayWeekday=()=>weekday(today());
function weekStart(date=today()){
 const d=new Date(date+'T12:00:00');
 const diff=(d.getDay()+6)%7; // Monday start
 d.setDate(d.getDate()-diff);
 return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function weekDates(date=today()){
 const s=weekStart(date);
 return Array.from({length:7},(_,i)=>dateShift(s,i));
}
function weekKey(date=today()){return weekStart(date)}
function weeklyStepGoal(){return Number(state.v85.profile.weeklyStepGoal||35000)}
function stepsFor(date=today()){return Math.max(0,Number(state.v85.steps[date]||0))}
function stepTotalForWeek(date=today()){
 return weekDates(date).reduce((a,d)=>a+stepsFor(d),0)
}
function dailyStepShare(){return Math.max(1500,Math.round(weeklyStepGoal()/7))}
function ensureStepAwards(forDate=today()){
 const dailyKey=forDate;
 if(stepsFor(forDate)>=dailyStepShare() && !state.v85.stepAwards[dailyKey]){
  state.v85.stepAwards[dailyKey]=true;
  award(10,'endurance','Daily movement goal reached');
  log(`Daily movement goal reached: ${stepsFor(forDate)} steps`);
 }
 const wk=weekKey(forDate);
 if(stepTotalForWeek(forDate)>=weeklyStepGoal() && !state.v85.weeklyStepAwards[wk]){
  state.v85.weeklyStepAwards[wk]=true;
  award(60,'endurance','Weekly step goal completed');
  addInbox('HUNTER MOVEMENT COMPLETE',`You reached your weekly step goal of ${weeklyStepGoal().toLocaleString()} steps.` ,'achievement','steps-'+wk);
 }
}
function fitnessPreset(){
 const lvl=state.v85.profile.fitnessLevel||'beginner';
 return {
  beginner:{push:'8 modified push-ups',core:'10 crunches',squat:'10 supported squats',walk:'10-minute walk',stretch:'10 minutes of mobility',xp:18},
  intermediate:{push:'12 push-ups',core:'15 crunches',squat:'15 squats',walk:'15-minute walk or run',stretch:'12 minutes of mobility',xp:22},
  advanced:{push:'20 push-ups',core:'20 crunches',squat:'20 squats',walk:'20-minute run or fast walk',stretch:'15 minutes of mobility',xp:26}
 }[lvl]||{push:'8 modified push-ups',core:'10 crunches',squat:'10 supported squats',walk:'10-minute walk',stretch:'10 minutes of mobility',xp:18};
}
function hunterObjective(){return state.v85.profile.objective||'hybrid'}
function isFreeDay(date=today()){
 const free=(state.v85.profile.freeDays||[]).map(Number);
 return free.includes(weekday(date));
}
function v85FreshQuests(date=today()){
 const p=fitnessPreset();
 const mode=cycleFor(date);
 const obj=hunterObjective();
 const free=isFreeDay(date);
 const quests=[];
 const add=(id,title,stat,xp)=>quests.push({id:`${id}-${date}`,title,stat,xp,mode:'adaptive',done:false});
 if(obj==='fitness' || obj==='hybrid'){
  if(mode==='training' && free){
   add('push',p.push,'strength',p.xp);
   add('core',p.core,'strength',p.xp);
   add('squat',p.squat,'endurance',p.xp);
   add('walk',p.walk,'endurance',p.xp+4);
  }else{
   add('stretch',p.stretch,'agility',18);
   add('walk',p.walk,'endurance',20);
  }
 }
 if(obj==='productivity' || obj==='hybrid'){
  add('focus',`Focused work block · ${state.v85.profile.duration||20} minutes`,'intelligence',22);
  add('plan','Plan tomorrow and tidy your space','discipline',15);
 }
 if(!quests.length)add('choice','Complete one intentional task that moves you forward','discipline',20);
 const planned=scheduledFor(date).map(q=>({...q,id:`${q.id}-${date}`}));
 return [...quests,...planned];
}
function eventTemplates(){
 const baseDur=Math.max(10,Number(state.v85.profile.duration||20));
 const lvl=state.v85.profile.fitnessLevel||'beginner';
 const easy=lvl==='beginner';
 return [
  {title:'The Shadow Circuit',desc:`Move for ${Math.min(20,baseDur)} minutes and complete one short bodyweight circuit.`,xp:140,coins:35},
  {title:'Treasure Route',desc:`Hit ${Math.max(2000,Math.round(dailyStepShare()*0.75)).toLocaleString()} extra steps before midnight.`,xp:120,coins:28},
  {title:'Recovery Gate',desc:`Complete 12 minutes of mobility and log a recovery note.`,xp:110,coins:24},
  {title:easy?'Beginner Breakthrough':'Boss Interval',desc:easy?'Complete one beginner-friendly workout with controlled form.':'Complete an advanced bonus set or focused interval block.',xp:easy?130:180,coins:easy?30:42}
 ];
}
function ensureTodayEvent(){
 const d=today();
 if(state.v85.events[d])return state.v85.events[d];
 if(!isFreeDay(d))return null;
 const hash=[...d].reduce((a,c)=>a+c.charCodeAt(0),0)%100;
 if(hash>54)return null;
 const pool=eventTemplates();
 const tmpl=pool[hash%pool.length];
 const ev={id:crypto.randomUUID(),date:d,status:'pending',title:tmpl.title,desc:tmpl.desc,xp:tmpl.xp,coins:tmpl.coins};
 state.v85.events[d]=ev;
 addInbox('A GATE HAS OPENED',`${tmpl.title} is available today for bonus XP.`,'event','event-'+d);
 save();
 return ev;
}
const originalSyncDay=syncDay;
syncDay=function(){
 if(!state.name)return;
 const date=today();if(state.cycleDay===date)return;
 const start=state.cycleDay || state.created;
 for(const [day,r] of Object.entries(state.records)){
  if(day>=date||r.settled)continue;
  const misses=(r.quests||[]).filter(q=>!q.done&&!q.excused);
  if(misses.length&&state.settings?.penaltiesEnabled!==false){
   const prior=state.penalties.filter(q=>!q.done).length;
   state.penalties.push({id:crypto.randomUUID(),created:date,sourceDay:day,amount:misses.length,severity:prior>=3?'high':prior>=1?'medium':'low',title:`Recovery: ${misses.length} unfinished quest${misses.length===1?'':'s'} from ${day}`,task:prior>=3?'Complete a 15-minute planning and reset session':prior>=1?'Complete a 10-minute planning and reset session':'Review unfinished missions and write one actionable next step',done:false});
   log(`${misses.length} unfinished quest(s) from ${day} added to recovery queue`);
  }
  r.settled=true;
 }
 const skipped=Math.max(0,dayGap(start,date)-1);
 if(skipped)log(`${skipped} day(s) passed while the app was closed; no automatic penalties assigned`);
 state.cycleDay=date;
 const old=state.records[date];
 state.quests=old?old.quests:v85FreshQuests(date);
 updateRecord();
 ensureTodayEvent();
 ensureStepAwards(date);
 save();
}
function splashOnce(){
 if(document.querySelector('.splash-screen'))return;
 const overlay=document.createElement('div');
 overlay.className='splash-screen';
 overlay.innerHTML=`<div class="splash-logo"><img src="assets/icon.svg" alt="The System logo" class="splash-mark"><div class="splash-title">THE SYSTEM</div><div class="splash-sub">AWAKEN YOUR POTENTIAL</div><div class="splash-loading">INITIALIZING SYSTEM...</div><div class="splash-footer">by Dynaframe Studios · v ${APP_PUBLIC_VERSION}</div></div>`;
 document.body.append(overlay);
 setTimeout(()=>overlay.classList.add('hide'),1100);
 setTimeout(()=>overlay.remove(),1650);
}
function homeHero(){
 const p=progress();
 const done=state.quests.filter(q=>q.done).length;
 const total=state.quests.length||1;
 const ev=ensureTodayEvent();
 return `<section class="panel hero"><div class="hero-inner"><div><div class="eyebrow">[ HUNTER AWAKENING ]</div><h1>Welcome back, ${safe(state.name)}</h1><p>Your System now adapts to your profile. Complete your missions, grow your stats, and answer the Gates when they appear.</p><p class="week-label">${getCycle()==='training'?'⚔ TRAINING BLOCK':'✧ RECOVERY BLOCK'} · ${safe(today())}</p></div><div class="crest">${rankFor(state.weight)}</div></div></section>
 <div class="grid three"><section class="panel stat-tile"><div class="muted">LEVEL</div><div class="number">${p.level}</div><div class="progress"><i style="width:${percent(p.remaining,p.needed)}%"></i></div><small>${p.remaining}/${p.needed} XP</small></section><section class="panel stat-tile"><div class="muted">QUESTS TODAY</div><div class="number">${done}/${total}</div><small>${hunterObjective()} profile · ${isFreeDay(today())?'Free day':'Busy day'} plan</small></section><section class="panel stat-tile"><div class="muted">HUNTER COINS</div><div class="number">${state.coins}</div><small>Spend in future shop updates</small></section></div>
 ${ev?`<div class="section-head"><h2>Live Gate Event</h2><span class="pill">Bonus XP</span></div>${eventCard(ev)}`:''}`;
}
function eventCard(ev){
 if(!ev)return '';
 const controls = ev.status==='completed' ? `<span class="pill green">Completed</span>` : ev.status==='declined' ? `<span class="pill red">Declined</span>` : ev.status==='accepted' ? `<div class="top-actions"><button class="btn" data-action="complete-event">Complete event</button><button class="btn secondary" data-action="decline-event">Skip</button></div>` : `<div class="top-actions"><button class="btn" data-action="accept-event">Accept event</button><button class="btn secondary" data-action="decline-event">Decline</button></div>`;
 return `<section class="panel"><div class="spread"><div><div class="eyebrow">A GATE HAS OPENED</div><h3>${safe(ev.title)}</h3></div><span class="pill">+${ev.xp} XP · +${ev.coins} HC</span></div><p>${safe(ev.desc)}</p>${controls}<p class="footnote">Gate Events only appear on your selected free days. Ignoring or declining them never creates penalties.</p></section>`;
}
function pageHome85(){return homeHero()+`<div class="section-head"><h2>Today's missions</h2><button class="btn ghost" data-tab="quests">Open quest board →</button></div><section class="panel"><div class="list">${state.quests.slice(0,6).map(questHtml).join('')||'<p class="empty">No quests generated yet.</p>'}</div></section><div class="section-head"><h2>Recent activity</h2></div><section class="panel">${state.logs.slice(0,6).map(l=>`<div class="log-item"><span>${safe(l.msg)}</span><small>${new Date(l.date).toLocaleDateString()}</small></div>`).join('')||'<p class="empty">Your journey begins today.</p>'}</section>`}
function pageQuests85(){
 const activeEvent=ensureTodayEvent();
 return `${activeEvent?`<div class="section-head"><h2>Gate Event</h2><span class="pill">Optional</span></div>${eventCard(activeEvent)}`:''}${pageQuests()}<div class="section-head"><h2>Mission scheduler</h2></div>${pagePlanner()}<div class="section-head"><h2>75-Day Trials</h2><span class="pill">Preview mode</span></div><section class="panel"><div class="grid three"><div class="trial"><strong>75 Adapt</strong><small>Beginner-friendly, recovery-aware challenge path.</small></div><div class="trial"><strong>75 Discipline</strong><small>Balanced mode across fitness, habits and focused work.</small></div><div class="trial"><strong>75 Ascension</strong><small>Advanced trial for experienced Hunters with stricter milestones.</small></div></div><p class="footnote">This build introduces the challenge structure and economy direction. Full trial progression logic is reserved for the next dedicated release.</p></section>`
}
function stepPanel(){
 const days=weekDates();
 const total=stepTotalForWeek();
 const goal=weeklyStepGoal();
 return `<div class="section-head"><h2>Hunter movement</h2><span class="pill">Manual step tracking</span></div><section class="panel"><div class="grid two"><div><div class="eyebrow">Weekly steps</div><div class="big-stat">${total.toLocaleString()} <span>/ ${goal.toLocaleString()}</span></div><div class="progress"><i style="width:${percent(total,goal)}%"></i></div><p>Daily share target: ${dailyStepShare().toLocaleString()} steps. Enter your current total for the day; later entries replace earlier totals.</p><form id="step-form"><div class="form-row"><div class="field"><label for="step-date">Date</label><input class="input" type="date" id="step-date" value="${today()}" required></div><div class="field"><label for="step-total">Daily total steps</label><input class="input" type="number" id="step-total" min="0" max="150000" step="1" value="${stepsFor(today())}" required></div></div><div class="form-row"><div class="field"><label for="weekly-step-goal">Weekly goal</label><select class="input" id="weekly-step-goal"><option value="14000" ${goal===14000?'selected':''}>14 000</option><option value="21000" ${goal===21000?'selected':''}>21 000</option><option value="35000" ${goal===35000?'selected':''}>35 000</option><option value="49000" ${goal===49000?'selected':''}>49 000</option><option value="70000" ${goal===70000?'selected':''}>70 000</option></select></div><div class="field"><label>&nbsp;</label><button class="btn" type="submit">Save step total</button></div></div></form></div><div><div class="eyebrow">This week</div>${days.map(d=>`<div class="log-item"><span>${new Date(d+'T12:00:00').toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'})}</span><strong>${stepsFor(d).toLocaleString()}</strong></div>`).join('')}</div></div><p class="footnote">Daily movement awards 10 XP when you reach your daily share target. Reaching your weekly step goal awards 60 XP once per week.</p></section>`;
}
function economyPanel(){
 return `<div class="section-head"><h2>Hunter economy</h2><span class="pill">V8.5 bridge</span></div><section class="panel"><div class="grid three"><div class="trial"><strong>Quest Reroll</strong><small>Planned shop item · refresh one generated mission.</small></div><div class="trial"><strong>Half-Reps Pass</strong><small>Planned flexibility item for supported challenge modes.</small></div><div class="trial"><strong>Cheat Meal Ticket</strong><small>Planned challenge exception item for trial variants.</small></div></div><p class="footnote">XP remains progression. Hunter Coins remain spendable in-game currency. Real-money support is kept separate and optional.</p></section>`;
}
function pageGrowth85(){
 return `${stepPanel()}${pageHabits()}${pageStatus()}${pageAnalytics()}${economyPanel()}`;
}
function profileSummary(){
 const p=state.v85.profile;
 return `<div class="section-head"><h2>Hunter profile</h2><span class="pill">Public version ${APP_PUBLIC_VERSION}</span></div><section class="panel"><div class="grid two"><div><div class="eyebrow">Profile calibration</div><div class="log-item"><span>Objective</span><strong>${safe(p.objective)}</strong></div><div class="log-item"><span>Fitness level</span><strong>${safe(p.fitnessLevel)}</strong></div><div class="log-item"><span>Preferred session length</span><strong>${Number(p.duration)||20} min</strong></div><div class="log-item"><span>Equipment</span><strong>${safe(p.equipment)}</strong></div></div><div><div class="eyebrow">Availability</div>${(p.freeDays||[]).length?(p.freeDays||[]).map(d=>`<span class="pill" style="margin:0 6px 6px 0">${dayNames[Number(d)]}</span>`).join(''):'<p class="empty">No free days selected</p>'}<p class="footnote">These settings are currently established during onboarding. A full edit flow is planned for the next update.</p></div></div></section>`;
}
function supportPanel(){
 return `<div class="section-head"><h2>Support The System</h2><span class="pill">Optional</span></div><section class="panel"><p>Support features and real-money contributions are being introduced carefully. Gameplay progression, XP and secret-rank access will never be sold.</p><div class="grid three"><div class="trial"><strong>R25 support</strong><small>Future one-time contribution</small></div><div class="trial"><strong>R50 support</strong><small>Future one-time contribution</small></div><div class="trial"><strong>Custom amount</strong><small>Future hosted checkout via a secure backend</small></div></div><p class="footnote">No live payment checkout is active in this build. Keep payment secrets and checkout verification on a backend service, not in the static app.</p></section>`;
}
function startupBranding(){
 return `<div class="section-head"><h2>Application identity</h2><span class="pill">Dynaframe Studios</span></div><section class="panel"><div class="spread"><div><div class="eyebrow">Launch sequence</div><h3>THE SYSTEM</h3><p>Startup screen and footer branding now use the public version label for test distribution.</p></div><div class="pill">v ${APP_PUBLIC_VERSION}</div></div><p class="footnote">by Dynaframe Studios</p></section>`;
}
function pageHunter85(){
 return `${profileSummary()}${startupBranding()}${supportPanel()}${pageSettings()}`;
}
const originalOnboard=onboard;
onboard=function(){
 document.querySelector('#app').innerHTML=`<main class="onboarding"><section class="panel onboarding-card"><header><img src="assets/icon.svg" alt="The System logo" style="width:86px;height:86px;margin:0 auto 18px;display:block"><div class="eyebrow">SYSTEM NOTIFICATION</div><h1>HUNTER AWAKENING</h1><p>The System now calibrates itself to each Hunter before assigning quests.</p></header><form id="start-form"><div class="field"><label for="name">What should the System call you?</label><input class="input" id="name" maxlength="50" placeholder="Hunter name" required autofocus></div><div class="form-row"><div class="field"><label for="startweight">Starting weight (kg)</label><input class="input" id="startweight" type="number" min="20" max="500" step="0.1" value="99" required></div><div class="field"><label for="goalweight">Personal goal (kg)</label><input class="input" id="goalweight" type="number" min="20" max="500" step="0.1" value="68" required></div></div><div class="form-row"><div class="field"><label for="hunter-objective">Primary focus</label><select class="input" id="hunter-objective"><option value="hybrid">Hybrid · fitness + productivity</option><option value="fitness">Fitness</option><option value="productivity">Productivity / study</option></select></div><div class="field"><label for="fitness-level">Current fitness level</label><select class="input" id="fitness-level"><option value="beginner">Beginner / rebuilding</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select></div></div><div class="form-row"><div class="field"><label for="session-duration">Typical session length</label><select class="input" id="session-duration"><option value="10">10 min</option><option value="20" selected>20 min</option><option value="30">30 min</option><option value="45">45 min</option></select></div><div class="field"><label for="equipment-type">Equipment access</label><select class="input" id="equipment-type"><option value="none">None / bodyweight only</option><option value="basic">Basic home equipment</option><option value="gym">Gym access</option></select></div></div><div class="field"><label>Which days are usually free for extra training or random events?</label><div class="radio-row">${dayNames.map((d,i)=>`<label><input type="checkbox" name="freeDays" value="${i}" ${[1,3,5].includes(i)?'checked':''}> ${d.slice(0,3)}</label>`).join('')}</div></div><div class="form-row"><div class="field"><label for="weekly-steps">Weekly step goal</label><select class="input" id="weekly-steps"><option value="14000">14 000</option><option value="21000">21 000</option><option value="35000" selected>35 000</option><option value="49000">49 000</option><option value="70000">70 000</option></select></div><div class="field"><label for="water-goal-start">Daily hydration goal (ml)</label><select class="input" id="water-goal-start"><option value="1500">1500</option><option value="2000" selected>2000</option><option value="2500">2500</option><option value="3000">3000</option></select></div></div><p class="footnote">Progress stays on this device. You can skip, adapt or modify exercise to suit your health and ability. The System should challenge you, not injure you.</p><button class="btn" style="width:100%" type="submit">ACCEPT THE SYSTEM</button><p class="footnote" style="text-align:center;margin-top:14px">by Dynaframe Studios · v ${APP_PUBLIC_VERSION}</p></form></section></main>`
}
const originalRender=render;
render=function(){
 state.name?shell():onboard();
 if(state.pendingLevel&&state.name)showLevelUp();
}
shell=function(){
 syncDay();
 const pages={home:pageHome85,quests:pageQuests85,growth:pageGrowth85,hunter:pageHunter85};
 const title=nav85.find(n=>n[0]===tab)?.[2]||'Home';
 $('#app').innerHTML=`<div class="app-shell"><aside class="side"><div class="brand">THE SYSTEM<span>by Dynaframe Studios · v ${APP_PUBLIC_VERSION}</span></div><div class="nav">${nav85.map(([id,ico,name])=>`<button class="nav-item ${tab===id?'active':''}" data-tab="${id}"><span>${ico}</span>${name}</button>`).join('')}</div></aside><main class="main"><div class="topline"><span class="system-tag">◈ THE SYSTEM</span><span>${safe(title)} · ${new Date().toLocaleDateString()} · ${inboxUnread()} unread notices</span></div>${pages[tab]()}</main><nav class="bottom-nav" aria-label="Main navigation">${nav85.map(([id,ico,name])=>`<button class="${tab===id?'active':''}" data-tab="${id}"><span class="ico">${ico}</span>${name}</button>`).join('')}</nav></div>`;
};
$('#app').addEventListener('click',e=>{
 const b=e.target.closest('[data-action]');
 if(!b)return;
 if(b.dataset.action==='accept-event'){
  const ev=ensureTodayEvent(); if(!ev)return; ev.status='accepted'; save(); render(); notify('Gate event accepted');
 }
 if(b.dataset.action==='decline-event'){
  const ev=ensureTodayEvent(); if(!ev)return; ev.status='declined'; save(); render(); notify('Gate event declined');
 }
 if(b.dataset.action==='complete-event'){
  const ev=ensureTodayEvent(); if(!ev||ev.status==='completed')return; ev.status='completed'; award(ev.xp,'endurance',ev.title); state.coins+=ev.coins; log(`Gate Event complete · ${ev.title}`); addInbox('GATE CLEARED',`${ev.title} cleared for +${ev.xp} XP and +${ev.coins} Hunter Coins.` ,'achievement','gate-'+today()); window.SystemAudio?.play('quest'); save(); render(); notify(`Gate cleared! +${ev.xp} XP`);
 }
},true);
$('#app').addEventListener('submit',e=>{
 if(e.target.id==='start-form'){
  const form=e.target;
  const checked=[...form.querySelectorAll('input[name="freeDays"]:checked')].map(i=>Number(i.value));
  state.v85.initialized=true;
  state.v85.profile={
   objective:form.querySelector('#hunter-objective')?.value||'hybrid',
   fitnessLevel:form.querySelector('#fitness-level')?.value||'beginner',
   duration:Number(form.querySelector('#session-duration')?.value||20),
   equipment:form.querySelector('#equipment-type')?.value||'none',
   freeDays:checked.length?checked:[1,3,5],
   weeklyStepGoal:Number(form.querySelector('#weekly-steps')?.value||35000)
  };
  state.v8.waterGoal=Number(form.querySelector('#water-goal-start')?.value||2000);
  state.cycleDay=today();
  state.quests=v85FreshQuests(today());
  updateRecord();
  ensureTodayEvent();
  save();
  setTimeout(()=>{render(); splashOnce();},0);
 }
 if(e.target.id==='step-form'){
  e.preventDefault();
  const date=$('#step-date').value; const total=Number($('#step-total').value); const goal=Number($('#weekly-step-goal').value);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(total) || total<0)return notify('Enter a valid step total');
  state.v85.steps[date]=Math.round(total);
  state.v85.profile.weeklyStepGoal=goal;
  ensureStepAwards(date);
  save(); render(); notify('Step total saved');
 }
},false);
render();
splashOnce();


/* ===== v1.9.0 Functional release: workouts, notification center, 75-day trials, navigation ===== */
const workoutDefinitions=window.SystemWorkouts?.library||[];
let subview={home:'overview',quests:'missions',growth:'movement',hunter:'profile'};
let workoutView='library';
let workoutFilter='All';
let activeWorkout=null;
let workoutTicker=null;
let workoutDeadline=0;
let workoutRemaining=0;
let workoutPaused=true;
function normalize190(x){
 const y=x&&typeof x==='object'?x:{};
 return {workoutSessions:Array.isArray(y.workoutSessions)?y.workoutSessions:[],
  workoutAwards:y.workoutAwards&&typeof y.workoutAwards==='object'?y.workoutAwards:{},
  trial:y.trial&&typeof y.trial==='object'?y.trial:null,
  trialRewarded:Array.isArray(y.trialRewarded)?y.trialRewarded:[],
  calibrated:!!y.calibrated};
}
state.v190=normalize190(state.v190);
function pick(name,value){return String(value)===String(name)?'selected':''}
function selection(value,current){return value===current?'active':''}
function workStartOfDay(){return today()+'T00:00:00'}
function beginWorkout(id){
 const item=window.SystemWorkouts?.find(id);
 if(!item)return;
 clearInterval(workoutTicker);
 activeWorkout={id:item.id,index:0,stage:'exercise',started:new Date().toISOString(),completed:0};
 workoutView='session';workoutPaused=true;workoutRemaining=item.exercises[0].seconds;
 render();startWorkoutTimer();
}
function startWorkoutTimer(){
 if(!activeWorkout)return;
 const item=window.SystemWorkouts?.find(activeWorkout.id);
 if(!item)return;
 const ex=item.exercises[activeWorkout.index];
 if(!ex)return;
 clearInterval(workoutTicker);
 workoutPaused=false;
 workoutDeadline=Date.now()+workoutRemaining*1000;
 const tick=()=>{
  if(!activeWorkout||workoutPaused)return;
  workoutRemaining=Math.max(0,Math.ceil((workoutDeadline-Date.now())/1000));
  const node=document.querySelector('#workout-countdown');if(node)node.textContent=formatClock(workoutRemaining);
  if(workoutRemaining===0){clearInterval(workoutTicker);workoutPaused=true;window.SystemAudio?.play('tap');notify('Interval finished. Mark done when ready.');}
 };
 workoutTicker=setInterval(tick,250);tick();
}
function pauseWorkoutTimer(){
 if(!activeWorkout)return;
 workoutRemaining=Math.max(0,Math.ceil((workoutDeadline-Date.now())/1000));
 workoutPaused=true;clearInterval(workoutTicker);
 render();
}
function formatClock(v){return `${Math.floor(v/60)}:${String(v%60).padStart(2,'0')}`}
function nextWorkoutExercise(){
 if(!activeWorkout)return;
 const item=window.SystemWorkouts?.find(activeWorkout.id);if(!item)return;
 clearInterval(workoutTicker);
 if(activeWorkout.stage==='rest'){
  activeWorkout.stage='exercise';activeWorkout.index++;
  workoutRemaining=item.exercises[activeWorkout.index].seconds;workoutPaused=true;
  render();startWorkoutTimer();return;
 }
 activeWorkout.completed++;
 if(activeWorkout.index+1>=item.exercises.length){finishWorkout(item);return;}
 activeWorkout.stage='rest';workoutRemaining=25;workoutPaused=true;
 render();startWorkoutTimer();
}
function finishWorkout(item){
 clearInterval(workoutTicker);
 const d=today();
 state.v190.workoutSessions.unshift({id:crypto.randomUUID(),routineId:item.id,title:item.title,date:d,completedAt:new Date().toISOString(),segments:activeWorkout?.completed||item.exercises.length});
 state.v190.workoutSessions=state.v190.workoutSessions.slice(0,300);
 if(!state.v190.workoutAwards[d]){
  state.v190.workoutAwards[d]=true;award(item.xp,item.region==='Recovery'?'agility':'endurance',`Workout: ${item.title}`);
 }
 const day=state.v8.fitness.find(f=>f.date===d&&f.type===`Workout: ${item.title}`);
 if(!day){state.v8.fitness.push({date:d,type:`Workout: ${item.title}`,reps:item.exercises.length,effort:'moderate',note:'Completed guided session'});state.v8.fitness=state.v8.fitness.slice(-500)}
 if(item.region==='Recovery')state.v8.recovery[d]=true;
 log(`Guided workout finished: ${item.title}`);
 addInbox('WORKOUT COMPLETED',`${item.title} logged for today.`, 'fitness',`workout-${d}-${item.id}`);
 activeWorkout=null;workoutView='library';save();render();notify('Workout saved. Great work!');window.SystemAudio?.play('achievement');
}
function workoutCards(){
 const items=workoutDefinitions.filter(w=>workoutFilter==='All'||w.region===workoutFilter);
 return `<div class="section-head"><h2>Home Workouts</h2><span class="pill">Original guided routines</span></div>
 <section class="panel"><p>Choose a bodyweight routine suited to your energy and experience. Sessions include a warm-up or gentle start, guided movements, a timer, and a cool-down. Stop for pain, dizziness or loss of balance.</p><div class="filter-strip">${['All','Full Body','Upper Body','Lower Body','Core','Cardio','Recovery'].map(f=>`<button type="button" class="filter-chip ${workoutFilter===f?'active':''}" data-action="workout-filter" data-filter="${safe(f)}">${safe(f)}</button>`).join('')}</div></section>
 <div class="workout-grid">${items.map(item=>`<section class="panel workout-card"><div class="workout-icon">${item.region==='Recovery'?'✧':'⚔'}</div><div class="eyebrow">${safe(item.region)} · ${safe(item.level)}</div><h3>${safe(item.title)}</h3><p>${safe(item.description)}</p><div class="spread"><small>${item.exercises.length} guided movements · ${Math.ceil(item.exercises.reduce((a,e)=>a+e.seconds,0)/60)} min active + rests</small><span class="xp">+${item.xp} XP*</span></div><div class="top-actions"><button class="btn" type="button" data-action="workout-start" data-id="${safe(item.id)}">Start session</button></div></section>`).join('')}</div>
 <section class="panel"><h3>Workout history</h3>${state.v190.workoutSessions.slice(0,8).map(w=>`<div class="log-item"><span>${safe(w.title)} · ${safe(w.date)}</span><strong>✓ Done</strong></div>`).join('')||'<p class="empty">Your first guided workout will appear here.</p>'}<p class="footnote">*Workout XP is capped at one guided session reward per day. Extra safe activity is still logged. No exercise is required to protect your data or access the app.</p></section>`;
}
function workoutSession(){
 if(!activeWorkout){workoutView='library';return workoutCards()}
 const item=window.SystemWorkouts?.find(activeWorkout.id);if(!item){activeWorkout=null;return workoutCards()}
 const ex=item.exercises[activeWorkout.index];
 const pct=Math.round((activeWorkout.index/item.exercises.length)*100);
 const resting=activeWorkout.stage==='rest';
 return `<div class="section-head"><h2>${safe(item.title)}</h2><span class="pill">${activeWorkout.index+1} / ${item.exercises.length}</span></div>
 <section class="panel workout-player"><div class="eyebrow">[ ${resting?'RECOVERY INTERVAL':'TRAINING SESSION ACTIVE'} ]</div><h2>${resting?'Rest and breathe':safe(ex.name)}</h2><p>${resting?'Take a short break. Pause longer if you need to recover.':safe(ex.instruction)}</p><div class="workout-clock" id="workout-countdown">${formatClock(workoutRemaining)}</div><div class="progress"><i style="width:${pct}%"></i></div><p class="footnote">Move comfortably; you can pause, repeat, or skip any interval. The countdown is a guide, not a requirement.</p><div class="top-actions"><button class="btn secondary" data-action="workout-pause">${workoutPaused?'Resume':'Pause'}</button><button class="btn" data-action="workout-next">${resting?'Start next movement':activeWorkout.index+1>=item.exercises.length?'Complete session':'Movement done · rest'}</button><button class="btn ghost" data-action="workout-stop">End without reward</button></div></section>
 <section class="panel"><h3>Routine order</h3>${item.exercises.map((e,i)=>`<div class="log-item"><span>${i<activeWorkout.index?'✓ ':i===activeWorkout.index?'▶ ':'○ '}${safe(e.name)}</span><small>${e.seconds} s</small></div>`).join('')}</section>`;
}
function dayCompleted(d){
 const rec=state.records[d];return !!((rec?.quests||[]).some(q=>q.done)||state.v8.recovery[d]||state.v190.workoutSessions.some(w=>w.date===d));
}
const trialTypes={adapt:{title:'75 Adapt',desc:'Personalized consistency with flexible recovery.'},discipline:{title:'75 Discipline',desc:'Balanced quests, movement, and personal routines.'},ascension:{title:'75 Ascension',desc:'Advanced consistency challenge that still respects recovery.'}};
function trialProgress(){return state.v190.trial?Object.keys(state.v190.trial.days||{}).length:0}
function milestoneXP(day){return ({7:60,15:100,30:160,50:250,75:400})[day]||0}
function trialPage(){
 const t=state.v190.trial;
 return `<div class="section-head"><h2>75-Day Hunter Trials</h2><span class="pill">Optional</span></div><section class="panel"><p>Choose an original 75-day path. These are flexible System challenges, not the official 75 Hard program. Recovery counts when planned; no forced restarts for missed days.</p>${t?`<div class="eyebrow">ACTIVE CHALLENGE</div><h3>${safe(trialTypes[t.type]?.title||'75-Day Trial')}</h3><div class="big-stat">${trialProgress()} <span>/ 75 days</span></div><div class="progress"><i style="width:${percent(trialProgress(),75)}%"></i></div><p>${safe(trialTypes[t.type]?.desc||'')}</p><div class="top-actions"><button class="btn" data-action="trial-checkin" ${t.days?.[today()]||!dayCompleted(today())?'disabled':''}>${t.days?.[today()]?'✓ Today counted':!dayCompleted(today())?'Complete a quest or recovery check-in first':'Record today’s trial day'}</button><button class="btn secondary" data-action="trial-end">End challenge</button></div><p class="footnote">Progress uses your existing daily quests, workout, or recovery check-in as evidence. At most one day is counted per calendar date.</p>`:
 `<div class="trial-choice-grid">${Object.entries(trialTypes).map(([id,d])=>`<div class="trial-option"><h3>${safe(d.title)}</h3><p>${safe(d.desc)}</p><button class="btn" data-action="trial-start" data-id="${id}">Start trial</button></div>`).join('')}</div>`}</section>
 <section class="panel"><h3>Milestone rewards</h3>${[7,15,30,50,75].map(d=>`<div class="log-item"><span>Day ${d}</span><strong>+${milestoneXP(d)} XP</strong></div>`).join('')}<p class="footnote">A challenge can be ended at any time. No financial or health penalties apply.</p></section>`;
}
function reminderCard(){
 const enrolled=localStorage.getItem('the-system-push-enabled')==='true';
 return `<div class="section-head"><h2>Notification Center</h2><span class="pill">${inboxUnread()} unread</span></div><section class="panel"><div class="spread"><div><h3>Background push</h3><p>${pushApi()?'Worker URL configured':'Worker URL missing: check push-config.js'}</p></div><span class="pill ${enrolled?'green':'red'}">${enrolled?'Enrolled flag set':'Not enrolled'}</span></div>
 <p class="footnote">Your existing Cloudflare Worker still sends generic morning and evening pushes. Scheduled quest and Gate alerts currently appear while The System is running; closed-app event-specific pushes need a separate Worker upgrade.</p><div class="top-actions"><button class="btn secondary" data-action="push-enable">Enable / resync push</button><button class="btn secondary" data-action="push-test">Send iPhone test push</button><button class="btn danger" data-action="push-disable">Disable push</button></div>
 <p class="footnote">If the iPhone is enrolled but no banner appears, verify Home Screen installation, iOS notification permissions and Focus settings.</p></section>${pageInbox()}`;
}
function editProfilePage(){
 const p=state.v85.profile;
 return `<div class="section-head"><h2>Personalize your System</h2><span class="pill">Recalibrate</span></div><section class="panel"><p>Your free days and training level affect future assigned quests and optional Gate Events. Existing completed progress and XP remain saved.</p><form id="calibrate-form"><div class="form-row"><div class="field"><label>Primary focus</label><select class="input" id="cal-objective"><option value="hybrid" ${pick('hybrid',p.objective)}>Hybrid</option><option value="fitness" ${pick('fitness',p.objective)}>Fitness</option><option value="productivity" ${pick('productivity',p.objective)}>Productivity</option></select></div><div class="field"><label>Training level</label><select class="input" id="cal-level"><option value="beginner" ${pick('beginner',p.fitnessLevel)}>Beginner / returning</option><option value="intermediate" ${pick('intermediate',p.fitnessLevel)}>Intermediate</option><option value="advanced" ${pick('advanced',p.fitnessLevel)}>Advanced</option></select></div></div><div class="form-row"><div class="field"><label>Session duration</label><select class="input" id="cal-duration">${[10,20,30,45].map(v=>`<option value="${v}" ${pick(v,p.duration)}>${v} min</option>`).join('')}</select></div><div class="field"><label>Equipment</label><select class="input" id="cal-equipment">${['none','basic','gym'].map(v=>`<option value="${v}" ${pick(v,p.equipment)}>${v==='none'?'Bodyweight only':v==='basic'?'Basic home equipment':'Gym'}</option>`).join('')}</select></div></div><div class="field"><label>Available days for training and Gate Events</label><div class="radio-row">${dayNames.map((d,i)=>`<label><input type="checkbox" name="cal-days" value="${i}" ${(p.freeDays||[]).includes(i)?'checked':''}>${d.slice(0,3)}</label>`).join('')}</div></div><button type="submit" class="btn">Save Hunter calibration</button><p class="footnote">Changing your profile does not erase completed quests. New daily assignments use updated settings starting tomorrow.</p></form></section>`;
}
function pageHome190(){
 const existing=pageHome85();
 return existing+`<div class="section-head"><h2>Training grounds</h2><button class="btn ghost" data-view="workouts" data-section="quests">Browse workouts →</button></div><section class="panel"><h3>Guided Home Workouts</h3><p>Original bodyweight sessions, adaptive difficulty, progress history and safe recovery.</p><button class="btn" data-view="workouts" data-section="quests">Open training library</button></section>`;
}
const subMenus={
 home:[['overview','Overview']],quests:[['missions','Missions'],['workouts','Workouts'],['events','Gate Events'],['trials','75-Day Trials'],['planner','Planner']],
 growth:[['movement','Steps'],['habits','Habits'],['status','Stats'],['analytics','Insights'],['achievements','Achievements']],
 hunter:[['profile','Profile'],['notices','Notices'],['settings','Settings'],['support','Support']]
};
function choosePage(){
 if(tab==='home')return pageHome190();
 if(tab==='quests')return ({missions:pageQuests,workouts:()=>workoutView==='session'?workoutSession():workoutCards(),events:()=>`<div class="section-head"><h2>Gate Events</h2></div>${ensureTodayEvent()?eventCard(ensureTodayEvent()):'<section class="panel"><p>No event is active today. Events can appear on days you selected as free.</p></section>'}`,trials:trialPage,planner:pagePlanner})[subview.quests]?.()||pageQuests();
 if(tab==='growth')return ({movement:stepPanel,habits:pageHabits,status:pageStatus,analytics:pageAnalytics,achievements:pageRewards})[subview.growth]?.()||stepPanel();
 return ({profile:()=>profileSummary()+editProfilePage(),notices:reminderCard,settings:pageSettings,support:()=>`<div class="section-head"><h2>Support the System</h2></div><section class="panel"><h3>Built by Dynaframe Studios</h3><p>The app is free. Optional real-money contributions are planned, but no payment checkout is active. No XP or Hunter Rank is for sale.</p></section>`})[subview.hunter]?.()||profileSummary();
}
shell=function(){
 syncDay();
 const title=nav85.find(x=>x[0]===tab)?.[2]||'Home';
 const tabs=subMenus[tab]||[];
 $('#app').innerHTML=`<div class="app-shell"><aside class="side"><div class="brand">THE SYSTEM<span>by Dynaframe Studios · v ${APP_PUBLIC_VERSION}</span></div><div class="nav">${nav85.map(([id,ico,name])=>`<button class="nav-item ${tab===id?'active':''}" data-tab="${id}"><span>${ico}</span>${name}</button>`).join('')}</div></aside><main class="main"><div class="topline"><span class="system-tag">◈ THE SYSTEM</span><span>${safe(title)} · ${new Date().toLocaleDateString()} <button class="notice-link" data-view="notices" data-section="hunter" aria-label="Open notices">♧ ${inboxUnread()} notices</button></span></div><div class="subnav" aria-label="${safe(title)} sections">${tabs.map(([id,label])=>`<button type="button" class="subnav-button ${subview[tab]===id?'active':''}" data-view="${id}">${safe(label)}</button>`).join('')}</div>${choosePage()}<footer class="system-footer">The System · by Dynaframe Studios · v ${APP_PUBLIC_VERSION}</footer></main><nav class="bottom-nav" aria-label="Main navigation">${nav85.map(([id,ico,name])=>`<button class="${tab===id?'active':''}" data-tab="${id}"><span class="ico">${ico}</span>${name}</button>`).join('')}</nav></div>`;
};
// Capture navigation before the legacy handler and route into one of four top-level destinations.
$('#app').addEventListener('click',e=>{
 const b=e.target.closest('[data-view]');if(!b)return;
 e.stopImmediatePropagation();
 if(b.dataset.section)tab=b.dataset.section;
 if(subMenus[tab]?.some(x=>x[0]===b.dataset.view))subview[tab]=b.dataset.view;
 render();
},true);
// Handle v1.9 actions before the original general handlers.
$('#app').addEventListener('click',e=>{
 const b=e.target.closest('[data-action]');if(!b)return;
 const act=b.dataset.action;
 const ours=['workout-start','workout-next','workout-pause','workout-stop','workout-filter','trial-start','trial-checkin','trial-end'];
 if(!ours.includes(act))return;
 e.stopImmediatePropagation();
 if(act==='workout-filter'){workoutFilter=b.dataset.filter||'All';render();}
 if(act==='workout-start')beginWorkout(b.dataset.id);
 if(act==='workout-next')nextWorkoutExercise();
 if(act==='workout-pause'){if(workoutPaused)startWorkoutTimer();else pauseWorkoutTimer();render();}
 if(act==='workout-stop'){if(confirm('End this workout without awarding XP?')){clearInterval(workoutTicker);activeWorkout=null;workoutView='library';render();}}
 if(act==='trial-start'){
  if(state.v190.trial)return notify('End your current trial first');
  const type=b.dataset.id;if(!trialTypes[type])return;
  state.v190.trial={type,started:today(),days:{}};state.v190.trialRewarded=[];save();render();notify('Hunter Trial started');
 }
 if(act==='trial-end'){
  if(confirm('End this trial? Logged quest and workout progress will remain, but the trial counter will reset.')){state.v190.trial=null;state.v190.trialRewarded=[];save();render();}
 }
 if(act==='trial-checkin'){
  const t=state.v190.trial;if(!t||t.days[today()]||!dayCompleted(today()))return;
  t.days[today()]=true;const n=trialProgress();const milestone=milestoneXP(n);
  if(milestone&&!state.v190.trialRewarded.includes(n)){
   state.v190.trialRewarded.push(n);award(milestone,'discipline',`75-Day Trial · Day ${n}`);
   addInbox('TRIAL MILESTONE',`You've completed ${n} eligible days. +${milestone} XP.`, 'achievement',`trial-${t.started}-${n}`);
  }
  save();render();notify(`Trial progress: ${n}/75 days`);
 }
},true);
// Supplement onboarding and save settings without overwriting legacy save structures.
$('#app').addEventListener('submit',e=>{
 if(e.target.id!=='calibrate-form')return;
 e.preventDefault();e.stopImmediatePropagation();
 const form=e.target;
 const days=[...form.querySelectorAll('[name="cal-days"]:checked')].map(n=>Number(n.value));
 state.v85.profile={...state.v85.profile,objective:$('#cal-objective').value,fitnessLevel:$('#cal-level').value,duration:Number($('#cal-duration').value),equipment:$('#cal-equipment').value,freeDays:days};
 state.v190.calibrated=true;
 save();render();notify('Hunter profile updated. New assignments will follow your schedule.');
},true);
// Normalize data after an imported backup; original import handler runs asynchronously.
$('#app').addEventListener('change',e=>{
 if(e.target.id!=='import-file')return;
 setTimeout(()=>{
  state.v85=normalizeV85(state.v85);
  state.v190=normalize190(state.v190);
  if(!nav85.some(x=>x[0]===tab))tab='home';
  save();render();
 },500);
},false);
// Avoid stale v1.9 fields after a full reset.
$('#app').addEventListener('click',e=>{
 const b=e.target.closest('[data-action="reset"]');if(!b)return;
 setTimeout(()=>{state.v85=normalizeV85(state.v85);state.v190=normalize190(state.v190);tab='home';render()},50);
},false);
// Bring the notification inbox back, and ensure push prefs are synchronized when the app comes online.
let lastPushRefresh=0;
async function refreshPush190(){
 if(!state.name||!pushApi()||localStorage.getItem('the-system-push-enabled')!=='true'||!navigator.onLine)return;
 if(Date.now()-lastPushRefresh<3600000)return;
 lastPushRefresh=Date.now();
 try{await pushSync()}catch(e){console.warn('Push refresh:',e)}
}
window.addEventListener('online',refreshPush190);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshPush190()});
setTimeout(refreshPush190,3500);
render();


/* ===== v1.09.1 Notification Command ===== */
const NOTIFY191_DEFAULT={steps:true,workout:true,gate:true,streak:false,hydration:false,trial:false,reminderTime:'20:00',workoutTime:'17:00',hydrationTime:'13:00',quietEnabled:true,quietStart:'22:00',quietEnd:'07:00'};
state.notify191={...NOTIFY191_DEFAULT,...(state.notify191||{})};
const originalReminderCard191=reminderCard;
reminderCard=function(){const x={...NOTIFY191_DEFAULT,...(state.notify191||{})};
 const check=(id,label,desc)=>`<label class="notif-setting"><input type="checkbox" id="nt-${id}" ${x[id]?'checked':''}><span><strong>${label}</strong><small>${desc}</small></span></label>`;
 return `<div class="section-head"><h2>Notification Command</h2><span class="pill">v1.09.1</span></div><section class="panel"><div class="eyebrow">STERN, NOT STRICT</div><h3>Alerts you control</h3><p>Set your preferences below. The System provides useful reminders, never punishment for ignoring a notification.</p><form id="notify191-form">
 <div class="notif-grid">${check('steps','Step logging','Have you logged your steps today?')}${check('workout','Workout window','Only on your available days')}${check('gate','Gate invitations','Check the app for optional events')}${check('streak','Daily progress','Gentle reminder about unfinished goals')}${check('hydration','Hydration','Optional water check-in')}${check('trial','75-Day Trials','Optional challenge check-ins')}</div>
 <div class="form-row"><div class="field"><label for="nt-reminderTime">Evening / steps</label><input class="input" id="nt-reminderTime" type="time" value="${safe(x.reminderTime)}"></div><div class="field"><label for="nt-workoutTime">Training / Gate</label><input class="input" id="nt-workoutTime" type="time" value="${safe(x.workoutTime)}"></div></div>
 <div class="field"><label for="nt-hydrationTime">Hydration check-in time</label><input class="input" id="nt-hydrationTime" type="time" value="${safe(x.hydrationTime)}"></div>
 <label class="notif-setting"><input type="checkbox" id="nt-quietEnabled" ${x.quietEnabled?'checked':''}><span><strong>Respect quiet hours</strong><small>No new scheduled reminders during these hours</small></span></label>
 <div class="form-row"><div class="field"><label for="nt-quietStart">Quiet hours start</label><input class="input" id="nt-quietStart" type="time" value="${safe(x.quietStart)}"></div><div class="field"><label for="nt-quietEnd">Quiet hours end</label><input class="input" id="nt-quietEnd" type="time" value="${safe(x.quietEnd)}"></div></div>
 <button class="btn" type="submit">Save and sync alert settings</button></form><p class="footnote">A device must first be enrolled. These options require the v1.09.1 Worker upgrade for closed-app delivery. Reminders can be delayed, and device settings may silence them. iOS controls push alert sounds.</p></section>${originalReminderCard191()}`;
};
function notify191Payload(){const x=state.notify191;return {...x,freeDays:(state.v85?.profile?.freeDays||[]).map(Number)}}
async function syncNotify191(){
 if(!pushApi()||localStorage.getItem('the-system-push-enabled')!=='true')return false;
 await pushRequest('/api/notification-prefs','POST',notify191Payload());
 if(state.v85?.steps?.[today()]!==undefined)await sendStepCheckin191(today());
 return true;
}
async function sendStepCheckin191(date){
 if(!pushApi()||localStorage.getItem('the-system-push-enabled')!=='true')return;
 return pushRequest('/api/step-checkin','POST',{date,logged:true});
}
const originalPushEnable191=pushEnable;
pushEnable=async function(){await originalPushEnable191();await syncNotify191();return true};
$('#app').addEventListener('submit',e=>{
 if(e.target.id!=='notify191-form')return;
 e.preventDefault();e.stopImmediatePropagation();
 const keys=['steps','workout','gate','streak','hydration','trial'];
 const x={...state.notify191};keys.forEach(k=>x[k]=!!document.getElementById('nt-'+k)?.checked);
 for(const k of ['reminderTime','workoutTime','hydrationTime','quietStart','quietEnd'])x[k]=document.getElementById('nt-'+k)?.value||NOTIFY191_DEFAULT[k];
 x.quietEnabled=!!document.getElementById('nt-quietEnabled')?.checked;
 state.notify191=x;save();render();
 syncNotify191().then(ok=>notify(ok?'Notifications saved and synced':'Saved locally. Enable background push to sync.')).catch(err=>notify('Saved locally. Sync failed: '+err.message));
},true);
$('#app').addEventListener('submit',e=>{
 if(e.target.id!=='step-form')return;
 const date=e.target.querySelector('#step-date')?.value;
 if(!date||date!==today())return;
 setTimeout(()=>{if(state.v85?.steps?.[date]!==undefined)sendStepCheckin191(date).catch(err=>console.warn('Step check-in not synced',err));},150);
},false);
// Deep-link opened from a push notification, using only safe known section names.
function openNotifyDeepLink191(){const target=(location.hash||'').slice(1);if(!['home','quests','growth','hunter'].includes(target))return;if(!state.name)return;tab=target;subview[target]=target==='growth'?'movement':target==='hunter'?'notices':subview[target];render();}
window.addEventListener('hashchange',openNotifyDeepLink191);setTimeout(openNotifyDeepLink191,100);
