"use strict";
const state = { menu: [], tables: [], cart: [] };
document.addEventListener("DOMContentLoaded", init);

async function init() {
  bindEvents();
  if (!window.toscanaSupabase) return showMessage("Configura Supabase antes de registrar pedidos.");
  await Promise.all([loadMenu(), loadTables()]);
  restoreCart();
  renderCart();
}

function bindEvents() {
  document.querySelector("#search").addEventListener("input", renderMenu);
  document.querySelector("#clear-cart").addEventListener("click", () => { state.cart=[]; saveCart(); renderCart(); });
  document.querySelector("#order-type").addEventListener("change", toggleOrderFields);
  document.querySelector("#submit-order").addEventListener("click", submitOrder);
  document.querySelector("#new-order").addEventListener("click", () => {
    state.cart=[]; saveCart(); renderCart(); document.querySelector("#success-dialog").close();
  });
}

async function loadMenu() {
  const { data, error } = await window.toscanaSupabase
    .from("productos")
    .select("id,nombre,descripcion,precio,categoria_id,categorias(id,nombre,orden)")
    .eq("activo", true).eq("disponible", true)
    .order("nombre");
  if (error) {
    console.warn("No se pudo leer productos desde Supabase; usando data/menu.json.", error);
    const fallback = await fetch("data/menu.json").then(r => r.json());
    state.menu = fallback.productos || [];
  } else {
    state.menu = data.map(p => ({ ...p, categoria: p.categorias?.nombre || "Otros" }));
  }
  renderMenu();
}

async function loadTables() {
  const { data, error } = await window.toscanaSupabase
    .from("mesas").select("id,numero,nombre").eq("activa", true).order("numero");
  state.tables = error ? [] : data;
  document.querySelector("#table-select").innerHTML = state.tables
    .map(t => `<option value="${t.id}">${escapeHtml(t.nombre || `Mesa ${t.numero}`)}</option>`).join("");
}

function renderMenu() {
  const q = document.querySelector("#search").value.trim().toLowerCase();
  const filtered = state.menu.filter(p => `${p.nombre} ${p.descripcion||""}`.toLowerCase().includes(q));
  const groups = filtered.reduce((acc,p) => {
    const key = p.categoria || p.categorias?.nombre || "Otros";
    (acc[key] ||= []).push(p); return acc;
  }, {});
  document.querySelector("#category-nav").innerHTML = Object.keys(groups)
    .map(c => `<button type="button" onclick="document.getElementById('${slug(c)}').scrollIntoView({behavior:'smooth'})">${escapeHtml(c)}</button>`).join("");
  document.querySelector("#menu-container").innerHTML = Object.entries(groups).map(([cat,items]) => `
    <section class="menu-section" id="${slug(cat)}"><h2>${escapeHtml(cat)}</h2>
      <div class="product-grid">${items.map(productCard).join("")}</div>
    </section>`).join("") || '<p class="empty">No se encontraron productos.</p>';
  document.querySelectorAll("[data-add-product]").forEach(b => b.addEventListener("click", () => addProduct(Number(b.dataset.addProduct))));
}

function productCard(p) {
  return `<article class="product-card"><h3>${escapeHtml(p.nombre)}</h3><p>${escapeHtml(p.descripcion||"")}</p>
    <footer><strong>${money(p.precio)}</strong><button data-add-product="${p.id}" type="button">Agregar</button></footer></article>`;
}
function addProduct(id) {
  const product = state.menu.find(p => Number(p.id) === id); if (!product) return;
  const existing = state.cart.find(i => i.producto_id === id);
  if (existing) existing.cantidad += 1;
  else state.cart.push({ producto_id:id, nombre:product.nombre, precio:Number(product.precio), cantidad:1, observaciones:"" });
  saveCart(); renderCart();
}
function changeQuantity(id, delta) {
  const item=state.cart.find(i=>i.producto_id===id); if(!item)return;
  item.cantidad+=delta; if(item.cantidad<=0) state.cart=state.cart.filter(i=>i.producto_id!==id);
  saveCart(); renderCart();
}
function renderCart() {
  const box=document.querySelector("#cart-items");
  document.querySelector("#cart-empty").hidden=state.cart.length>0;
  box.innerHTML=state.cart.map(i=>`<div class="cart-item"><div><strong>${escapeHtml(i.nombre)}</strong><small>${money(i.precio)} c/u</small></div>
    <div class="cart-controls"><button data-minus="${i.producto_id}">−</button><span>${i.cantidad}</span><button data-plus="${i.producto_id}">+</button></div></div>`).join("");
  box.querySelectorAll("[data-minus]").forEach(b=>b.onclick=()=>changeQuantity(Number(b.dataset.minus),-1));
  box.querySelectorAll("[data-plus]").forEach(b=>b.onclick=()=>changeQuantity(Number(b.dataset.plus),1));
  document.querySelector("#cart-total").textContent=money(state.cart.reduce((s,i)=>s+i.precio*i.cantidad,0));
}
function toggleOrderFields() {
  const type=document.querySelector("#order-type").value;
  document.querySelector("#table-field").hidden=type!=="mesa";
  document.querySelector("#address-field").hidden=type!=="delivery";
}
async function submitOrder() {
  if (!state.cart.length) return showMessage("Agrega al menos un producto.");
  const type=document.querySelector("#order-type").value;
  const mesa=type==="mesa"?Number(document.querySelector("#table-select").value):null;
  const address=document.querySelector("#delivery-address").value.trim();
  if(type==="mesa"&&!mesa)return showMessage("Selecciona una mesa.");
  if(type==="delivery"&&!address)return showMessage("Registra la dirección de entrega.");
  const button=document.querySelector("#submit-order"); button.disabled=true; button.textContent="Registrando…";
  const { data, error }=await window.toscanaSupabase.rpc("crear_pedido",{
    p_tipo:type,p_mesa_id:mesa,p_cliente_nombre:document.querySelector("#customer-name").value.trim()||null,
    p_cliente_telefono:document.querySelector("#customer-phone").value.trim()||null,
    p_direccion_entrega:address||null,p_observaciones:document.querySelector("#order-notes").value.trim()||null,
    p_items:state.cart.map(i=>({producto_id:i.producto_id,cantidad:i.cantidad,observaciones:i.observaciones||null}))
  });
  button.disabled=false; button.textContent="Confirmar pedido";
  if(error)return showMessage(error.message||"No se pudo registrar el pedido.");
  localStorage.setItem("toscana_ultimo_token",data.token_consulta);
  document.querySelector("#success-ticket").textContent=data.ticket;
  document.querySelector("#success-status").textContent=data.estado;
  document.querySelector("#success-total").textContent=money(data.total);
  document.querySelector("#success-dialog").showModal();
}
function showMessage(text){const m=document.querySelector("#order-message");m.textContent=text;m.hidden=false}
function saveCart(){localStorage.setItem("toscana_cart",JSON.stringify(state.cart))}
function restoreCart(){try{state.cart=JSON.parse(localStorage.getItem("toscana_cart"))||[]}catch{state.cart=[]}}
function money(v){return new Intl.NumberFormat("es-EC",{style:"currency",currency:"USD"}).format(Number(v||0))}
function slug(s){return String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-")}
function escapeHtml(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}