// TIVA LIBRARY — Bibliothèque documentaire (Anesthésie)
// Stack : Node.js / Express / PostgreSQL / Multer / Volume Railway
// Compagnon de TIVA PRO (auth partagée via table praticiens)

const express=require('express');
const session=require('express-session');
const pgSession=require('connect-pg-simple')(session);
const{Pool}=require('pg');
const bcrypt=require('bcrypt');
const multer=require('multer');
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const archiver=require('archiver');

const app=express();
const PORT=process.env.PORT||3000;
const DATA_DIR=process.env.DATA_DIR||'/data';
const FILES_DIR=path.join(DATA_DIR,'files');
const TIVA_PRO_URL=process.env.TIVA_PRO_URL||'#';

// Volumes : créer le dossier s'il n'existe pas
if(!fs.existsSync(FILES_DIR))fs.mkdirSync(FILES_DIR,{recursive:true});

// PostgreSQL (DB partagée avec TIVA PRO et TIVA WEEKLY)
const pool=new Pool({
  connectionString:process.env.DATABASE_URL,
  ssl:process.env.DATABASE_URL?.includes('railway')?{rejectUnauthorized:false}:false
});

// Helpers
const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const AH=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
const fmtBytes=b=>b<1024?b+'B':b<1048576?(b/1024).toFixed(1)+'KB':b<1073741824?(b/1048576).toFixed(1)+'MB':(b/1073741824).toFixed(2)+'GB';
const csrfField=req=>`<input type="hidden" name="_csrf" value="${req.session?.csrf||''}">`;

// CSS commun (bleu marine)
const CSS=`<style>
:root{--primary:#1e3a8a;--primary-dark:#172554;--primary-surface:#dbeafe;--bg:#f8fafc;--bg-alt:#e2e8f0;--card:#fff;--border:#cbd5e1;--border-light:#e2e8f0;--text:#0f172a;--text-muted:#64748b;--success:#16a34a;--warning:#f59e0b;--danger:#dc2626;--info:#0284c7;}
*{box-sizing:border-box;}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--bg);color:var(--text);margin:0;padding:0;}
.container{max-width:1280px;margin:0 auto;padding:14px;}
h1,h2,h3,h4{color:var(--primary-dark);margin-top:0;}
h1{font-size:24px;}h2{font-size:20px;}h3{font-size:17px;}h4{font-size:14px;}
.card{background:var(--card);border:1px solid var(--border-light);border-radius:8px;padding:14px;margin-bottom:14px;box-shadow:0 1px 3px rgba(15,23,42,0.04);}
.btn{display:inline-block;padding:7px 13px;border-radius:5px;font-weight:600;font-size:13px;cursor:pointer;text-decoration:none;border:1px solid transparent;transition:all 0.15s;}
.btn-primary{background:var(--primary);color:white;border-color:var(--primary);}
.btn-primary:hover{background:var(--primary-dark);}
.btn-outline{background:white;color:var(--primary);border-color:var(--primary);}
.btn-outline:hover{background:var(--primary-surface);}
.btn-danger{background:var(--danger);color:white;}
.btn-success{background:var(--success);color:white;}
.btn-sm{padding:4px 9px;font-size:11px;}
input,select,textarea{padding:7px 10px;border:1px solid var(--border);border-radius:5px;font-size:13px;font-family:inherit;}
input:focus,select:focus,textarea:focus{outline:2px solid var(--primary-surface);border-color:var(--primary);}
.ptb{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px;}
.alert{padding:10px 14px;border-radius:5px;margin-bottom:12px;border-left:4px solid;}
.alert-info{background:#eff6ff;border-color:var(--info);color:#1e40af;}
.alert-success{background:#f0fdf4;border-color:var(--success);color:#166534;}
.alert-warning{background:#fffbeb;border-color:var(--warning);color:#92400e;}
.alert-danger{background:#fef2f2;border-color:var(--danger);color:#991b1b;}
.nc{display:block;background:var(--card);padding:18px;border-radius:8px;border:1px solid var(--border-light);text-decoration:none;color:var(--text);font-weight:600;font-size:14px;transition:all 0.15s;border-left:4px solid var(--primary);}
.nc:hover{transform:translateY(-1px);box-shadow:0 4px 12px rgba(30,58,138,0.12);}
.cat-tile{display:block;background:var(--card);padding:18px;border-radius:8px;border:1px solid var(--border-light);text-decoration:none;color:var(--text);transition:all 0.15s;}
.cat-tile:hover{transform:translateY(-2px);box-shadow:0 6px 18px rgba(30,58,138,0.12);border-color:var(--primary);}
.cat-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;}
.doc-row{display:flex;align-items:center;gap:12px;padding:12px;border-bottom:1px solid var(--border-light);transition:background 0.1s;}
.doc-row:hover{background:#f1f5f9;}
.doc-icon{font-size:24px;width:36px;text-align:center;}
.doc-info{flex:1;min-width:0;}
.doc-title{font-weight:600;color:var(--primary-dark);font-size:14px;margin-bottom:2px;display:block;text-decoration:none;}
.doc-title:hover{text-decoration:underline;}
.doc-meta{font-size:11px;color:var(--text-muted);}
.doc-actions{display:flex;gap:6px;}
table{width:100%;border-collapse:collapse;}
th,td{padding:10px 12px;text-align:left;border-bottom:1px solid var(--border-light);font-size:13px;}
th{background:var(--bg-alt);font-weight:700;color:var(--primary-dark);font-size:12px;text-transform:uppercase;letter-spacing:0.3px;}
.search-bar{display:flex;gap:8px;margin-bottom:12px;}
.search-bar input{flex:1;}
@media(max-width:640px){.container{padding:8px;}.cat-grid{grid-template-columns:1fr;}.doc-row{flex-direction:column;align-items:flex-start;gap:6px;}.doc-actions{width:100%;}}
</style>`;

// Layout commun
const PL=(req,title,content)=>{
  const u=req.session?.user;
  const tivaProBtn=`<a href="${TIVA_PRO_URL}" class="btn btn-outline">← TIVA PRO</a>`;
  const navBar=u?`<div class="ptb"><div><b style="color:var(--primary-dark);font-size:18px;">📚 TIVA LIBRARY</b> &nbsp;<small style="color:var(--text-muted);">${esc(u.nom)} (${u.role==='ADMIN'?'Admin':u.responsable_seminaires?'Resp. agenda':'Lecture'})</small></div><div style="display:flex;gap:6px;flex-wrap:wrap;">${tivaProBtn}<a href="/" class="btn btn-outline">🏠 Accueil</a><a href="/logout" class="btn btn-outline">Déconnexion</a></div></div>`:'';
  return`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} — TIVA LIBRARY</title>${CSS}</head><body><div class="container">${navBar}${content}</div></body></html>`;
};

// =========================================================================
// MIDDLEWARES
// =========================================================================

app.use(express.urlencoded({extended:true,limit:'5mb'}));
app.use(express.json({limit:'5mb'}));
app.use(session({
  store:new pgSession({pool,tableName:'tl_session',createTableIfMissing:false}),
  secret:process.env.SESSION_SECRET||'tiva-library-dev-secret',
  resave:false,
  saveUninitialized:false,
  cookie:{maxAge:1000*60*60*24,httpOnly:true,secure:false,sameSite:'lax'}
}));

