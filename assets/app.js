/* Theta Accounts — public browser client. Uses ONLY Supabase's publishable key.
   Authorization is enforced by Supabase RLS, not by this JavaScript. */
'use strict';

const CONFIG = Object.freeze({
  supabaseUrl: 'https://gwrfebfvcfqcbjlbabnv.supabase.co',
  publishableKey: 'sb_publishable_hLMgsoZCpq7erffNTElVIg_G3ybpe8d',
});
const APP = document.getElementById('app');
const NAV = document.getElementById('nav');
const TOAST = document.getElementById('toast');
document.getElementById('year').textContent = String(new Date().getFullYear());
let sb;
let user = null;
let staff = null;
let memberships = [];
let firmNames = new Map();
let selectedFirmId = null;
let invitations = [];
let authMode = 'login';
let companies = [];
let filings = [];
let documents = [];
let allClients = [];
let allFilings = [];
let allDocuments = [];
let assignments = [];
let selectedClientId = null;
let view = 'overview';
let staffTab = 'clients';
let authVersion = 0;
let toastTimer;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtDate = value => value ? new Date(value.slice(0,10)+'T12:00:00Z').toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}) : '—';
const today = () => new Date().toISOString().slice(0,10);
const asStatus = text => ({pending:'Pending',in_progress:'In progress',filed:'Filed',completed:'Completed',not_applicable:'Not applicable'}[text] || 'Unknown');
const asType = text => ({itr:'Income Tax Return',gstr1:'GST · GSTR-1',gstr3b:'GST · GSTR-3B',balance_sheet:'Balance Sheet',tax_audit:'Tax Audit',other:'Other'}[text] || text);
const asDoc = text => ({itr:'ITR acknowledgement',gst_return:'GST return',balance_sheet:'Balance sheet',profit_loss:'Profit & Loss',audit_report:'Audit report',other:'Other document'}[text] || text);
const statusChip = s => `<span class="status ${esc(s)}">${esc(asStatus(s))}</span>`;
const activeClient = () => companies.find(c=>c.client_id===selectedClientId)||companies[0]||null;
const isClosed = s => ['filed','completed','not_applicable'].includes(s);
const due = f => Boolean(f.due_date && f.due_date<today() && !isClosed(f.status));

