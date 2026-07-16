"use strict";
const panelState={session:null,profile:null,orders:[]};
document.addEventListener("DOMContentLoaded",initializePanel);
async function initializePanel(){
  if(!window.toscanaSupabase)return fatal("No se configuró Supabase.");
  try{
    const {data,error}=await window.toscanaSupabase.auth.getSession();
    if(error||!data.session?.user)return login();
    panelState.session=data.session;
    const profile=await window.toscanaSupabase.from("perfiles").select("id,nombre_completo,rol,activo").eq("id",data.session.user.id).single();
    if(profile.error||!profile.data?.activo){await window.toscanaSupabase.auth.signOut();return login()}
    panelState.profile=profile.data;setupUI();setupEvents();
    document.querySelector("#app-loading").hidden=true;document.querySelector("#admin-app").hidden=false;
    await loadDashboard();
  }catch(e){console.error(e);fatal(e.message||"No fue posible cargar el panel.")}
}
function setupUI(){
  const p=panelState.profile;
  document.querySelector("#user-name").textContent=p.nombre_completo;
  document.querySelector("#user-role").textContent=pretty(p.rol);
  document.querySelector("#user-avatar").textContent=p.nombre_completo.split(/\s+/).slice(0,2).map(x=>x[0]).join("").toUpperCase();
  document.querySelector("#current-date").textContent=new Intl.DateTimeFormat("es-EC",{weekday:"long",year:"numeric",month:"long",day:"numeric"}).format(new Date());
  document.querySelectorAll("[data-roles]").forEach(e=>e.hidden=!e.dataset.roles.split(",").includes(p.rol));
}
function setupEvents(){
  document.querySelector("#logout-button").onclick=async()=>{await window.toscanaSupabase.auth.signOut();login()};
  document.querySelector("#refresh-dashboard").onclick=loadDashboard;
  const sidebar=document.querySelector("#sidebar"),overlay=document.querySelector("#sidebar-overlay");
  document.querySelector("#sidebar-toggle").onclick=()=>{sidebar.classList.toggle("open");overlay.classList.toggle("visible")};
  overlay.onclick=()=>{sidebar.classList.remove("open");overlay.classList.remove("visible")};
  document.querySelectorAll(".nav-item").forEach(b=>b.onclick=()=>{
    document.querySelectorAll(".nav-item").forEach(x=>x.classList.remove("active"));b.classList.add("active");
    if(b.dataset.view==="dashboard")showDashboard();else showPlaceholder(b.dataset.view);
    sidebar.classList.remove("open");overlay.classList.remove("visible");
  });
  document.querySelector("#close-order-dialog").onclick=()=>document.querySelector("#order-dialog").close();
}
async function loadDashboard(){clearMessage();await Promise.all([loadSummary(),loadOrders()])}
async function loadSummary(){
  const {data,error}=await window.toscanaSupabase.rpc("resumen_diario",{p_fecha:null});
  if(error){console.error(error);return showMessage("No fue posible cargar los indicadores.")}
  document.querySelector("#metric-active-orders").textContent=data?.pedidos_activos??0;
  document.querySelector("#metric-total-orders").textContent=data?.total_pedidos??0;
  document.querySelector("#metric-sales").textContent=money(data?.ventas_generadas);
  document.querySelector("#metric-paid").textContent=money(data?.total_pagado);
}
async function loadOrders(){
  const loading=document.querySelector("#orders-loading"),empty=document.querySelector("#orders-empty"),list=document.querySelector("#orders-list");
  loading.hidden=false;empty.hidden=true;list.innerHTML="";
  const {data,error}=await window.toscanaSupabase.rpc("listar_pedidos_activos");loading.hidden=true;
  if(error){console.error(error);return showMessage("No fue posible cargar los pedidos activos.")}
  panelState.orders=Array.isArray(data)?data:[];
  document.querySelector("#orders-count").textContent=panelState.orders.length;
  if(!panelState.orders.length){empty.hidden=false;return}
  list.innerHTML=panelState.orders.map(o=>`<article class="order-card" data-id="${o.pedido_id}">
    <div><strong>${esc(o.ticket)}</strong><br><small>${esc(o.mesa_nombre||pretty(o.tipo))}</small></div>
    <div><small>Estado</small><br><span class="status">${esc(pretty(o.estado))}</span></div>
    <div><small>Productos</small><br><strong>${Number(o.cantidad_items||0)}</strong></div>
    <strong>${money(o.total)}</strong></article>`).join("");
  list.querySelectorAll(".order-card").forEach(c=>c.onclick=()=>openOrder(c.dataset.id));
}
async function openOrder(id){
  const dialog=document.querySelector("#order-dialog"),content=document.querySelector("#order-detail-content");
  content.textContent="Cargando…";dialog.showModal();
  const {data,error}=await window.toscanaSupabase.rpc("obtener_detalle_pedido",{p_pedido_id:id});
  if(error){content.textContent=error.message;return}
  content.innerHTML=`<h2>${esc(data.ticket)}</h2><div class="detail-grid">
    <p><small>Ubicación</small><br><strong>${esc(data.mesa?.nombre||pretty(data.tipo))}</strong></p>
    <p><small>Estado</small><br><strong>${esc(pretty(data.estado))}</strong></p>
    <p><small>Total</small><br><strong>${money(data.total)}</strong></p>
    <p><small>Pago</small><br><strong>${esc(pretty(data.estado_pago))}</strong></p></div>
    <table class="detail-items"><thead><tr><th>Producto</th><th>Cant.</th><th>Precio</th><th>Subtotal</th></tr></thead>
    <tbody>${(data.detalle||[]).map(i=>`<tr><td>${esc(i.producto)}</td><td>${i.cantidad}</td><td>${money(i.precio_unitario)}</td><td>${money(i.subtotal)}</td></tr>`).join("")}</tbody></table>`;
}
function showDashboard(){document.querySelector("#page-title").textContent="Dashboard";document.querySelector("#view-dashboard").classList.add("active");document.querySelector("#view-placeholder").classList.remove("active")}
function showPlaceholder(v){const names={pedidos:"Pedidos activos",cocina:"Panel de cocina",caja:"Gestión de caja",historial:"Histórico de pedidos",productos:"Productos",usuarios:"Usuarios"};document.querySelector("#page-title").textContent=names[v]||"Módulo";document.querySelector("#placeholder-title").textContent=names[v]||"Módulo";document.querySelector("#placeholder-description").textContent="Módulo preparado para implementación incremental.";document.querySelector("#view-dashboard").classList.remove("active");document.querySelector("#view-placeholder").classList.add("active")}
function login(){window.location.replace("./login.html")}
function fatal(t){document.querySelector("#app-loading").innerHTML=`<strong>No fue posible cargar el panel.</strong><p>${esc(t)}</p><a href="./login.html">Volver al login</a>`}
function showMessage(t){const e=document.querySelector("#global-message");e.textContent=t;e.hidden=false}
function clearMessage(){const e=document.querySelector("#global-message");e.hidden=true;e.textContent=""}
function money(v){return new Intl.NumberFormat("es-EC",{style:"currency",currency:"USD"}).format(Number(v||0))}
function pretty(v){return String(v||"").replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase())}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}