// CSRF léger (token par session, vérifié sur POST)
app.use((req,res,next)=>{
  if(req.session&&!req.session.csrf)req.session.csrf=crypto.randomBytes(16).toString('hex');
  if(req.method==='POST'&&!req.path.startsWith('/api/')&&req.session?.csrf){
    if(req.body._csrf!==req.session.csrf)return res.status(403).send('CSRF token invalide. Rechargez la page.');
  }
  next();
});

// Rate limiter login
const loginAttempts=new Map();
function rlim(req,res,next){
  const ip=req.ip,now=Date.now(),r=loginAttempts.get(ip);
  if(r){
    r.a=r.a.filter(t=>now-t<900000);
    if(r.a.length>=5)return res.status(429).send('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>TIVA LIBRARY</title></head><body style="font-family:sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#eff6ff;"><div style="max-width:400px;padding:30px;background:white;border-radius:8px;border-top:4px solid #dc2626;text-align:center;box-shadow:0 2px 10px rgba(0,0,0,0.1);"><h2 style="color:#dc2626;">Trop de tentatives</h2><p style="color:#64748b;">Patientez 15 minutes avant de réessayer.</p></div></body></html>');
    r.a.push(now);
  }else loginAttempts.set(ip,{a:[now]});
  next();
}

// Auth middlewares
const au=(req,res,next)=>req.session?.user?next():res.redirect('/login');
const ad=(req,res,next)=>req.session?.user?.role==='ADMIN'?next():res.status(403).send('Admin requis.');
const upl=(req,res,next)=>{
  const u=req.session?.user;
  if(!u)return res.redirect('/login');
  if(u.role==='ADMIN'||u.responsable_seminaires)return next();
  return res.status(403).send('Vous n\'êtes pas autorisé à uploader. Contactez l\'admin.');
};

// Audit log
async function lg(uid,nom,action,detail){
  try{await pool.query("INSERT INTO tl_audit(user_id,user_nom,action,detail) VALUES($1,$2,$3,$4)",[uid,nom,action,detail]);}catch(e){console.error('Audit log failed:',e.message);}
}

// Multer pour upload
const storage=multer.diskStorage({
  destination:(req,file,cb)=>{
    const tmpDir=path.join(DATA_DIR,'tmp');
    if(!fs.existsSync(tmpDir))fs.mkdirSync(tmpDir,{recursive:true});
    cb(null,tmpDir);
  },
  filename:(req,file,cb)=>{
    const uid=crypto.randomBytes(8).toString('hex');
    cb(null,uid+'-'+Buffer.from(file.originalname,'latin1').toString('utf8').replace(/[^a-zA-Z0-9._-]/g,'_'));
  }
});
const ALLOWED_MIME=['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','image/jpeg','image/png'];
const ALLOWED_EXT=['.pdf','.doc','.docx','.ppt','.pptx','.xls','.xlsx','.jpg','.jpeg','.png'];
const upload=multer({
  storage,
  limits:{fileSize:100*1024*1024}, // 100 MB max
  fileFilter:(req,file,cb)=>{
    const ext=path.extname(file.originalname).toLowerCase();
    if(ALLOWED_EXT.includes(ext))cb(null,true);
    else cb(new Error('Type de fichier non autorisé : '+ext));
  }
});

function fileIcon(filename){
  const ext=path.extname(filename).toLowerCase();
  return{'.pdf':'📕','.doc':'📘','.docx':'📘','.ppt':'📙','.pptx':'📙','.xls':'📗','.xlsx':'📗','.jpg':'🖼️','.jpeg':'🖼️','.png':'🖼️'}[ext]||'📎';
}

// =========================================================================
// MIGRATIONS / SEED
// =========================================================================