function toast(message,error=false){
  TOAST.textContent=message;TOAST.className='toast show'+(error?' error':'');
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>TOAST.className='toast',4800);
}
function empty(message='No records available yet.') {return `<div class="empty"><div class="empty-icon">▤</div>${esc(message)}</div>`;}
function heading(label,title,sub,aside=''){return `<div class="page-heading"><div><div class="eyebrow">${esc(label)}</div><h1>${esc(title)}</h1><p class="subtitle">${esc(sub)}</p></div>${aside}</div>`;}
function loading(){APP.innerHTML='<div class="loading"><div class="spinner"></div><p>Loading secure records…</p></div>';}
function setNav(){
  NAV.hidden=!user;
  const practiceLink = NAV.querySelector('[data-view="practice"]');
  if(staff && practiceLink && NAV.firstElementChild!==practiceLink)NAV.prepend(practiceLink);
  document.getElementById('sign-out').hidden=!user;
  document.getElementById('user-label').textContent=user?.email||'';
  NAV.querySelectorAll('[data-view]').forEach(el=>{
    el.classList.toggle('active',el.dataset.view===view);
    if(el.dataset.view==='practice')el.hidden=!staff;
  });
}
function renderLogin(error=''){
  user=null;staff=null;memberships=[];companies=[];setNav();
  APP.innerHTML=`<div class="login-outer"><section class="login-card">
    <div class="auth-icon">◈</div><div class="eyebrow">LEDGERFLOW • SECURE WORKSPACE</div>
    <h1>One workspace.<br>Every financial deadline.</h1>
    <p>Manage your accounting practice or securely review the filings and statements your accountant shares.</p>
    ${error?`<div class="notice error">${esc(error)}</div>`:''}
    <form id="login-form"><div class="field"><label for="email">Work email</label><input id="email" name="email" type="email" autocomplete="username" required placeholder="name@company.com"></div>
    <div class="field"><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" minlength="6" required placeholder="Your password"></div>
    <button class="primary-btn" type="submit">Sign in to workspace</button></form>
    <div class="auth-divider">New to LedgerFlow?</div><button class="secondary-btn auth-secondary" id="signup-toggle" type="button">Create your free practice account</button>
    <p class="login-info">Customer accounts are invited by their accounting firm. Never share a password or confidential tax data by email.</p>
  </section><aside class="login-aside"><div class="eyebrow">BUILT FOR MODERN ACCOUNTING FIRMS</div><h2>Less chasing.<br>More clarity.</h2><p>A secure client portal for ITR, GST, balance sheets and financial statements across every firm and customer.</p><div class="auth-feature">✓ Separate data for every practice</div><div class="auth-feature">✓ Read-only customer logins</div><div class="auth-feature">✓ Easy filing and document sharing</div></aside></div>`;
}
function renderSignup(message=''){
  APP.innerHTML=`<div class="login-outer"><section class="login-card"><div class="auth-icon">◈</div><div class="eyebrow">START YOUR PRACTICE</div>
   <h1>Create a secure workspace.</h1><p>Register with your work email. You can create your accounting firm once your email is verified.</p>
   ${message?`<div class="notice">${esc(message)}</div>`:''}
   <form id="signup-form"><div class="field"><label>Email address</label><input name="email" type="email" autocomplete="email" required placeholder="name@firm.com"></div>
   <div class="field"><label>Password (12+ characters)</label><input name="password" type="password" minlength="12" autocomplete="new-password" required placeholder="Choose a strong password"></div>
   <button class="primary-btn" type="submit">Create account</button></form><button class="link-btn" id="login-toggle" type="button">Already registered? Sign in</button>
   </section><aside class="login-aside"><div class="eyebrow">MULTI-TENANT BY DESIGN</div><h2>Your firm's data.<br>Your firm's team.</h2><p>Every practice operates in a separate workspace, with private documents, customer permissions and a dedicated filing register.</p></aside></div>`;
}
function renderCreatePractice(){
  APP.innerHTML=heading('GET STARTED','Your practice workspace','Register a new accounting firm or ask your administrator to invite you to an existing one.')+`
    <div class="onboarding-grid"><section class="panel onboarding-panel"><div class="onboard-icon">▦</div><h2>Create an accounting practice</h2><p>Set up a separate workspace for your firm, clients, staff and filing deadlines. You will be the owner.</p>
    <form id="create-practice"><div class="field"><label>Practice / firm name</label><input name="name" required minlength="2" maxlength="160" placeholder="Example: Sharma & Associates"></div><button class="primary-btn" type="submit">Create practice workspace</button></form></section>
    <section class="panel onboarding-panel"><div class="onboard-icon">✉</div><h2>Joining an existing practice?</h2><p>Ask your accountant or practice administrator to invite <strong>${esc(user?.email||'your email')}</strong>. Invitations are matched to your verified email address.</p>
    <button class="secondary-btn" data-claim-invitations type="button">Check for invitations</button></section></div>`;
}
async function loadData(){
  const run=++authVersion;loading();
  try{
    // Claim only administrator-issued invitations bound to the verified email in Supabase Auth.
    const accepted=await sb.rpc('accounting_accept_invitations');
    if(accepted.error)throw accepted.error;
    const staffResult=await sb.from('accounting_staff').select('firm_id,role,display_name').eq('user_id',user.id).eq('is_active',true).order('created_at');
    if(staffResult.error)throw staffResult.error;
    memberships=staffResult.data||[];
    if(!memberships.some(s=>s.firm_id===selectedFirmId))selectedFirmId=memberships[0]?.firm_id||null;
    staff=memberships.find(s=>s.firm_id===selectedFirmId)||null;
    firmNames=new Map();
    if(memberships.length){
      const fr=await sb.from('accounting_firms').select('id,name').in('id',memberships.map(s=>s.firm_id));
      if(fr.error)throw fr.error;
      firmNames=new Map((fr.data||[]).map(f=>[f.id,f.name]));
    }
    const [c,f,d]=await Promise.all([
      sb.from('accounting_portal_companies').select('client_id,company_name,pan,gstin,updated_at').order('company_name').limit(1000),
      sb.from('accounting_portal_filings').select('filing_id,client_id,filing_type,period_start,period_end,financial_year,due_date,status,filed_at,acknowledgement_ref').order('period_end',{ascending:false}).limit(2000),
      sb.from('accounting_portal_documents').select('document_id,client_id,document_type,storage_path,file_name,created_at').order('created_at',{ascending:false}).limit(1000)
    ]);
    if(run!==authVersion)return;
    for(const r of [c,f,d])if(r.error)throw r.error;
    companies=c.data||[];filings=f.data||[];documents=d.data||[];
    if(!companies.some(c=>c.client_id===selectedClientId))selectedClientId=companies[0]?.client_id||null;
    if(staff && !companies.length)view='practice';
    if(!staff && view==='practice')view='overview';
    if(staff && view==='practice')await loadPractice();
    setNav();render();
  }catch(e){setNav();APP.innerHTML=`<div class="notice error">Unable to load records: ${esc(e.message||'Please retry.')}</div><button class="secondary-btn" id="retry-load">Retry</button>`;}
}
async function loadPractice(){
  if(!staff)return;
  const f=staff.firm_id;
  const [c,fi,d,a,inv]=await Promise.all([
    sb.from('accounting_clients').select('id,legal_name,client_type,pan,gstin,is_active').eq('firm_id',f).order('legal_name'),
    sb.from('accounting_filings').select('id,client_id,filing_type,period_start,period_end,financial_year,due_date,status,filed_at,acknowledgement_ref').eq('firm_id',f).order('period_end',{ascending:false}).limit(1000),
    sb.from('accounting_documents').select('id,client_id,document_type,file_name,storage_path,is_shared_with_customer,created_at').eq('firm_id',f).order('created_at',{ascending:false}).limit(500),
    sb.from('accounting_customer_access').select('id,client_id,user_id,display_name,is_active').eq('firm_id',f),
    sb.from('accounting_invitations').select('id,invite_email,invite_kind,role,client_id,created_at,claimed_at,expires_at').eq('firm_id',f).order('created_at',{ascending:false}).limit(100)
  ]);
  for(const r of [c,fi,d,a,inv])if(r.error)throw r.error;
  allClients=c.data||[];allFilings=fi.data||[];allDocuments=d.data||[];assignments=a.data||[];invitations=inv.data||[];
}
function selectedSwitcher(){
  if(companies.length<=1)return '';
  return `<div class="company-switch"><label class="section-note" for="company-choice">Viewing company</label><select class="control" id="company-choice">${companies.map(c=>`<option value="${esc(c.client_id)}" ${c.client_id===selectedClientId?'selected':''}>${esc(c.company_name)}</option>`).join('')}</select></div>`;
}
function filingTable(rows,staffMode=false){
  if(!rows.length)return empty('Filing records will appear here when added by your accounting team.');
  return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Return</th><th>Financial year</th><th>Due date</th><th>Status</th><th>Acknowledgement</th>${staffMode?'<th>Action</th>':''}</tr></thead><tbody>${rows.map(f=>`<tr>
    <td><div class="main-cell">${esc(asType(f.filing_type))}</div><span class="muted">${esc(fmtDate(f.period_start))} – ${esc(fmtDate(f.period_end))}</span></td>
    <td>${esc(f.financial_year)}</td><td>${esc(fmtDate(f.due_date))}${due(f)?' <span class="tag">Overdue</span>':''}</td><td>${statusChip(f.status)}</td>
    <td>${esc(f.acknowledgement_ref||'—')}</td>${staffMode?`<td><button class="secondary-btn small-btn" data-edit-filing="${esc(f.id)}">Edit</button></td>`:''}</tr>`).join('')}</tbody></table></div>`;
}
function documentTable(rows,staffMode=false){
  if(!rows.length)return empty(staffMode?'No documents uploaded yet.':'No documents have been shared with you yet.');
  return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Document</th><th>Category</th><th>Uploaded</th>${staffMode?'<th>Shared with customer</th>':''}<th>Open</th></tr></thead><tbody>${rows.map(d=>`<tr><td class="main-cell">${esc(d.file_name)}</td><td>${esc(asDoc(d.document_type))}</td><td>${esc(fmtDate(d.created_at))}</td>${staffMode?`<td><label><input type="checkbox" data-share="${esc(d.id)}" ${d.is_shared_with_customer?'checked':''}> Visible</label></td>`:''}<td><button class="secondary-btn small-btn" data-open-path="${esc(d.storage_path)}">View PDF / file</button></td></tr>`).join('')}</tbody></table></div>`;
}
function renderOverview(){
  const c=activeClient();
  if(!c){APP.innerHTML=heading('ACCOUNT OVERVIEW','Welcome to LedgerFlow','Your accountant has not yet linked a company to this login.')+'<div class="notice warn">Your account is signed in, but no company has been assigned. Contact your accounting team to request access.</div>';return;}
  const rows=filings.filter(f=>f.client_id===c.client_id);
  const docs=documents.filter(d=>d.client_id===c.client_id);
  const closed=rows.filter(f=>isClosed(f.status)).length;
  const overdue=rows.filter(due).length;
  APP.innerHTML=heading('ACCOUNT OVERVIEW','Welcome back',`Here is the latest compliance overview for ${c.company_name}.`,'<span class="pill">● Secure client access</span>')+selectedSwitcher()+`
    <div style="height:23px"></div><div class="stats">
      <div class="stat"><div class="stat-head">Total filings <span class="stat-icon">▤</span></div><div class="stat-value">${rows.length}</div><div class="stat-foot">Across available periods</div></div>
      <div class="stat"><div class="stat-head">Filed / completed <span class="stat-icon">✓</span></div><div class="stat-value">${closed}</div><div class="stat-foot">Filed, completed or N/A</div></div>
      <div class="stat"><div class="stat-head">Overdue <span class="stat-icon">◷</span></div><div class="stat-value">${overdue}</div><div class="stat-foot">Past recorded due date</div></div>
      <div class="stat"><div class="stat-head">Shared documents <span class="stat-icon">▧</span></div><div class="stat-value">${docs.length}</div><div class="stat-foot">Available to download</div></div>
    </div><div class="panel-grid"><section class="panel"><div class="panel-head"><h2>Recent filings</h2><button class="secondary-btn small-btn" data-view="filings">View all</button></div>${filingTable(rows.slice(0,6))}</section>
    <section class="panel"><div class="panel-head"><h2>Company profile</h2></div><div class="quick-row"><span>Legal name</span><strong>${esc(c.company_name)}</strong></div><div class="quick-row"><span>PAN</span><strong>${esc(c.pan||'Not supplied')}</strong></div><div class="quick-row"><span>GSTIN</span><strong>${esc(c.gstin||'Not supplied')}</strong></div><div class="quick-row"><span>Access</span><strong>Read-only</strong></div></section></div>
    <div class="panel"><div class="panel-head"><h2>Recently shared documents</h2><button class="secondary-btn small-btn" data-view="documents">View all</button></div>${documentTable(docs.slice(0,5))}</div>`;
}
function renderFilings(){
 const c=activeClient();if(!c){renderOverview();return;}
 const rows=filings.filter(f=>f.client_id===c.client_id);
 APP.innerHTML=heading('TAX COMPLIANCE','Tax & GST filings','View filing periods, status, due dates and acknowledgements.')+selectedSwitcher()+`<div style="height:22px"></div><section class="panel"><div class="panel-head"><h2>${esc(c.company_name)} · Filings</h2><span class="section-note">${rows.length} records</span></div>${filingTable(rows)}</section>`;
}
function renderDocuments(){
 const c=activeClient();if(!c){renderOverview();return;}
 const rows=documents.filter(d=>d.client_id===c.client_id);
 APP.innerHTML=heading('DOCUMENT LIBRARY','Your documents','Download files your accounting team has explicitly shared.')+selectedSwitcher()+`<div style="height:22px"></div><section class="panel"><div class="panel-head"><h2>Financial statements & returns</h2><span class="section-note">Private, approved downloads</span></div>${documentTable(rows)}</section>`;
}
function staffCompanyOptions(){return allClients.map(c=>`<option value="${esc(c.id)}">${esc(c.legal_name)}</option>`).join('');}
function staffTabs(){
 const items=[['clients','Clients'],['filings','Filings'],['documents','Documents'],['access','Customers'],['team','Team']];
 return `<div class="tabs">${items.map(([key,label])=>`<button class="tab ${key===staffTab?'selected':''}" data-staff-tab="${key}">${label}</button>`).join('')}</div>`;
}
function renderPractice(){
 if(!staff){view='overview';renderOverview();return;}
 let body='';
 if(staffTab==='clients'){
   body=`<section class="panel"><div class="panel-head"><h2>Add a client</h2></div><form id="add-client" class="inline-form"><div class="form-grid">
   <div class="field"><label>Legal name *</label><input name="legal_name" required maxlength="200" placeholder="ABC Private Limited"></div>
   <div class="field"><label>Client category</label><select name="client_type"><option value="company">Company</option><option value="individual">Individual</option><option value="proprietorship">Proprietorship</option><option value="partnership">Partnership</option><option value="llp">LLP</option><option value="trust">Trust</option><option value="other">Other</option></select></div>
   <div class="field"><label>PAN (optional)</label><input name="pan" maxlength="10" placeholder="ABCDE1234F"></div>
   <div class="field"><label>GSTIN (optional)</label><input name="gstin" maxlength="15" placeholder="22AAAAA0000A1Z5"></div>
   <div class="field"><label>Email (optional)</label><input name="email" type="email" placeholder="contact@company.com"></div>
   <div class="field"><label>Phone (optional)</label><input name="phone" placeholder="Mobile number"></div></div>
   <div class="form-actions"><button class="primary-btn" type="submit">Add client</button></div></form></section>
   <section class="panel"><div class="panel-head"><h2>Client register</h2><span class="section-note">${allClients.length} clients</span></div>${allClients.length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>Client</th><th>Category</th><th>PAN</th><th>GSTIN</th><th>Status</th></tr></thead><tbody>${allClients.map(c=>`<tr><td class="main-cell">${esc(c.legal_name)}</td><td>${esc(c.client_type)}</td><td>${esc(c.pan||'—')}</td><td>${esc(c.gstin||'—')}</td><td>${c.is_active?'Active':'Inactive'}</td></tr>`).join('')}</tbody></table></div>`:empty('Add the first client to get started.')}</section>`;
 }
 if(staffTab==='filings'){
   body=`<section class="panel"><div class="panel-head"><h2>Record a return or balance sheet</h2></div><form id="add-filing" class="inline-form"><div class="form-grid">
   <div class="field"><label>Client *</label><select name="client_id" required>${staffCompanyOptions()}</select></div>
   <div class="field"><label>Document / return *</label><select name="filing_type"><option value="itr">ITR</option><option value="gstr1">GSTR-1</option><option value="gstr3b">GSTR-3B</option><option value="balance_sheet">Balance Sheet</option><option value="tax_audit">Tax Audit</option><option value="other">Other</option></select></div>
   <div class="field"><label>Period start *</label><input type="date" name="period_start" required></div>
   <div class="field"><label>Period end *</label><input type="date" name="period_end" required></div>
   <div class="field"><label>Financial year *</label><input name="financial_year" required placeholder="2026-27"></div>
   <div class="field"><label>Due date</label><input type="date" name="due_date"></div>
   <div class="field"><label>Status</label><select name="status"><option value="pending">Pending</option><option value="in_progress">In progress</option><option value="filed">Filed</option><option value="completed">Completed</option><option value="not_applicable">Not applicable</option></select></div>
   <div class="field"><label>Acknowledgement no.</label><input name="acknowledgement_ref" maxlength="180" placeholder="Optional"></div></div>
   <div class="form-actions"><button class="primary-btn" ${!allClients.length?'disabled':''}>Save filing</button></div></form></section>
   <section class="panel"><div class="panel-head"><h2>Filing register</h2><span class="section-note">${allFilings.length} filings</span></div>${allFilings.length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>Client</th><th>Return</th><th>Period</th><th>Due</th><th>Status</th><th>Manage</th></tr></thead><tbody>${allFilings.map(f=>`<tr><td class="main-cell">${esc(allClients.find(c=>c.id===f.client_id)?.legal_name||'—')}</td><td>${esc(asType(f.filing_type))}</td><td>${esc(f.financial_year)}</td><td>${esc(fmtDate(f.due_date))}</td><td>${statusChip(f.status)}</td><td><button class="secondary-btn small-btn" data-edit-filing="${esc(f.id)}">Edit</button></td></tr>`).join('')}</tbody></table></div>`:empty('No filings have been recorded yet.')}</section>
   <section class="panel" id="edit-area" hidden></section>`;
 }
 if(staffTab==='documents'){
   body=`<section class="panel"><div class="panel-head"><h2>Upload a client document</h2></div><div class="notice warn">Documents are private by default. Enable “Share with customer” only after reviewing the file.</div>
   <form id="add-document" class="inline-form"><div class="form-grid">
    <div class="field"><label>Client *</label><select name="client_id" required>${staffCompanyOptions()}</select></div>
    <div class="field"><label>Document category</label><select name="document_type"><option value="itr">ITR / acknowledgement</option><option value="gst_return">GST return</option><option value="balance_sheet">Balance Sheet</option><option value="profit_loss">Profit & Loss</option><option value="audit_report">Audit report</option><option value="other">Other</option></select></div>
    <div class="field"><label>Select file (max 10 MB) *</label><input type="file" name="file" accept=".pdf,.jpg,.jpeg,.png,.xls,.xlsx,.docx" required></div>
    <div class="field"><label>Visibility</label><label style="font-weight:400"><input type="checkbox" name="is_shared_with_customer"> Share with customer</label></div></div>
    <div class="form-actions"><button class="primary-btn" ${!allClients.length?'disabled':''}>Upload document</button></div></form></section>
    <section class="panel"><div class="panel-head"><h2>Document register</h2><span class="section-note">${allDocuments.length} files</span></div>${documentTable(allDocuments,true)}</section>`;
 }
 if(staffTab==='access'){
   if(!['owner','admin'].includes(staff.role))body='<div class="notice warn">Only practice owners or administrators can invite customers.</div>';
   else body=`<section class="panel"><div class="panel-head"><h2>Invite a customer</h2><span class="pill">Read-only access</span></div><p class="section-note">Enter the email address the customer will use to sign in. They can access only the selected company.</p>
   <form id="add-access" class="inline-form"><div class="form-grid">
     <div class="field"><label>Company *</label><select name="client_id" required>${staffCompanyOptions()}</select></div>
     <div class="field"><label>Customer's email *</label><input name="email" type="email" required autocomplete="off" placeholder="customer@company.com"></div></div>
   <div class="form-actions"><button class="primary-btn" ${!allClients.length?'disabled':''}>Create customer invitation</button></div></form>
   <div class="notice">Share the LedgerFlow sign-in URL with the customer. They should create an account using exactly this email, verify it and sign in. Access is activated automatically on sign-in.</div></section>
   <section class="panel"><div class="panel-head"><h2>Customer access</h2><span class="section-note">${assignments.length} assigned accounts</span></div>
   ${assignments.length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>Company</th><th>Account</th><th>Permission</th><th>Action</th></tr></thead><tbody>${assignments.map(a=>`<tr><td class="main-cell">${esc(allClients.find(c=>c.id===a.client_id)?.legal_name||'—')}</td><td>${esc(a.display_name||a.user_id)}</td><td>Read only</td><td><button class="secondary-btn small-btn" data-toggle-access="${esc(a.id)}">${a.is_active?'Revoke':'Restore'}</button></td></tr>`).join('')}</tbody></table></div>`:empty('No customers have accepted invitations yet.')}</section>`;
 }
 if(staffTab==='team'){
   if(!['owner','admin'].includes(staff.role))body='<div class="notice warn">Only owners or administrators can invite practice members.</div>';
   else body=`<section class="panel"><div class="panel-head"><h2>Invite your team</h2></div><p class="section-note">Each team member signs in using a verified email. Staff can update filings; viewers have read-only access to the practice.</p>
   <form id="invite-staff" class="inline-form"><div class="form-grid">
    <div class="field"><label>Team member email *</label><input type="email" name="email" required placeholder="colleague@firm.com"></div>
    <div class="field"><label>Role</label><select name="role"><option value="staff">Staff · create and update records</option><option value="viewer">Viewer · read only</option>${staff.role==='owner'?'<option value="admin">Administrator</option><option value="owner">Owner</option>':''}</select></div></div>
    <div class="form-actions"><button class="primary-btn">Create team invitation</button></div></form></section>
    <section class="panel"><div class="panel-head"><h2>Recent invitations</h2></div>
    ${invitations.length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>Email</th><th>Type</th><th>Access</th><th>Status</th></tr></thead><tbody>${invitations.map(a=>`<tr><td class="main-cell">${esc(a.invite_email)}</td><td>${esc(a.invite_kind)}</td><td>${esc(a.role||allClients.find(c=>c.id===a.client_id)?.legal_name||'Customer')}</td><td>${a.claimed_at?'Accepted':new Date(a.expires_at)<new Date()?'Expired':'Pending'}</td></tr>`).join('')}</tbody></table></div>`:empty('No invitations sent yet.')}</section>`;
 }
 const picker=memberships.length>1?`<div class="toolbar"><label for="practice-choice">Active practice</label><select id="practice-choice" class="control">${memberships.map(m=>`<option value="${esc(m.firm_id)}" ${m.firm_id===selectedFirmId?'selected':''}>${esc(firmNames.get(m.firm_id)||m.firm_id)}</option>`).join('')}</select></div>`:'';
 const summary=`<div class="practice-summary"><div class="practice-stat"><span>Clients</span><strong>${allClients.length}</strong></div><div class="practice-stat"><span>Filings</span><strong>${allFilings.length}</strong></div><div class="practice-stat"><span>Documents</span><strong>${allDocuments.length}</strong></div></div>`;
 APP.innerHTML=heading('PRACTICE WORKSPACE',firmNames.get(staff.firm_id)||'Accounting management',`Your private accounting workspace · ${staff.role.toUpperCase()} role`,'<span class="pill">Secure practice</span>')+picker+summary+staffTabs()+`<div class="stack">${body}</div>`;
}
function enhanceTables(){
 APP.querySelectorAll('.data-table').forEach(table=>{
  const cols=[...table.querySelectorAll('thead th')].map(th=>th.textContent.trim());
  table.querySelectorAll('tbody tr').forEach(tr=>[...tr.querySelectorAll('td')].forEach((td,i)=>{td.dataset.label=cols[i]||'';}));
 });
}
function render(){
 setNav();if(!user)return renderLogin();
 if(!staff && !companies.length)return renderCreatePractice();
 if(view==='practice')renderPractice();else if(view==='filings')renderFilings();else if(view==='documents')renderDocuments();else renderOverview();
 enhanceTables();
}
async function refresh(){if(!user)return;await loadData();}

