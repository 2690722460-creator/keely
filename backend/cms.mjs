import {randomUUID} from 'node:crypto';

export const CMS_CATEGORIES=Object.freeze({brand_ip:'品牌IP设计',aigc_video:'动态影像',ad_visual:'视觉创作',stage_design:'舞台空间设计',personal:'UI设计',marketing_clips:'营销切片'});
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BODY_LIMIT=256*1024;
const TYPES=Object.freeze({'image/jpeg':{ext:['jpg','jpeg'],max:15*1024*1024},'image/png':{ext:['png'],max:15*1024*1024},'image/webp':{ext:['webp'],max:15*1024*1024},'image/gif':{ext:['gif'],max:15*1024*1024},'video/mp4':{ext:['mp4'],max:50*1024*1024},'video/webm':{ext:['webm'],max:50*1024*1024}});
class CmsError extends Error{constructor(status,code,message){super(message);this.status=status;this.code=code;}}
const fail=(status,code,message)=>{throw new CmsError(status,code,message);};
function origin(value){try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&u.origin===value&&!u.username&&!u.password&&!value.includes('*')?u.origin:null;}catch{return null;}}
export function loadCmsConfig(env=process.env,options={}){
 const errors=[],url=String(env.SUPABASE_URL||'').trim().replace(/\/$/,'');
 try{const u=new URL(url);if(u.protocol!=='https:'||!u.hostname.endsWith('.supabase.co')||u.username||u.password||u.pathname!=='/'||u.search||u.hash)errors.push('SUPABASE_URL');}catch{errors.push('SUPABASE_URL');}
 const anonKey=String(env.SUPABASE_ANON_KEY||env.SUPABASE_PUBLISHABLE_KEY||'').trim(),serviceRoleKey=String(env.SUPABASE_SERVICE_ROLE_KEY||'').trim(),adminUserId=String(env.ADMIN_USER_ID||'').trim();
 if(!anonKey||anonKey.length>8192||/[\r\n\0]/.test(anonKey))errors.push('SUPABASE_ANON_KEY');
 if(!serviceRoleKey||serviceRoleKey.length>8192||/[\r\n\0]/.test(serviceRoleKey))errors.push('SUPABASE_SERVICE_ROLE_KEY');
 if(!UUID.test(adminUserId))errors.push('ADMIN_USER_ID');
 const bucket=String(env.SUPABASE_STORAGE_BUCKET||'portfolio-media');if(!/^[a-z0-9][a-z0-9-]{0,62}$/.test(bucket))errors.push('SUPABASE_STORAGE_BUCKET');
 const allowedOrigins=new Set();const values=options.allowedOrigins||String(env.APP_ORIGIN||`http://localhost:${env.PORT||4180},http://127.0.0.1:${env.PORT||4180}`).split(',').map(x=>x.trim());
 for(const v of values){const item=origin(v);if(item)allowedOrigins.add(item);else errors.push('APP_ORIGIN');}
 for(const k of ['VERCEL_URL','VERCEL_PROJECT_PRODUCTION_URL'])if(env[k]){const item=origin('https://'+String(env[k]).trim());if(item)allowedOrigins.add(item);else errors.push(k);}
 return {url,anonKey,serviceRoleKey,adminUserId:adminUserId.toLowerCase(),bucket,allowedOrigins:[...allowedOrigins],ready:errors.length===0,errors:[...new Set(errors)]};
}
function json(res,status,value,headers={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(JSON.stringify(value));}
async function body(req){
 if(!/^application\/json(?:\s*;|$)/i.test(String(req.headers['content-type']||'')))fail(415,'CONTENT_TYPE','请使用 JSON 提交。');
 let bytes;
 if(req.body!==undefined){try{bytes=Buffer.isBuffer(req.body)?req.body:Buffer.from(typeof req.body==='string'?req.body:JSON.stringify(req.body));}catch{fail(400,'INVALID_JSON','提交内容格式错误。');}}
 else{
  const length=req.headers['content-length'];if(length!==undefined&&(!/^\d+$/.test(String(length))||Number(length)>BODY_LIMIT)){req.resume?.();fail(413,'BODY_TOO_LARGE','作品数据过大，请减少文字或媒体条目。');}
  const chunks=[];let total=0;for await(const chunk of req){total+=chunk.length;if(total>BODY_LIMIT){req.resume?.();fail(413,'BODY_TOO_LARGE','作品数据过大，请减少文字或媒体条目。');}chunks.push(chunk);}bytes=Buffer.concat(chunks);
 }
 if(bytes.length>BODY_LIMIT)fail(413,'BODY_TOO_LARGE','作品数据过大，请减少文字或媒体条目。');
 let parsed;try{parsed=JSON.parse(bytes.toString('utf8'));}catch{fail(400,'INVALID_JSON','提交内容格式错误。');}
 if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))fail(400,'INVALID_JSON','提交内容必须是对象。');return parsed;
}
export function safeMediaRef(value,config,{empty=false}={}){
 if(empty&&value==='')return '';
 if(typeof value!=='string'||!value||value.length>8192||/[\u0000-\u0020<>"'\\]/.test(value))fail(400,'INVALID_MEDIA','媒体地址格式不正确。');
 if(value.startsWith('assets/')){if(!/^assets\/[A-Za-z0-9_\-./%\u0080-\uffff]+$/.test(value))fail(400,'INVALID_MEDIA','媒体地址格式不正确。');let decoded;try{decoded=decodeURIComponent(value);}catch{fail(400,'INVALID_MEDIA','媒体地址格式不正确。');}if(decoded.split('/').some(x=>!x||x==='.'||x==='..')||/[\u0000-\u0020<>"'\\?#]/.test(decoded))fail(400,'INVALID_MEDIA','媒体地址格式不正确。');return value;}
 if(value.startsWith('storage://')){const prefix=`storage://${config.bucket}/${config.adminUserId}/`;if(!value.startsWith(prefix)||!new RegExp('^[0-9a-f-]{36}\\.(?:jpg|jpeg|png|webp|gif|mp4|webm)$','i').test(value.slice(prefix.length)))fail(400,'INVALID_MEDIA','请选择本后台上传的媒体文件。');return value;}
 try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.hash||u.href!==value||/%(?:00|0a|0d|22|27|3c|3e|5c)/i.test(value))throw Error();return u.href;}catch{fail(400,'INVALID_MEDIA','媒体地址必须是有效 HTTPS 地址或本站素材。');}
}
function validateWork(input,config,{strict=true}={}){
 if(!input||typeof input!=='object'||Array.isArray(input))fail(400,'INVALID_WORK','请提交有效作品。');
 const allowed=['id','title','category','description','cover','media','status','sort_order','version'];
 if(strict&&Object.keys(input).some(k=>!allowed.includes(k)))fail(400,'INVALID_FIELD','作品包含不支持的字段。');
 if(typeof input.title!=='string'||!input.title.trim()||input.title.trim().length>160||/[\0\r]/.test(input.title))fail(400,'INVALID_TITLE','标题需为1至160个字符。');
 if(!Object.hasOwn(CMS_CATEGORIES,input.category))fail(400,'INVALID_CATEGORY','请选择正确的作品分类。');
 if(typeof input.description!=='string'||input.description.length>12000||input.description.includes('\0'))fail(400,'INVALID_DESCRIPTION','介绍最多12000个字符。');
 if(!['draft','published','archived'].includes(input.status))fail(400,'INVALID_STATUS','作品状态不正确。');
 if(!Number.isSafeInteger(input.sort_order)||Math.abs(input.sort_order)>1000000)fail(400,'INVALID_ORDER','排序值需为合理整数。');
 const cover=safeMediaRef(input.cover,config,{empty:input.status!=='published'});
 if(!Array.isArray(input.media)||input.media.length>50)fail(400,'INVALID_MEDIA','每件作品最多50个详情媒体。');
 const media=input.media.map(m=>{if(!m||typeof m!=='object'||Array.isArray(m)||!['image','video'].includes(m.type)||Object.keys(m).some(k=>!['type','src','poster'].includes(k)))fail(400,'INVALID_MEDIA','详情媒体格式不正确。');const result={type:m.type,src:safeMediaRef(m.src,config)};if(m.poster!==undefined&&m.poster!=='')result.poster=safeMediaRef(m.poster,config);return result;});
 const result={title:input.title.trim(),category:input.category,description:input.description,cover,media,status:input.status,sort_order:input.sort_order};
 if(input.id!==undefined&&input.id!==null&&input.id!==''){if(typeof input.id!=='string'||!UUID.test(input.id))fail(400,'INVALID_ID','作品编号不正确。');if(!Number.isSafeInteger(input.version)||input.version<1||input.version>2147483646)fail(400,'INVALID_VERSION','请重新载入作品后再保存。');result.id=input.id.toLowerCase();result.version=input.version;}
 return result;
}
function tokenFrom(req){const values=String(req.headers.cookie||'').split(';').map(p=>p.trim()).filter(p=>p.startsWith('portfolio_admin='));if(values.length!==1)return null;const token=values[0].slice('portfolio_admin='.length);return /^[A-Za-z0-9_.-]{20,8192}$/.test(token)?token:null;}
function storageUrl(config,value){
 if(typeof value!=='string'||/[\u0000-\u0020<>"'\\]/.test(value))fail(502,'STORAGE_RESPONSE','媒体服务返回格式异常。');
 const raw=value.startsWith('/object/')?config.url+'/storage/v1'+value:value.startsWith('/storage/v1/')?config.url+value:value;
 let u;try{u=new URL(raw);}catch{fail(502,'STORAGE_RESPONSE','媒体服务返回格式异常。');}
 if(u.origin!==new URL(config.url).origin||!u.pathname.startsWith('/storage/v1/object/')||u.username||u.password||!u.searchParams.get('token'))fail(502,'STORAGE_RESPONSE','媒体服务返回格式异常。');return u.href;
}
export function createCmsHandler({config=loadCmsConfig(),fetchImpl=fetch,now=Date.now,timeoutMs=15000,loginRateLimit={max:8,windowMs:15*60*1000}}={}){
 const limits=new Map();
 async function call(path,{method='GET',data,token,auth=false}={}){
  const controller=new AbortController();let timer;
  try{
   const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('timeout'));},timeoutMs);timer.unref?.();});
   const perform=async()=>{const response=await fetchImpl(config.url+path,{method,signal:controller.signal,redirect:'error',headers:{apikey:auth?config.anonKey:config.serviceRoleKey,Authorization:'Bearer '+(token||(auth?config.anonKey:config.serviceRoleKey)),...(data!==undefined?{'Content-Type':'application/json'}:{}),...(path.startsWith('/rest/v1/')?{Prefer:'return=representation'}:{})},...(data!==undefined?{body:JSON.stringify(data)}:{})});
    if(!response.ok){if(auth&&[400,401,403].includes(response.status))fail(401,'AUTH_FAILED','登录信息已失效，请重新登录。');fail(502,'SUPABASE_ERROR','云端暂时未完成操作，请稍后重试。');}
    const text=await response.text();if(text.length>8*1024*1024)fail(502,'SUPABASE_RESPONSE','云端响应过大。');try{return text?JSON.parse(text):null;}catch{fail(502,'SUPABASE_RESPONSE','云端返回格式异常。');}
   };
   return await Promise.race([perform(),timeout]);
  }catch(e){if(e instanceof CmsError)throw e;fail(502,'SUPABASE_UNAVAILABLE','云端连接暂时不可用，请稍后重试。');}finally{clearTimeout(timer);}
 }
 async function user(req){const token=tokenFrom(req);if(!token)fail(401,'LOGIN_REQUIRED','请先登录作品管理后台。');const account=await call('/auth/v1/user',{token,auth:true});if(!account||account.id?.toLowerCase()!==config.adminUserId)fail(403,'ADMIN_ONLY','此账号没有作品管理权限。');return {token,user:{id:account.id,email:String(account.email||'')}};}
 async function previews(rows){const refs=new Set();for(const row of rows){if(row.cover?.startsWith('storage://'))refs.add(safeMediaRef(row.cover,config));for(const m of row.media||[])for(const val of [m.src,m.poster])if(val?.startsWith('storage://'))refs.add(safeMediaRef(val,config));}
  if(!refs.size)return {};const prefix=`storage://${config.bucket}/`,paths=[...refs].map(r=>r.slice(prefix.length));const result=await call('/storage/v1/object/sign/'+encodeURIComponent(config.bucket),{method:'POST',data:{expiresIn:3600,paths}});if(!Array.isArray(result))fail(502,'STORAGE_RESPONSE','媒体服务返回格式异常。');const map={};for(const path of paths){const item=result.find(r=>r.path===path);if(!item||item.error||!item.signedURL&&!item.signedUrl)fail(502,'MEDIA_NOT_READY','有媒体尚未上传完成，请重新上传后保存。');map[prefix+path]=storageUrl(config,item.signedURL||item.signedUrl);}return map;
 }
 const resolveRef=(ref,map)=>ref.startsWith('storage://')?map[ref]:ref;
 function legacy(row,map){const work=validateWork(row,config,{strict:false});return {id:row.id,title:work.title,category:work.category,catLabel:CMS_CATEGORIES[work.category],description:work.description,img:resolveRef(work.cover,map),gallery:(work.media.length?work.media:[{type:'image',src:work.cover}]).map(m=>m.type==='image'?resolveRef(m.src,map):{type:'video',src:resolveRef(m.src,map),...(m.poster?{poster:resolveRef(m.poster,map)}:{})})};}
 return async function cms(req,res){
  try{
   const url=new URL(req.url,'http://cms.local'),path=url.pathname,action=url.searchParams.get('action')||'status';
   if(!['/api/works','/api/admin'].includes(path)){json(res,404,{ok:false,code:'NOT_FOUND',message:'接口不存在。'});return;}
   const publicRead=path==='/api/works';
   const methods=publicRead?['GET']:['status','session','list'].includes(action)?['GET']:['login','logout','save','upload'].includes(action)?['POST']:[];
   if(!methods.includes(req.method)){json(res,405,{ok:false,code:'METHOD_NOT_ALLOWED',message:'请求方法不正确。'},{Allow:methods.join(', ')||'GET, POST'});return;}
   if(!publicRead&&action==='status'){json(res,200,{ok:true,configured:Boolean(config.ready),...(config.ready?{}:{message:'后台尚未连接 Supabase，请按部署说明完成配置。'})});return;}
   if(!config.ready)fail(503,'CMS_NOT_CONFIGURED','后台尚未连接 Supabase，请按部署说明完成配置。');
   if(req.method==='POST'&&!config.allowedOrigins.includes(req.headers.origin))fail(403,'ORIGIN_NOT_ALLOWED','请求来源未获允许。');
   if(publicRead){const rows=await call('/rest/v1/portfolio_works?owner_id=eq.'+config.adminUserId+'&status=eq.published&order=sort_order.asc,id.asc&limit=1000');if(!Array.isArray(rows))fail(502,'DATABASE_RESPONSE','作品数据暂时不可用。');if(rows.some(r=>r.owner_id!==config.adminUserId||r.status!=='published'))fail(502,'DATABASE_RESPONSE','作品数据暂时不可用。');const map=await previews(rows);json(res,200,{ok:true,works:rows.map(r=>legacy(r,map))});return;}
   if(action==='login'){
    const key=req.socket?.remoteAddress||'unknown',timestamp=now();for(const [k,v]of limits)if(v.until<=timestamp)limits.delete(k);let bucket=limits.get(key);if(!bucket){if(limits.size>=10000)fail(429,'LOGIN_RATE_LIMIT','尝试次数较多，请稍后再试。');bucket={count:0,until:timestamp+loginRateLimit.windowMs};limits.set(key,bucket);}if(bucket.count>=loginRateLimit.max)fail(429,'LOGIN_RATE_LIMIT','尝试次数较多，请稍后再试。');bucket.count++;
    const input=await body(req);if(Object.keys(input).some(k=>!['email','password'].includes(k))||typeof input.email!=='string'||input.email.length>254||!/^\S+@\S+\.\S+$/.test(input.email)||typeof input.password!=='string'||!input.password||input.password.length>1024||/[\r\n\0]/.test(input.email))fail(400,'INVALID_LOGIN','请填写邮箱和密码。');
    const session=await call('/auth/v1/token?grant_type=password',{method:'POST',data:{email:input.email.trim(),password:input.password},auth:true});
    if(!session?.user||session.user.id?.toLowerCase()!==config.adminUserId)fail(403,'ADMIN_ONLY','此账号没有作品管理权限。');
    if(typeof session.access_token!=='string'||!/^[A-Za-z0-9_.-]{20,8192}$/.test(session.access_token)||!Number.isFinite(session.expires_in)||session.expires_in<=0)fail(502,'AUTH_RESPONSE','登录服务返回格式异常。');
    const secure=req.headers.origin.startsWith('https:')?'; Secure':'';const cookie=`portfolio_admin=${session.access_token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.max(1,Math.min(3600,Math.floor(session.expires_in)))}${secure}`;
    json(res,200,{ok:true,user:{id:session.user.id,email:String(session.user.email||input.email)}},{'Set-Cookie':cookie});return;
   }
   if(action==='logout'){await body(req);json(res,200,{ok:true},{'Set-Cookie':'portfolio_admin=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'+(req.headers.origin.startsWith('https:')?'; Secure':'')});return;}
   const account=await user(req);
   if(action==='session'){json(res,200,{ok:true,user:account.user});return;}
   if(action==='list'){const rows=await call('/rest/v1/portfolio_works?owner_id=eq.'+config.adminUserId+'&order=sort_order.asc,id.asc&limit=1000');if(!Array.isArray(rows)||rows.some(r=>r.owner_id!==config.adminUserId))fail(502,'DATABASE_RESPONSE','作品数据暂时不可用。');json(res,200,{ok:true,works:rows,previews:await previews(rows)});return;}
   if(action==='save'){
    const input=await body(req);if(Object.keys(input).length!==1||!Object.hasOwn(input,'work'))fail(400,'INVALID_WORK','请提交有效作品。');const candidate=validateWork(input.work,config),map=await previews([candidate]);let rows;
    if(candidate.id){const {id,version,...values}=candidate;rows=await call('/rest/v1/portfolio_works?id=eq.'+id+'&owner_id=eq.'+config.adminUserId+'&version=eq.'+version,{method:'PATCH',data:{...values,version:version+1}});if(Array.isArray(rows)&&rows.length===0)fail(409,'VERSION_CONFLICT','作品已在其他窗口更新，请重新载入后再保存。');}
    else rows=await call('/rest/v1/portfolio_works',{method:'POST',data:{...candidate,id:randomUUID(),owner_id:config.adminUserId,version:1}});
    if(!Array.isArray(rows)||rows.length!==1||rows[0].owner_id!==config.adminUserId||!UUID.test(rows[0].id))fail(502,'DATABASE_RESPONSE','云端未确认作品保存，请重新载入检查。');json(res,200,{ok:true,work:rows[0],previews:map});return;
   }
   if(action==='upload'){
    const input=await body(req);if(Object.keys(input).some(k=>!['filename','mime','size'].includes(k))||typeof input.filename!=='string'||input.filename.length>240||/[\\/\0\r\n]/.test(input.filename)||!Object.hasOwn(TYPES,input.mime)||!Number.isSafeInteger(input.size)||input.size<=0)fail(400,'INVALID_UPLOAD','请选择支持的图片或视频文件。');
    const type=TYPES[input.mime],ext=input.filename.split('.').pop().toLowerCase();if(!type.ext.includes(ext)||input.size>type.max)fail(400,'UPLOAD_LIMIT','图片最多15MB，视频最多50MB，请检查格式和大小。');const path=config.adminUserId+'/'+randomUUID()+'.'+ext;
    const result=await call('/storage/v1/object/upload/sign/'+config.bucket+'/'+path,{method:'POST',data:{}});const uploadUrl=storageUrl(config,result?.url||result?.signedURL||result?.signedUrl);json(res,200,{ok:true,uploadUrl,ref:'storage://'+config.bucket+'/'+path,method:'PUT',headers:{'Content-Type':input.mime,'cache-control':'max-age=3600','x-upsert':'false'},expiresIn:7200});return;
   }
  }catch(e){const known=e instanceof CmsError;json(res,known?e.status:500,{ok:false,code:known?e.code:'CMS_ERROR',message:known?e.message:'后台暂时未完成操作，请稍后重试。'});}
 };
}