async function migrate(){
  // Création manuelle de la table de session (éviter conflit PK 'session_pkey' avec TIVA PRO)
  await pool.query(`CREATE TABLE IF NOT EXISTS tl_session(
    sid VARCHAR NOT NULL COLLATE "default",
    sess JSON NOT NULL,
    expire TIMESTAMP(6) NOT NULL,
    CONSTRAINT tl_session_pkey PRIMARY KEY (sid) NOT DEFERRABLE INITIALLY IMMEDIATE
  ) WITH (OIDS=FALSE)`);
  await pool.query("CREATE INDEX IF NOT EXISTS tl_session_expire_idx ON tl_session (expire)");
  // Table sessions est créée par connect-pg-simple
  await pool.query(`CREATE TABLE IF NOT EXISTS tl_categories(
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    nom VARCHAR(100) NOT NULL,
    parent_id INTEGER REFERENCES tl_categories(id) ON DELETE SET NULL,
    ordre INTEGER DEFAULT 0,
    icone VARCHAR(10) DEFAULT '📁',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS tl_documents(
    id SERIAL PRIMARY KEY,
    titre VARCHAR(200) NOT NULL,
    description TEXT,
    categorie_id INTEGER REFERENCES tl_categories(id) ON DELETE SET NULL,
    fichier_nom VARCHAR(300) NOT NULL,
    fichier_path VARCHAR(500) NOT NULL,
    fichier_taille BIGINT NOT NULL,
    fichier_type VARCHAR(20),
    uploader_id INTEGER REFERENCES praticiens(id) ON DELETE SET NULL,
    uploader_nom VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await pool.query("CREATE INDEX IF NOT EXISTS idx_tl_doc_cat ON tl_documents(categorie_id)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_tl_doc_titre ON tl_documents(titre)");
  await pool.query(`CREATE TABLE IF NOT EXISTS tl_seminaires(
    id SERIAL PRIMARY KEY,
    titre VARCHAR(200) NOT NULL,
    date_seminaire DATE,
    intervenant VARCHAR(150),
    lieu VARCHAR(150),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS tl_seminaire_docs(
    id SERIAL PRIMARY KEY,
    seminaire_id INTEGER REFERENCES tl_seminaires(id) ON DELETE CASCADE,
    document_id INTEGER REFERENCES tl_documents(id) ON DELETE CASCADE,
    UNIQUE(seminaire_id,document_id)
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS tl_audit(
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    user_nom VARCHAR(100),
    action VARCHAR(50),
    detail TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  // Note : la colonne responsable_seminaires existe déjà dans praticiens (créée par TIVA PRO)
}

async function seed(){
  // Catégories par défaut si vides
  const c=await pool.query("SELECT COUNT(*)::int as n FROM tl_categories");
  if(c.rows[0].n===0){
    const cats=[
      {code:'protocoles',nom:'Protocoles',ordre:1,icone:'📋'},
      {code:'procedures',nom:'Procédures',ordre:2,icone:'⚙️'},
      {code:'seminaires_docs',nom:'Documents séminaires',ordre:3,icone:'🎓'},
      {code:'articles',nom:'Articles',ordre:4,icone:'📰'},
      {code:'recherche',nom:'Recherche',ordre:5,icone:'🔬'}
    ];
    for(const c of cats){
      await pool.query("INSERT INTO tl_categories(code,nom,ordre,icone) VALUES($1,$2,$3,$4) ON CONFLICT(code) DO NOTHING",[c.code,c.nom,c.ordre,c.icone]);
    }
    // Sous-catégories Protocoles
    const protId=(await pool.query("SELECT id FROM tl_categories WHERE code='protocoles'")).rows[0].id;
    const sousCats=[
      {code:'prot_cardiaque',nom:'Cardiaque',icone:'❤️'},
      {code:'prot_pediatrie',nom:'Pédiatrie',icone:'👶'},
      {code:'prot_obstetrique',nom:'Obstétrique',icone:'🤰'},
      {code:'prot_vasculaire',nom:'Vasculaire',icone:'🩸'},
      {code:'prot_orthopedie',nom:'Orthopédie',icone:'🦴'},
      {code:'prot_viscerale',nom:'Viscérale',icone:'🫀'},
      {code:'prot_neurochirurgie',nom:'Neurochirurgie',icone:'🧠'}
    ];
    for(let i=0;i<sousCats.length;i++){
      const sc=sousCats[i];
      await pool.query("INSERT INTO tl_categories(code,nom,parent_id,ordre,icone) VALUES($1,$2,$3,$4,$5) ON CONFLICT(code) DO NOTHING",[sc.code,sc.nom,protId,i+1,sc.icone]);
    }
    console.log('TIVA LIBRARY: catégories seedées');
  }
}

(async()=>{
  try{
    await migrate();
    await seed();
    console.log('TIVA LIBRARY: migrations OK');
    app.listen(PORT,()=>console.log(`TIVA LIBRARY listening on :${PORT}`));
  }catch(e){
    console.error('Startup error:',e);
    process.exit(1);
  }
})();

// =========================================================================
// AUTH (login partagé via praticiens TIVA PRO)
// =========================================================================

app.get('/login',AH(async(req,res)=>{
  const meds=(await pool.query("SELECT nom FROM praticiens WHERE is_active=true ORDER BY CASE WHEN role='ADMIN' THEN 0 WHEN role='SENIOR' THEN 1 ELSE 2 END, nom")).rows;
  const options=meds.map(m=>`<option value="${esc(m.nom)}">${esc(m.nom)}</option>`).join('');
  res.send(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connexion — TIVA LIBRARY</title>${CSS}</head><body style="display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;"><div class="card" style="width:400px;border-top:4px solid var(--primary);"><h1 style="text-align:center;color:var(--primary-dark);margin-bottom:6px;">📚 TIVA LIBRARY</h1><p style="text-align:center;color:var(--text-muted);font-size:13px;margin-bottom:18px;">Bibliothèque documentaire — Anesthésie</p><form method="POST" action="/login"><input type="hidden" name="_csrf" value="${req.session?.csrf||''}"><div style="margin-bottom:10px;"><label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px;color:var(--text-muted);">Identifiant</label><select name="nom" required style="width:100%;" autofocus><option value="">— Choisir —</option>${options}</select></div><div style="margin-bottom:14px;"><label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px;color:var(--text-muted);">Mot de passe</label><input type="password" name="password" required style="width:100%;"></div><button type="submit" class="btn btn-primary" style="width:100%;">Se connecter</button></form><p style="font-size:11px;color:var(--text-muted);text-align:center;margin-top:14px;margin-bottom:0;">Identifiants identiques à TIVA PRO</p></div></body></html>`);
}));

app.post('/login',rlim,AH(async(req,res)=>{
  const{nom,password}=req.body;
  if(!nom||!password)return res.redirect('/login');
  const r=await pool.query("SELECT * FROM praticiens WHERE nom=$1 AND is_active=true",[nom]);
  if(!r.rows.length||!(await bcrypt.compare(password,r.rows[0].password)))return res.redirect('/login');
  const u=r.rows[0];
  req.session.user={
    id:u.id,
    nom:u.nom,
    role:u.role,
    email:u.email,
    responsable_seminaires:!!u.responsable_seminaires
  };
  req.session.csrf=crypto.randomBytes(16).toString('hex');
  res.redirect('/');
}));

app.get('/logout',(req,res)=>{
  req.session.destroy(()=>res.redirect('/login'));
});

// =========================================================================
// DASHBOARD
// =========================================================================

app.get('/',au,AH(async(req,res)=>{
  const u=req.session.user;
  const cats=(await pool.query("SELECT c.*,(SELECT COUNT(*) FROM tl_documents WHERE categorie_id IN (SELECT id FROM tl_categories WHERE id=c.id OR parent_id=c.id))::int as nb_docs FROM tl_categories c WHERE c.parent_id IS NULL AND c.is_active=true ORDER BY c.ordre,c.nom")).rows;
  const totalDocs=(await pool.query("SELECT COUNT(*)::int as n,COALESCE(SUM(fichier_taille),0)::bigint as tot FROM tl_documents")).rows[0];
  const recentDocs=(await pool.query("SELECT d.*,c.nom as cat_nom FROM tl_documents d LEFT JOIN tl_categories c ON c.id=d.categorie_id ORDER BY d.created_at DESC LIMIT 5")).rows;
  const canUpload=u.role==='ADMIN'||u.responsable_seminaires;
  
  let actionTiles='';
  if(canUpload){
    actionTiles+=`<a href="/upload" class="nc">📤 Uploader un document<br><small style="font-weight:400;color:var(--text-muted);">Ajouter un fichier à la bibliothèque</small></a>`;
  }
  actionTiles+=`<a href="/agenda" class="nc">📅 Agenda séminaires<br><small style="font-weight:400;color:var(--text-muted);">Calendrier et matériel des séminaires</small></a>`;
  actionTiles+=`<a href="/search" class="nc">🔍 Recherche<br><small style="font-weight:400;color:var(--text-muted);">Trouver un document par titre</small></a>`;
  if(u.role==='ADMIN'){
    actionTiles+=`<a href="/admin" class="nc">⚙ Administration<br><small style="font-weight:400;color:var(--text-muted);">Catégories, audit, backup</small></a>`;
  }
  
  const catsHtml=cats.map(c=>`<a href="/cat/${c.id}" class="cat-tile"><div style="font-size:32px;margin-bottom:8px;">${c.icone}</div><h3 style="margin:0 0 4px 0;">${esc(c.nom)}</h3><small style="color:var(--text-muted);">${c.nb_docs} document${c.nb_docs>1?'s':''}</small></a>`).join('');
  
  const recentHtml=recentDocs.length?recentDocs.map(d=>`<div class="doc-row"><div class="doc-icon">${fileIcon(d.fichier_nom)}</div><div class="doc-info"><a href="/doc/${d.id}" class="doc-title">${esc(d.titre)}</a><div class="doc-meta">${esc(d.cat_nom||'—')} · ${fmtBytes(d.fichier_taille)} · ${new Date(d.created_at).toLocaleDateString('fr-BE')}</div></div></div>`).join(''):'<p style="color:var(--text-muted);font-size:12px;padding:10px;">Aucun document pour l\'instant.</p>';
  
  res.send(PL(req,'Accueil',`
<div class="card" style="background:linear-gradient(135deg,#1e3a8a 0%,#172554 100%);color:white;">
  <h1 style="color:white;margin-bottom:6px;">📚 TIVA LIBRARY</h1>
  <p style="margin:0;opacity:0.9;font-size:13px;">${totalDocs.n} document${totalDocs.n>1?'s':''} · ${fmtBytes(parseInt(totalDocs.tot))}</p>
</div>

<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;margin-bottom:18px;">${actionTiles}</div>

<h2>📂 Catégories</h2>
<div class="cat-grid">${catsHtml}</div>

<h2 style="margin-top:24px;">🕒 Documents récents</h2>
<div class="card" style="padding:0;">${recentHtml}</div>
`));
}));

// =========================================================================
// CATÉGORIES (navigation)
// =========================================================================

app.get('/cat/:id',au,AH(async(req,res)=>{
  const id=parseInt(req.params.id);
  if(isNaN(id))return res.status(400).send('Invalid id');
  const cat=(await pool.query("SELECT * FROM tl_categories WHERE id=$1",[id])).rows[0];
  if(!cat)return res.status(404).send('Catégorie introuvable.');
  const sousCats=(await pool.query("SELECT c.*,(SELECT COUNT(*) FROM tl_documents WHERE categorie_id=c.id)::int as nb_docs FROM tl_categories c WHERE parent_id=$1 AND is_active=true ORDER BY ordre,nom",[id])).rows;
  // Documents directs (pas dans sous-catégories)
  const docs=(await pool.query("SELECT * FROM tl_documents WHERE categorie_id=$1 ORDER BY created_at DESC",[id])).rows;
  const parent=cat.parent_id?(await pool.query("SELECT * FROM tl_categories WHERE id=$1",[cat.parent_id])).rows[0]:null;
  const u=req.session.user;
  const canUpload=u.role==='ADMIN'||u.responsable_seminaires;
  
  const breadcrumb=parent?`<a href="/cat/${parent.id}" style="color:var(--text-muted);text-decoration:none;">${parent.icone} ${esc(parent.nom)}</a> › `:'';
  
  let sousCatsHtml='';
  if(sousCats.length){
    sousCatsHtml=`<h3>Sous-catégories</h3><div class="cat-grid" style="margin-bottom:18px;">${sousCats.map(c=>`<a href="/cat/${c.id}" class="cat-tile"><div style="font-size:24px;margin-bottom:6px;">${c.icone}</div><b>${esc(c.nom)}</b><br><small style="color:var(--text-muted);">${c.nb_docs} doc${c.nb_docs>1?'s':''}</small></a>`).join('')}</div>`;
  }
  
  const docsHtml=docs.length?docs.map(d=>`<div class="doc-row">
    <div class="doc-icon">${fileIcon(d.fichier_nom)}</div>
    <div class="doc-info">
      <a href="/doc/${d.id}" class="doc-title">${esc(d.titre)}</a>
      <div class="doc-meta">${esc(d.fichier_nom)} · ${fmtBytes(d.fichier_taille)} · uploadé par ${esc(d.uploader_nom||'—')} le ${new Date(d.created_at).toLocaleDateString('fr-BE')}</div>
      ${d.description?`<div style="font-size:12px;color:var(--text-muted);margin-top:3px;">${esc(d.description)}</div>`:''}
    </div>
    <div class="doc-actions">
      <a href="/doc/${d.id}" class="btn btn-outline btn-sm">👁 Voir</a>
      <a href="/download/${d.id}" class="btn btn-primary btn-sm">⬇ Télécharger</a>
    </div>
  </div>`).join(''):(sousCats.length?'':'<p style="color:var(--text-muted);font-size:13px;padding:14px;text-align:center;">Aucun document dans cette catégorie.</p>');
  
  res.send(PL(req,cat.nom,`
<div class="ptb">
  <div>
    <small style="color:var(--text-muted);">${breadcrumb}</small>
    <h1 style="margin:0;">${cat.icone} ${esc(cat.nom)}</h1>
  </div>
  <div style="display:flex;gap:6px;flex-wrap:wrap;">
    ${canUpload?`<a href="/upload?cat=${cat.id}" class="btn btn-primary">📤 Ajouter un document</a>`:''}
  </div>
</div>

${sousCatsHtml}
${docs.length||sousCats.length?`<h3>Documents</h3><div class="card" style="padding:0;">${docsHtml}</div>`:docsHtml}
`));
}));

// =========================================================================
// DOCUMENT DETAIL + PREVIEW
// =========================================================================

app.get('/doc/:id',au,AH(async(req,res)=>{
  const id=parseInt(req.params.id);
  if(isNaN(id))return res.status(400).send('Invalid id');
  const d=(await pool.query("SELECT d.*,c.nom as cat_nom,c.id as cat_id FROM tl_documents d LEFT JOIN tl_categories c ON c.id=d.categorie_id WHERE d.id=$1",[id])).rows[0];
  if(!d)return res.status(404).send('Document introuvable.');
  const u=req.session.user;
  const canDelete=u.role==='ADMIN'||(u.responsable_seminaires&&d.uploader_id===u.id);
  const ext=path.extname(d.fichier_nom).toLowerCase();
  const isPdf=ext==='.pdf';
  const isImage=['.jpg','.jpeg','.png'].includes(ext);
  
  let preview='';
  if(isPdf){
    preview=`<iframe src="/download/${id}?inline=1" style="width:100%;height:75vh;border:1px solid var(--border);border-radius:5px;"></iframe>`;
  }else if(isImage){
    preview=`<img src="/download/${id}?inline=1" style="max-width:100%;max-height:75vh;border:1px solid var(--border);border-radius:5px;">`;
  }else{
    preview=`<div class="alert alert-info"><b>Aperçu non disponible</b> pour ce type de fichier (${ext}). Cliquez sur "Télécharger" pour ouvrir le document.</div>`;
  }
  
  res.send(PL(req,d.titre,`
<div class="ptb">
  <div>
    ${d.cat_id?`<small style="color:var(--text-muted);"><a href="/cat/${d.cat_id}" style="color:var(--text-muted);text-decoration:none;">${esc(d.cat_nom)}</a> › </small>`:''}
    <h1 style="margin:0;">${fileIcon(d.fichier_nom)} ${esc(d.titre)}</h1>
    ${d.description?`<p style="color:var(--text-muted);margin:6px 0 0 0;">${esc(d.description)}</p>`:''}
  </div>
  <div style="display:flex;gap:6px;flex-wrap:wrap;">
    <a href="/download/${id}" class="btn btn-primary">⬇ Télécharger</a>
    ${canDelete?`<form action="/api/doc/${id}/delete" method="POST" style="margin:0;display:inline;" onsubmit="return confirm('Supprimer définitivement ce document ?');">${csrfField(req)}<button class="btn btn-danger">🗑 Supprimer</button></form>`:''}
  </div>
</div>

<div class="card" style="font-size:12px;color:var(--text-muted);display:flex;gap:18px;flex-wrap:wrap;">
  <span><b>Fichier :</b> ${esc(d.fichier_nom)}</span>
  <span><b>Taille :</b> ${fmtBytes(d.fichier_taille)}</span>
  <span><b>Uploadé par :</b> ${esc(d.uploader_nom||'—')}</span>
  <span><b>Date :</b> ${new Date(d.created_at).toLocaleDateString('fr-BE')}</span>
</div>

${preview}
`));
}));

// =========================================================================
// DOWNLOAD
// =========================================================================

app.get('/download/:id',au,AH(async(req,res)=>{
  const id=parseInt(req.params.id);
  if(isNaN(id))return res.status(400).send('Invalid id');
  const d=(await pool.query("SELECT * FROM tl_documents WHERE id=$1",[id])).rows[0];
  if(!d)return res.status(404).send('Document introuvable.');
  const filePath=path.join(FILES_DIR,d.fichier_path);
  if(!fs.existsSync(filePath))return res.status(404).send('Fichier physique manquant.');
  if(req.query.inline==='1'){
    res.setHeader('Content-Disposition','inline; filename="'+d.fichier_nom.replace(/"/g,'')+'"');
  }else{
    res.setHeader('Content-Disposition','attachment; filename="'+d.fichier_nom.replace(/"/g,'')+'"');
  }
  res.sendFile(filePath);
}));

// =========================================================================
// UPLOAD
// =========================================================================

app.get('/upload',upl,AH(async(req,res)=>{
  const cats=(await pool.query("SELECT c.id,c.nom,c.icone,p.nom as parent_nom FROM tl_categories c LEFT JOIN tl_categories p ON p.id=c.parent_id WHERE c.is_active=true ORDER BY COALESCE(p.ordre,c.ordre),p.nom NULLS FIRST,c.ordre,c.nom")).rows;
  const presetCat=req.query.cat?parseInt(req.query.cat):null;
  res.send(PL(req,'Upload',`
<div class="ptb"><h1>📤 Ajouter un document</h1><a href="/" class="btn btn-outline">← Retour</a></div>
<div class="card">
<form method="POST" action="/api/upload" enctype="multipart/form-data">
${csrfField(req)}
<div style="margin-bottom:14px;">
  <label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px;color:var(--text-muted);">Titre *</label>
  <input type="text" name="titre" required maxlength="200" style="width:100%;" autofocus>
</div>
<div style="margin-bottom:14px;">
  <label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px;color:var(--text-muted);">Description (optionnel)</label>
  <textarea name="description" rows="3" maxlength="500" style="width:100%;font-family:inherit;"></textarea>
</div>
<div style="margin-bottom:14px;">
  <label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px;color:var(--text-muted);">Catégorie *</label>
  <select name="categorie_id" required style="width:100%;">
    <option value="">— Choisir —</option>
    ${cats.map(c=>`<option value="${c.id}" ${presetCat===c.id?'selected':''}>${c.parent_nom?`${esc(c.parent_nom)} › `:''}${c.icone} ${esc(c.nom)}</option>`).join('')}
  </select>
</div>
<div style="margin-bottom:14px;">
  <label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px;color:var(--text-muted);">Fichier * (max 100 MB — PDF, Word, PowerPoint, Excel, images)</label>
  <input type="file" name="fichier" required accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.jpg,.jpeg,.png" style="width:100%;">
</div>
<button type="submit" class="btn btn-primary">📤 Uploader</button>
<a href="/" class="btn btn-outline">Annuler</a>
</form>
</div>
`));
}));

app.post('/api/upload',upl,(req,res)=>{
  upload.single('fichier')(req,res,async(err)=>{
    if(err){
      console.error('Upload error:',err.message);
      return res.status(400).send(`<!DOCTYPE html><html><body style="font-family:sans-serif;padding:20px;">${CSS}<div class="card alert alert-danger"><b>Erreur upload :</b> ${esc(err.message)}</div><a href="/upload" class="btn btn-outline">← Retour</a></body></html>`);
    }
    if(req.body._csrf!==req.session.csrf){
      if(req.file)fs.unlinkSync(req.file.path);
      return res.status(403).send('CSRF invalide');
    }
    if(!req.file)return res.status(400).send('Aucun fichier reçu.');
    try{
      const{titre,description,categorie_id}=req.body;
      if(!titre||!categorie_id){
        fs.unlinkSync(req.file.path);
        return res.status(400).send('Titre et catégorie requis.');
      }
      // Déplacer le fichier vers la catégorie
      const cat=(await pool.query("SELECT code FROM tl_categories WHERE id=$1",[categorie_id])).rows[0];
      const catCode=cat?cat.code:'autres';
      const catDir=path.join(FILES_DIR,catCode);
      if(!fs.existsSync(catDir))fs.mkdirSync(catDir,{recursive:true});
      const finalName=req.file.filename;
      const finalPath=path.join(catDir,finalName);
      fs.renameSync(req.file.path,finalPath);
      const relPath=path.join(catCode,finalName);
      const u=req.session.user;
      const ext=path.extname(req.file.originalname).toLowerCase().replace('.','');
      const r=await pool.query("INSERT INTO tl_documents(titre,description,categorie_id,fichier_nom,fichier_path,fichier_taille,fichier_type,uploader_id,uploader_nom) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id",[titre.trim().substring(0,200),description?description.trim().substring(0,500):null,parseInt(categorie_id),Buffer.from(req.file.originalname,'latin1').toString('utf8'),relPath,req.file.size,ext,u.id,u.nom]);
      await lg(u.id,u.nom,'upload',`Doc#${r.rows[0].id} "${titre}" (${fmtBytes(req.file.size)}) → cat#${categorie_id}`);
      res.redirect('/doc/'+r.rows[0].id);
    }catch(e){
      console.error('Upload finalize error:',e);
      if(req.file&&fs.existsSync(req.file.path))fs.unlinkSync(req.file.path);
      res.status(500).send('Erreur serveur lors de l\'upload : '+esc(e.message));
    }
  });
});

// =========================================================================
// DELETE
// =========================================================================

app.post('/api/doc/:id/delete',au,AH(async(req,res)=>{
  const id=parseInt(req.params.id);
  if(isNaN(id))return res.status(400).send('Invalid id');
  const d=(await pool.query("SELECT * FROM tl_documents WHERE id=$1",[id])).rows[0];
  if(!d)return res.status(404).send('Document introuvable.');
  const u=req.session.user;
  const canDelete=u.role==='ADMIN'||(u.responsable_seminaires&&d.uploader_id===u.id);
  if(!canDelete)return res.status(403).send('Non autorisé.');
  // Supprimer le fichier physique
  const filePath=path.join(FILES_DIR,d.fichier_path);
  if(fs.existsSync(filePath))fs.unlinkSync(filePath);
  await pool.query("DELETE FROM tl_documents WHERE id=$1",[id]);
  await lg(u.id,u.nom,'delete',`Doc#${id} "${d.titre}"`);
  res.redirect(d.categorie_id?`/cat/${d.categorie_id}`:'/');
}));

// =========================================================================
// SEARCH
// =========================================================================

app.get('/search',au,AH(async(req,res)=>{
  const q=(req.query.q||'').trim();
  let docs=[];
  if(q){
    docs=(await pool.query("SELECT d.*,c.nom as cat_nom FROM tl_documents d LEFT JOIN tl_categories c ON c.id=d.categorie_id WHERE LOWER(d.titre) LIKE LOWER($1) OR LOWER(d.description) LIKE LOWER($1) OR LOWER(d.fichier_nom) LIKE LOWER($1) ORDER BY d.created_at DESC LIMIT 50",['%'+q+'%'])).rows;
  }
  res.send(PL(req,'Recherche',`
<div class="ptb"><h1>🔍 Recherche</h1><a href="/" class="btn btn-outline">← Retour</a></div>
<div class="card">
<form method="GET" action="/search" class="search-bar">
  <input type="text" name="q" value="${esc(q)}" placeholder="Rechercher par titre, description, nom de fichier..." autofocus>
  <button type="submit" class="btn btn-primary">Rechercher</button>
</form>
${q?`<p style="color:var(--text-muted);font-size:12px;margin:0;">${docs.length} résultat${docs.length>1?'s':''} pour « ${esc(q)} »</p>`:''}
</div>
${q&&docs.length===0?'<div class="alert alert-info">Aucun document trouvé.</div>':''}
${docs.length?`<div class="card" style="padding:0;">${docs.map(d=>`<div class="doc-row"><div class="doc-icon">${fileIcon(d.fichier_nom)}</div><div class="doc-info"><a href="/doc/${d.id}" class="doc-title">${esc(d.titre)}</a><div class="doc-meta">${esc(d.cat_nom||'—')} · ${fmtBytes(d.fichier_taille)} · ${new Date(d.created_at).toLocaleDateString('fr-BE')}</div>${d.description?`<div style="font-size:12px;color:var(--text-muted);margin-top:3px;">${esc(d.description)}</div>`:''}</div><div class="doc-actions"><a href="/doc/${d.id}" class="btn btn-outline btn-sm">👁 Voir</a></div></div>`).join('')}</div>`:''}
`));
}));

// =========================================================================
// AGENDA SÉMINAIRES
// =========================================================================

app.get('/agenda',au,AH(async(req,res)=>{
  const u=req.session.user;
  const canManage=u.role==='ADMIN'||u.responsable_seminaires;
  const upcoming=(await pool.query("SELECT s.*,(SELECT COUNT(*)::int FROM tl_seminaire_docs WHERE seminaire_id=s.id) as nb_docs FROM tl_seminaires s WHERE date_seminaire>=CURRENT_DATE OR date_seminaire IS NULL ORDER BY date_seminaire NULLS LAST,id DESC")).rows;
  const past=(await pool.query("SELECT s.*,(SELECT COUNT(*)::int FROM tl_seminaire_docs WHERE seminaire_id=s.id) as nb_docs FROM tl_seminaires s WHERE date_seminaire<CURRENT_DATE ORDER BY date_seminaire DESC LIMIT 30")).rows;
  
  function semCard(s){
    const dt=s.date_seminaire?new Date(s.date_seminaire).toLocaleDateString('fr-BE',{weekday:'long',year:'numeric',month:'long',day:'numeric'}):'Date à définir';
    return`<div class="doc-row"><div style="background:var(--primary-surface);color:var(--primary-dark);padding:8px 12px;border-radius:5px;font-weight:700;font-size:11px;text-align:center;min-width:80px;">${dt}</div><div class="doc-info"><a href="/agenda/${s.id}" class="doc-title">🎓 ${esc(s.titre)}</a><div class="doc-meta">${s.intervenant?`👤 ${esc(s.intervenant)} · `:''}${s.lieu?`📍 ${esc(s.lieu)} · `:''}${s.nb_docs} document${s.nb_docs>1?'s':''}</div>${s.description?`<div style="font-size:12px;color:var(--text-muted);margin-top:3px;">${esc(s.description)}</div>`:''}</div><div class="doc-actions"><a href="/agenda/${s.id}" class="btn btn-outline btn-sm">Voir</a></div></div>`;
  }
  
  res.send(PL(req,'Agenda séminaires',`
<div class="ptb">
  <h1>📅 Agenda séminaires</h1>
  <div style="display:flex;gap:6px;flex-wrap:wrap;">
    ${canManage?`<a href="/agenda/new" class="btn btn-primary">➕ Nouveau séminaire</a>`:''}
    <a href="/" class="btn btn-outline">← Retour</a>
  </div>
</div>

<h3>📆 À venir & en attente de date</h3>
${upcoming.length?`<div class="card" style="padding:0;">${upcoming.map(semCard).join('')}</div>`:'<div class="alert alert-info">Aucun séminaire à venir pour le moment.</div>'}

<h3 style="margin-top:24px;">🗂 Historique récent</h3>
${past.length?`<div class="card" style="padding:0;">${past.map(semCard).join('')}</div>`:'<p style="color:var(--text-muted);font-size:13px;">Aucun séminaire passé.</p>'}
`));
}));

app.get('/agenda/new',upl,AH(async(req,res)=>{
  res.send(PL(req,'Nouveau séminaire',`
<div class="ptb"><h1>➕ Nouveau séminaire</h1><a href="/agenda" class="btn btn-outline">← Retour</a></div>
<div class="card">
<form method="POST" action="/api/seminaire">
${csrfField(req)}
<div style="margin-bottom:14px;"><label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px;color:var(--text-muted);">Titre *</label><input type="text" name="titre" required maxlength="200" style="width:100%;" autofocus></div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">
  <div><label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px;color:var(--text-muted);">Date</label><input type="date" name="date_seminaire" style="width:100%;"></div>
  <div><label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px;color:var(--text-muted);">Lieu</label><input type="text" name="lieu" maxlength="150" style="width:100%;"></div>
</div>
<div style="margin-bottom:14px;"><label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px;color:var(--text-muted);">Intervenant</label><input type="text" name="intervenant" maxlength="150" style="width:100%;"></div>
<div style="margin-bottom:14px;"><label style="display:block;font-size:12px;font-weight:700;margin-bottom:4px;color:var(--text-muted);">Description</label><textarea name="description" rows="3" maxlength="1000" style="width:100%;font-family:inherit;"></textarea></div>
<button type="submit" class="btn btn-primary">Créer</button>
<a href="/agenda" class="btn btn-outline">Annuler</a>
</form>
</div>
`));
}));

app.post('/api/seminaire',upl,AH(async(req,res)=>{
  const{titre,date_seminaire,lieu,intervenant,description}=req.body;
  if(!titre)return res.status(400).send('Titre requis');
  const r=await pool.query("INSERT INTO tl_seminaires(titre,date_seminaire,lieu,intervenant,description) VALUES($1,$2,$3,$4,$5) RETURNING id",[titre.trim().substring(0,200),date_seminaire||null,lieu?lieu.trim().substring(0,150):null,intervenant?intervenant.trim().substring(0,150):null,description?description.trim().substring(0,1000):null]);
  const u=req.session.user;
  await lg(u.id,u.nom,'seminaire-create',`Sem#${r.rows[0].id} "${titre}"`);
  res.redirect('/agenda/'+r.rows[0].id);
}));

app.get('/agenda/:id',au,AH(async(req,res)=>{
  const id=parseInt(req.params.id);
  if(isNaN(id))return res.status(400).send('Invalid id');
  const s=(await pool.query("SELECT * FROM tl_seminaires WHERE id=$1",[id])).rows[0];
  if(!s)return res.status(404).send('Séminaire introuvable.');
  const docs=(await pool.query("SELECT d.* FROM tl_seminaire_docs sd JOIN tl_documents d ON d.id=sd.document_id WHERE sd.seminaire_id=$1 ORDER BY d.created_at DESC",[id])).rows;
  const u=req.session.user;
  const canManage=u.role==='ADMIN'||u.responsable_seminaires;
  const dt=s.date_seminaire?new Date(s.date_seminaire).toLocaleDateString('fr-BE',{weekday:'long',year:'numeric',month:'long',day:'numeric'}):'Date à définir';
  
  // Tous les documents pour le sélecteur
  const allDocs=canManage?(await pool.query("SELECT d.id,d.titre FROM tl_documents d WHERE d.id NOT IN (SELECT document_id FROM tl_seminaire_docs WHERE seminaire_id=$1) ORDER BY d.titre",[id])).rows:[];
  
  res.send(PL(req,s.titre,`
<div class="ptb">
  <div>
    <small style="color:var(--text-muted);"><a href="/agenda" style="color:var(--text-muted);text-decoration:none;">📅 Agenda</a> ›</small>
    <h1 style="margin:0;">🎓 ${esc(s.titre)}</h1>
    <p style="color:var(--text-muted);margin:6px 0 0 0;">${dt}</p>
  </div>
  <div style="display:flex;gap:6px;flex-wrap:wrap;">
    ${canManage?`<form action="/api/seminaire/${id}/delete" method="POST" style="margin:0;display:inline;" onsubmit="return confirm('Supprimer ce séminaire ? (les documents liés ne seront pas supprimés)');">${csrfField(req)}<button class="btn btn-danger">🗑 Supprimer</button></form>`:''}
  </div>
</div>

<div class="card">
  ${s.intervenant?`<p><b>👤 Intervenant :</b> ${esc(s.intervenant)}</p>`:''}
  ${s.lieu?`<p><b>📍 Lieu :</b> ${esc(s.lieu)}</p>`:''}
  ${s.description?`<p><b>📝 Description :</b><br>${esc(s.description)}</p>`:''}
</div>

<h3>📎 Documents associés (${docs.length})</h3>
${docs.length?`<div class="card" style="padding:0;">${docs.map(d=>`<div class="doc-row"><div class="doc-icon">${fileIcon(d.fichier_nom)}</div><div class="doc-info"><a href="/doc/${d.id}" class="doc-title">${esc(d.titre)}</a><div class="doc-meta">${fmtBytes(d.fichier_taille)} · ${new Date(d.created_at).toLocaleDateString('fr-BE')}</div></div><div class="doc-actions"><a href="/doc/${d.id}" class="btn btn-outline btn-sm">👁</a><a href="/download/${d.id}" class="btn btn-primary btn-sm">⬇</a>${canManage?`<form action="/api/seminaire/${id}/unlink" method="POST" style="margin:0;display:inline;" onsubmit="return confirm('Retirer ce document du séminaire ?');">${csrfField(req)}<input type="hidden" name="doc_id" value="${d.id}"><button class="btn btn-outline btn-sm" style="border-color:var(--danger);color:var(--danger);">−</button></form>`:''}</div></div>`).join('')}</div>`:'<p style="color:var(--text-muted);font-size:13px;padding:14px;">Aucun document associé.</p>'}

${canManage?`<div class="card" style="margin-top:14px;">
  <h4>➕ Associer un document existant</h4>
  ${allDocs.length?`<form action="/api/seminaire/${id}/link" method="POST" style="display:flex;gap:8px;align-items:center;">
    ${csrfField(req)}
    <select name="doc_id" required style="flex:1;"><option value="">— Choisir un document —</option>${allDocs.map(d=>`<option value="${d.id}">${esc(d.titre)}</option>`).join('')}</select>
    <button class="btn btn-primary">Associer</button>
  </form><p style="font-size:11px;color:var(--text-muted);margin:8px 0 0 0;">Ou <a href="/upload">uploadez d'abord un nouveau document</a> puis revenez ici.</p>`:'<p style="color:var(--text-muted);font-size:12px;">Tous les documents existants sont déjà associés. <a href="/upload">Uploader un nouveau document</a></p>'}
</div>`:''}
`));
}));

app.post('/api/seminaire/:id/link',upl,AH(async(req,res)=>{
  const id=parseInt(req.params.id);
  const docId=parseInt(req.body.doc_id);
  if(isNaN(id)||isNaN(docId))return res.status(400).send('Params invalides');
  await pool.query("INSERT INTO tl_seminaire_docs(seminaire_id,document_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[id,docId]);
  const u=req.session.user;
  await lg(u.id,u.nom,'seminaire-link',`Sem#${id} ← Doc#${docId}`);
  res.redirect('/agenda/'+id);
}));

app.post('/api/seminaire/:id/unlink',upl,AH(async(req,res)=>{
  const id=parseInt(req.params.id);
  const docId=parseInt(req.body.doc_id);
  if(isNaN(id)||isNaN(docId))return res.status(400).send('Params invalides');
  await pool.query("DELETE FROM tl_seminaire_docs WHERE seminaire_id=$1 AND document_id=$2",[id,docId]);
  const u=req.session.user;
  await lg(u.id,u.nom,'seminaire-unlink',`Sem#${id} ✕ Doc#${docId}`);
  res.redirect('/agenda/'+id);
}));

app.post('/api/seminaire/:id/delete',upl,AH(async(req,res)=>{
  const id=parseInt(req.params.id);
  if(isNaN(id))return res.status(400).send('Invalid id');
  const u=req.session.user;
  if(u.role!=='ADMIN'&&!u.responsable_seminaires)return res.status(403).send('Non autorisé');
  await pool.query("DELETE FROM tl_seminaires WHERE id=$1",[id]);
  await lg(u.id,u.nom,'seminaire-delete',`Sem#${id}`);
  res.redirect('/agenda');
}));

// =========================================================================
// ADMIN
// =========================================================================

app.get('/admin',ad,AH(async(req,res)=>{
  const stats=(await pool.query("SELECT COUNT(*)::int as nb_docs,COALESCE(SUM(fichier_taille),0)::bigint as taille_totale FROM tl_documents")).rows[0];
  const nbCats=(await pool.query("SELECT COUNT(*)::int as n FROM tl_categories WHERE is_active=true")).rows[0].n;
  const nbSems=(await pool.query("SELECT COUNT(*)::int as n FROM tl_seminaires")).rows[0].n;
  const recentAudit=(await pool.query("SELECT * FROM tl_audit ORDER BY created_at DESC LIMIT 30")).rows;
  res.send(PL(req,'Administration',`
<div class="ptb"><h1>⚙ Administration</h1><a href="/" class="btn btn-outline">← Accueil</a></div>

<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;margin-bottom:18px;">
  <div class="card" style="text-align:center;background:var(--primary-surface);"><h2 style="margin:0;color:var(--primary-dark);">${stats.nb_docs}</h2><small>documents</small></div>
  <div class="card" style="text-align:center;background:var(--primary-surface);"><h2 style="margin:0;color:var(--primary-dark);">${fmtBytes(parseInt(stats.taille_totale))}</h2><small>stockage utilisé</small></div>
  <div class="card" style="text-align:center;background:var(--primary-surface);"><h2 style="margin:0;color:var(--primary-dark);">${nbCats}</h2><small>catégories</small></div>
  <div class="card" style="text-align:center;background:var(--primary-surface);"><h2 style="margin:0;color:var(--primary-dark);">${nbSems}</h2><small>séminaires</small></div>
</div>

<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;margin-bottom:18px;">
  <a href="/admin/categories" class="nc">📂 Gérer les catégories<br><small style="font-weight:400;color:var(--text-muted);">Ajouter, renommer, désactiver</small></a>
  <a href="/api/backup" class="nc">💾 Télécharger un backup<br><small style="font-weight:400;color:var(--text-muted);">ZIP complet (DB + fichiers)</small></a>
</div>

<h3>📋 Audit récent</h3>
<div class="card" style="padding:0;overflow-x:auto;">
<table>
<thead><tr><th>Date</th><th>Utilisateur</th><th>Action</th><th>Détail</th></tr></thead>
<tbody>${recentAudit.map(a=>`<tr><td style="font-size:11px;color:var(--text-muted);">${new Date(a.created_at).toLocaleString('fr-BE')}</td><td><b>${esc(a.user_nom||'—')}</b></td><td><span style="background:var(--bg-alt);padding:2px 6px;border-radius:3px;font-size:10px;font-weight:700;">${esc(a.action)}</span></td><td style="font-size:12px;color:var(--text-muted);">${esc(a.detail||'')}</td></tr>`).join('')}</tbody>
</table>
</div>
`));
}));

app.get('/admin/categories',ad,AH(async(req,res)=>{
  const cats=(await pool.query("SELECT c.*,p.nom as parent_nom,(SELECT COUNT(*)::int FROM tl_documents WHERE categorie_id=c.id) as nb_docs FROM tl_categories c LEFT JOIN tl_categories p ON p.id=c.parent_id ORDER BY COALESCE(p.ordre,c.ordre),p.nom NULLS FIRST,c.ordre,c.nom")).rows;
  const parents=cats.filter(c=>!c.parent_id);
  res.send(PL(req,'Catégories',`
<div class="ptb"><h1>📂 Catégories</h1><a href="/admin" class="btn btn-outline">← Admin</a></div>

<div class="card">
<h4>➕ Ajouter une catégorie</h4>
<form method="POST" action="/api/categorie">
${csrfField(req)}
<div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr 1fr;gap:8px;align-items:end;">
  <div><label style="font-size:11px;font-weight:700;color:var(--text-muted);display:block;">Nom</label><input type="text" name="nom" required maxlength="100" style="width:100%;"></div>
  <div><label style="font-size:11px;font-weight:700;color:var(--text-muted);display:block;">Code (unique)</label><input type="text" name="code" required maxlength="50" pattern="[a-z0-9_]+" style="width:100%;" placeholder="prot_xxx"></div>
  <div><label style="font-size:11px;font-weight:700;color:var(--text-muted);display:block;">Icône</label><input type="text" name="icone" maxlength="10" style="width:100%;" value="📁"></div>
  <div><label style="font-size:11px;font-weight:700;color:var(--text-muted);display:block;">Parent</label><select name="parent_id" style="width:100%;"><option value="">— Racine —</option>${parents.map(p=>`<option value="${p.id}">${esc(p.nom)}</option>`).join('')}</select></div>
  <div><button class="btn btn-primary" style="width:100%;">Ajouter</button></div>
</div>
</form>
</div>

<div class="card" style="padding:0;overflow-x:auto;">
<table>
<thead><tr><th>Icône</th><th>Nom</th><th>Code</th><th>Parent</th><th>Docs</th><th>Actif</th><th></th></tr></thead>
<tbody>
${cats.map(c=>`<tr>
<td style="font-size:20px;">${c.icone}</td>
<td><b>${esc(c.nom)}</b></td>
<td style="font-family:monospace;font-size:11px;color:var(--text-muted);">${esc(c.code)}</td>
<td>${esc(c.parent_nom||'—')}</td>
<td style="text-align:center;">${c.nb_docs}</td>
<td>${c.is_active?'<span style="color:var(--success);">✓</span>':'<span style="color:var(--text-muted);">—</span>'}</td>
<td>
  <form method="POST" action="/api/categorie/${c.id}/toggle" style="display:inline;margin:0;">${csrfField(req)}<button class="btn btn-outline btn-sm">${c.is_active?'Désactiver':'Réactiver'}</button></form>
  ${c.nb_docs===0?`<form method="POST" action="/api/categorie/${c.id}/delete" style="display:inline;margin:0;" onsubmit="return confirm('Supprimer définitivement cette catégorie ?');">${csrfField(req)}<button class="btn btn-outline btn-sm" style="border-color:var(--danger);color:var(--danger);">🗑</button></form>`:''}
</td>
</tr>`).join('')}
</tbody>
</table>
</div>
`));
}));

app.post('/api/categorie',ad,AH(async(req,res)=>{
  const{nom,code,icone,parent_id}=req.body;
  if(!nom||!code)return res.status(400).send('Nom et code requis');
  try{
    await pool.query("INSERT INTO tl_categories(nom,code,icone,parent_id,ordre) VALUES($1,$2,$3,$4,COALESCE((SELECT MAX(ordre)+1 FROM tl_categories WHERE parent_id IS NOT DISTINCT FROM $4),1))",[nom.trim().substring(0,100),code.trim().toLowerCase().substring(0,50),(icone||'📁').substring(0,10),parent_id?parseInt(parent_id):null]);
  }catch(e){
    return res.status(400).send('Erreur : '+esc(e.message));
  }
  res.redirect('/admin/categories');
}));

app.post('/api/categorie/:id/toggle',ad,AH(async(req,res)=>{
  const id=parseInt(req.params.id);
  await pool.query("UPDATE tl_categories SET is_active=NOT is_active WHERE id=$1",[id]);
  res.redirect('/admin/categories');
}));

app.post('/api/categorie/:id/delete',ad,AH(async(req,res)=>{
  const id=parseInt(req.params.id);
  const docs=await pool.query("SELECT COUNT(*)::int as n FROM tl_documents WHERE categorie_id=$1",[id]);
  if(docs.rows[0].n>0)return res.status(400).send('Impossible : catégorie contient des documents');
  await pool.query("DELETE FROM tl_categories WHERE id=$1",[id]);
  res.redirect('/admin/categories');
}));

// =========================================================================
// BACKUP
// =========================================================================

app.get('/api/backup',ad,AH(async(req,res)=>{
  const date=new Date().toISOString().split('T')[0];
  res.attachment(`tiva-library-backup-${date}.zip`);
  const archive=archiver('zip',{zlib:{level:6}});
  archive.on('error',err=>{console.error('Archive error:',err);res.status(500).end();});
  archive.pipe(res);
  // Ajouter tous les fichiers
  if(fs.existsSync(FILES_DIR)){
    archive.directory(FILES_DIR,'files');
  }
  // Dump simplifié de la DB (en JSON)
  const docs=(await pool.query("SELECT * FROM tl_documents ORDER BY id")).rows;
  const cats=(await pool.query("SELECT * FROM tl_categories ORDER BY id")).rows;
  const sems=(await pool.query("SELECT * FROM tl_seminaires ORDER BY id")).rows;
  const semDocs=(await pool.query("SELECT * FROM tl_seminaire_docs ORDER BY id")).rows;
  const dbDump={exported_at:new Date().toISOString(),categories:cats,documents:docs,seminaires:sems,seminaire_docs:semDocs};
  archive.append(JSON.stringify(dbDump,null,2),{name:'database.json'});
  archive.append(`# TIVA LIBRARY Backup\n\nDate : ${date}\n\n## Contenu\n\n- /files : tous les fichiers uploadés\n- /database.json : métadonnées (catégories, documents, séminaires)\n\n## Restauration\n\n1. Restaurer les fichiers dans le dossier configuré\n2. Importer database.json via les API admin\n`,{name:'README.md'});
  archive.finalize();
  const u=req.session.user;
  await lg(u.id,u.nom,'backup',`Backup ZIP généré`);
}));

// =========================================================================
// ERREURS
// =========================================================================

app.use((err,req,res,next)=>{
  console.error('ERR:',err.message,err.stack?.split('\n')[1]);
  if(res.headersSent)return next(err);
  res.status(500).send(`<!DOCTYPE html><html><head><meta charset="UTF-8">${CSS}</head><body><div class="container"><div class="card alert alert-danger"><b>Erreur serveur</b><br>${esc(err.message)}</div><a href="/" class="btn btn-outline">← Accueil</a></div></body></html>`);
});

app.use((req,res)=>{
  res.status(404).send(`<!DOCTYPE html><html><head><meta charset="UTF-8">${CSS}</head><body><div class="container"><div class="card alert alert-warning"><h2>404 — Page introuvable</h2></div><a href="/" class="btn btn-primary">← Accueil</a></div></body></html>`);
});

// Note : app.listen est appelé dans le bloc async après migrations (voir plus haut)