APP.addEventListener('submit',async e=>{
  const form=e.target;
  if(!['login-form','signup-form','create-practice','add-client','add-filing','add-document','add-access','invite-staff'].includes(form.id))return;
  e.preventDefault();const button=form.querySelector('[type="submit"],button.primary-btn');if(button)button.disabled=true;
  try{
    const data=new FormData(form);
    if(form.id==='login-form'){
      const {data:login,error}=await sb.auth.signInWithPassword({email:String(data.get('email')).trim(),password:String(data.get('password'))});
      if(error)throw error;user=login.user;await loadData();return;
    }
    if(form.id==='signup-form'){
      const email=String(data.get('email')).trim();
      const {data:result,error}=await sb.auth.signUp({email,password:String(data.get('password')),options:{emailRedirectTo:location.origin}});
      if(error)throw error;
      if(result?.session && result?.user){user=result.user;await loadData();toast('Account created');}
      else renderSignup('Check your inbox to confirm your email. Then return here and sign in to create your practice.');
      return;
    }
    if(form.id==='create-practice'){
      const {data:firmId,error}=await sb.rpc('accounting_register_practice',{p_name:String(data.get('name')).trim()});
      if(error)throw error;
      selectedFirmId=firmId;view='practice';toast('Your practice is ready');await loadData();return;
    }
    if(!staff)throw new Error('You do not have staff access.');
    if(form.id==='add-client'){
      const v={firm_id:staff.firm_id,legal_name:String(data.get('legal_name')).trim(),client_type:String(data.get('client_type')),
        pan:String(data.get('pan')||'').trim().toUpperCase()||null,gstin:String(data.get('gstin')||'').trim().toUpperCase()||null,
        email:String(data.get('email')||'').trim()||null,phone:String(data.get('phone')||'').trim()||null};
      const {error}=await sb.from('accounting_clients').insert(v);if(error)throw error;toast('Client created successfully');
    }
    if(form.id==='add-filing'){
      const v={firm_id:staff.firm_id,client_id:data.get('client_id'),filing_type:data.get('filing_type'),period_start:data.get('period_start'),period_end:data.get('period_end'),financial_year:String(data.get('financial_year')).trim(),due_date:data.get('due_date')||null,status:data.get('status'),acknowledgement_ref:data.get('acknowledgement_ref')||null};
      if(v.period_end<v.period_start)throw new Error('Period end cannot be before period start.');
      const {error}=await sb.from('accounting_filings').insert(v);if(error)throw error;toast('Filing recorded');
    }
    if(form.id==='add-document'){
      const file=form.querySelector('input[type="file"]')?.files?.[0];if(!file)throw new Error('Choose a file.');
      if(file.size>10485760)throw new Error('File exceeds the 10 MB limit.');
      const types=['application/pdf','image/jpeg','image/png','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
      if(!types.includes(file.type))throw new Error('Unsupported file type. Upload PDF, JPG, PNG, XLS, XLSX or DOCX.');
      const clientId=String(data.get('client_id'));
      const path=`${staff.firm_id}/${clientId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]/g,'_').slice(0,90)}`;
      const upload=await sb.storage.from('accounting-documents').upload(path,file,{contentType:file.type,upsert:false});
      if(upload.error)throw upload.error;
      const r=await sb.from('accounting_documents').insert({firm_id:staff.firm_id,client_id:clientId,document_type:data.get('document_type'),storage_path:path,file_name:file.name,mime_type:file.type,size_bytes:file.size,is_shared_with_customer:form.querySelector('[name="is_shared_with_customer"]').checked});
      if(r.error)throw new Error(`File uploaded, but its database record failed: ${r.error.message}. Ask an administrator to reconcile this upload.`);
      toast('Document uploaded successfully');
    }
    if(form.id==='add-access'){
      if(!['owner','admin'].includes(staff.role))throw new Error('Only an admin can grant access.');
      const {error}=await sb.rpc('accounting_invite_member',{p_firm_id:staff.firm_id,p_email:String(data.get('email')).trim(),p_kind:'customer',p_client_id:data.get('client_id'),p_role:null});
      if(error)throw error;toast('Customer invitation created');
    }
    if(form.id==='invite-staff'){
      if(!['owner','admin'].includes(staff.role))throw new Error('Administrator access required');
      const {error}=await sb.rpc('accounting_invite_member',{p_firm_id:staff.firm_id,p_email:String(data.get('email')).trim(),p_kind:'staff',p_role:String(data.get('role')),p_client_id:null});
      if(error)throw error;toast('Team invitation created');
    }
    await loadPractice();render();
  }catch(error){toast(error.message||'Operation failed',true);if(button)button.disabled=false;}
});

APP.addEventListener('click',async e=>{
  const a=e.target.closest('[data-view],[data-staff-tab],[data-edit-filing],[data-open-path],[data-toggle-access],[data-claim-invitations],#retry-load,#save-edit,#signup-toggle,#login-toggle');
  if(!a)return;
  try{
    if(a.id==='signup-toggle'){authMode='signup';renderSignup();return;}
    if(a.id==='login-toggle'){authMode='login';renderLogin();return;}
    if(a.dataset.claimInvitations!==undefined){await loadData();return;}
    if(a.id==='retry-load')return await refresh();
    if(a.dataset.view){view=a.dataset.view;render();return;}
    if(a.dataset.staffTab){staffTab=a.dataset.staffTab;render();return;}
    if(a.dataset.openPath){
      a.disabled=true;
      const {data,error}=await sb.storage.from('accounting-documents').createSignedUrl(a.dataset.openPath,60);
      if(error||!data?.signedUrl)throw error||new Error('Download not available.');
      const link=document.createElement('a');link.href=data.signedUrl;link.target='_blank';link.rel='noopener noreferrer';link.click();
      a.disabled=false;return;
    }
    if(a.dataset.editFiling){
      const f=allFilings.find(x=>x.id===a.dataset.editFiling);if(!f)return;
      const area=document.getElementById('edit-area');if(!area)return;
      area.hidden=false;
      area.innerHTML=`<h2>Edit ${esc(asType(f.filing_type))} · ${esc(f.financial_year)}</h2><div class="form-grid">
       <div class="field"><label>Status</label><select id="edit-status">${['pending','in_progress','filed','completed','not_applicable'].map(s=>`<option value="${s}" ${s===f.status?'selected':''}>${asStatus(s)}</option>`).join('')}</select></div>
       <div class="field"><label>Due date</label><input type="date" id="edit-due" value="${esc(f.due_date||'')}"></div>
       <div class="field"><label>Filed on</label><input type="date" id="edit-filed" value="${esc(f.filed_at||'')}"></div>
       <div class="field"><label>Acknowledgement reference</label><input id="edit-ref" value="${esc(f.acknowledgement_ref||'')}" maxlength="180"></div></div>
       <div class="form-actions"><button class="primary-btn" id="save-edit" data-edit-id="${esc(f.id)}">Save changes</button></div>`;
      area.scrollIntoView({behavior:'smooth',block:'nearest'});return;
    }
    if(a.id==='save-edit'){
      const {error}=await sb.from('accounting_filings').update({status:document.getElementById('edit-status').value,due_date:document.getElementById('edit-due').value||null,filed_at:document.getElementById('edit-filed').value||null,acknowledgement_ref:document.getElementById('edit-ref').value.trim()||null}).eq('id',a.dataset.editId);
      if(error)throw error;toast('Filing updated');await loadPractice();render();return;
    }
    if(a.dataset.toggleAccess){
      if(!staff||!['owner','admin'].includes(staff.role))throw new Error('Admin access required');
      const access=assignments.find(x=>x.id===a.dataset.toggleAccess);if(!access)return;
      const {error}=await sb.from('accounting_customer_access').update({is_active:!access.is_active}).eq('id',access.id);
      if(error)throw error;toast(access.is_active?'Customer access revoked':'Customer access restored');await loadPractice();render();return;
    }
  }catch(err){toast(err.message||'Action failed',true);a.disabled=false;}
});
APP.addEventListener('change',async e=>{
  if(e.target.id==='company-choice'){selectedClientId=e.target.value;render();return;}
  if(e.target.id==='practice-choice'){
    selectedFirmId=e.target.value;staff=memberships.find(s=>s.firm_id===selectedFirmId)||null;
    staffTab='clients';await loadPractice();render();return;
  }
  if(e.target.dataset.share){
    if(!staff)return;
    const docId=e.target.dataset.share;const shared=e.target.checked;
    const {error}=await sb.from('accounting_documents').update({is_shared_with_customer:shared}).eq('id',docId);
    if(error){toast(error.message,true);e.target.checked=!shared;return;}
    toast(shared?'Document is now visible to the assigned customer':'Document hidden from customer');
    await loadPractice();render();
  }
});
NAV.addEventListener('click',e=>{const a=e.target.closest('[data-view]');if(!a)return;view=a.dataset.view;render();});
document.getElementById('sign-out').addEventListener('click',async()=>{
  ++authVersion;await sb.auth.signOut();renderLogin();toast('Signed out securely');
});

(async function start(){
  if(!window.supabase?.createClient){renderLogin('Connection library could not load. Please check your internet connection and refresh.');return;}
  sb=window.supabase.createClient(CONFIG.supabaseUrl,CONFIG.publishableKey,{auth:{storageKey:'ledgerflow-portal-session',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  const {data,error}=await sb.auth.getUser();
  if(error && !String(error.message).includes('Auth session missing')){renderLogin('Please sign in to continue.');return;}
  user=data?.user||null;
  if(user)await loadData();else renderLogin();
})();