// --- 0. INICIALIZACIÓN SUPABASE ---
const db = window.supabase; 

// --- 1. CONFIGURACIÓN Y DATOS ---
let usuarioId = null;
let locales = [];
let map, capaMarcadores = L.layerGroup(), controlRuta = null;

// --- 2. CREADOR DE ICONOS ---
function crearIconoFlotante(emoji, index) {
  const delay = (index * 0.1) + "s";
  return L.divIcon({
    className: 'custom-marker-container',
    html: `
      <div style="
        background: #000;
        width: 45px; height: 45px;
        border-radius: 50% 50% 50% 12px;
        transform: rotate(-45deg);
        display: flex; align-items: center; justify-content: center;
        box-shadow: 5px 10px 15px rgba(0,0,0,0.3);
        border: 2px solid white;
        animation: floating 3s ease-in-out ${delay} infinite;">
        <div style="transform: rotate(45deg); font-size: 22px;">${emoji}</div>
      </div>`,
    iconSize: [45, 45],
    iconAnchor: [22, 45]
  });
}

// --- 3. INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await db.auth.getSession();
  if (session) {
    usuarioId = session.user.id;
    actualizarInfoUsuarioHeader();
  }

  map = L.map('map', { zoomControl: false, attributionControl: false }).setView([19.2826, -99.6557], 14);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png').addTo(map);
  capaMarcadores.addTo(map);

  await cargarLocalesDesdeDB();

  setTimeout(() => {
    const splash = document.getElementById('splash-screen');
    if (splash) {
      splash.style.opacity = '0';
      setTimeout(() => {
        splash.style.display = 'none';
        map.invalidateSize();
      }, 500);
    }
  }, 1500);

  const inputMap = document.getElementById('search-input-map');
  const inputFav = document.getElementById('search-input-fav');
  if (inputMap) inputMap.addEventListener('input', e => filtrarLocales(e.target.value, false));
  if (inputFav) inputFav.addEventListener('input', e => filtrarLocales(e.target.value, true));

  map.on('click', () => {
    document.getElementById('preview-card')?.classList.add('hidden');
    if (controlRuta) {
      map.removeControl(controlRuta);
      controlRuta = null;
    }
  });
});

async function actualizarInfoUsuarioHeader() {
    const nameEl = document.getElementById('sidebar-user-name');
    const photoEl = document.getElementById('sidebar-user-photo');
    
    if (usuarioId) {
        const { data } = await db.from('perfiles_clientes').select('nombre, foto_url').eq('id', usuarioId).single();
        if (data) {
            if (nameEl) nameEl.textContent = data.nombre;
            if (photoEl) photoEl.src = data.foto_url || "https://picsum.photos/200";
        }
    }
}

// --- 4. CARGAR DATOS DESDE SUPABASE ---
async function cargarLocalesDesdeDB() {
  try {
    const { data, error } = await db.from('restaurantes').select('*');
    if (error) throw error;

    locales = data.map((r, index) => ({
      id: r.id,
      nombre: r.nombre || "Sin nombre",
      lat: r.lat ? parseFloat(r.lat) : 0,
      lng: r.longitud ? parseFloat(r.longitud) : 0,
      cat: r.categoria || "General",
      icono: "🍽️",
      horario: r.horarios || "Consultar",
      direccion: r.direccion || "",
      img: r.foto_url || `https://picsum.photos/400/300?random=${index}`,
      logo_url: r.logo_url, // CAMPO PARA EL LOGO
      menu_img: r.menu_digital_url, 
      whatsapp: r.whatsapp || "", 
      mesas_libres: r.mesas_disponibles || 0,
      mesas_total: r.mesas_totales || 0
    }));

    renderizarMarcadores(locales);
  } catch (err) {
    console.error("❌ Error al cargar restaurantes:", err);
  }
}

// --- 5. VISTAS ---
function cambiarVista(target) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const view = document.getElementById(`view-${target}`);
  if (view) view.classList.remove('hidden');

  const activeBtn = document.getElementById(target === 'detalle' ? 'btn-mapa' : `btn-${target}`);
  if (activeBtn) activeBtn.classList.add('active');

  if (target === 'mapa') setTimeout(() => map.invalidateSize(), 300);
  if (target === 'favoritos') cargarFavoritos();
}

function regresarVistas() {
  cambiarVista('mapa');
}

// --- 6. MAPA Y FILTROS ---
function renderizarMarcadores(lista) {
  capaMarcadores.clearLayers();
  lista.forEach((loc, index) => {
    if (!loc.lat || !loc.lng) return;
    const icono = crearIconoFlotante(loc.icono, index);
    const marker = L.marker([loc.lat, loc.lng], { icon: icono }).addTo(capaMarcadores);
    marker.on('click', e => {
      L.DomEvent.stopPropagation(e);
      mostrarPreview(loc);
      map.panTo([loc.lat - 0.002, loc.lng], { animate: true, duration: 1 });
    });
  });
}

function mostrarPreview(loc) {
  const card = document.getElementById('preview-card');
  document.getElementById('preview-nombre').textContent = loc.nombre;
  document.getElementById('preview-cat').textContent = loc.cat;
  document.getElementById('preview-img').src = loc.img;
  const btn = document.getElementById('btn-abrir-detalle');
  btn.onclick = () => verDetalle(loc.nombre);
  card.classList.remove('hidden');
}

async function filtrarLocales(termino, esFav) {
  const q = termino.toLowerCase();
  let listaFiltrada = locales;

  if (esFav && usuarioId) {
      const { data: favs } = await db.from('favoritos').select('restaurante_id').eq('usuario_id', usuarioId);
      const idsFavs = favs.map(f => f.restaurante_id);
      listaFiltrada = locales.filter(l => idsFavs.includes(l.id));
  }

  const res = listaFiltrada.filter(l => l.nombre.toLowerCase().includes(q) || l.cat.toLowerCase().includes(q));
  esFav ? mostrarFavoritosEnGrid(res) : renderizarMarcadores(res);
}

// --- 7. DETALLE Y FAVORITOS ---
async function verDetalle(nombre) {
  const res = locales.find(l => l.nombre === nombre);
  if (!res) return;

  let esFav = false;
  if (usuarioId) {
      const { data } = await db.from('favoritos')
        .select('*')
        .match({ usuario_id: usuarioId, restaurante_id: res.id });
      esFav = data && data.length > 0;
  }

  // 1. Imagen principal y Logo
  document.getElementById('detalle-img').src = res.img;
  const logoEl = document.getElementById('detalle-logo-restaurante');
  if (logoEl) {
      if (res.logo_url) {
          logoEl.src = res.logo_url;
          logoEl.style.display = 'block';
      } else {
          logoEl.style.display = 'none';
      }
  }

  // 2. Textos básicos
  document.getElementById('detalle-nombre').textContent = res.nombre;
  document.getElementById('detalle-titulo-header').textContent = res.nombre;
  document.getElementById('detalle-categoria').textContent = res.cat;

  // 3. Lógica de Mesas
  const mesasHTML = res.mesas_total > 0 
    ? `<div class="info-box-neumorph" style="background: #eef1f5; border-left: 5px solid #000; margin-top:15px;">
         <p style="margin:0; font-weight:bold;">🪑 Mesas Disponibles</p>
         <h2 style="margin:5px 0 0; color:#000;">${res.mesas_libres} <span style="font-size:14px; color:#666;">de ${res.mesas_total}</span></h2>
       </div>`
    : '';

  // 4. Menú Digital
  const menuHTML = res.menu_img 
    ? `<div style="margin-top:20px;">
         <h3 style="font-size:16px; margin-bottom:10px;">📖 Menú del día</h3>
         <img src="${res.menu_img}" style="width:100%; border-radius:15px; box-shadow: 5px 5px 15px var(--shadow-dark);">
       </div>`
    : '';

  // 5. Construcción de info y BOTONES
  const info = document.getElementById('detalle-info-box');
  info.innerHTML = `
    <div class="info-box-neumorph">
        <p style="margin-bottom:8px;">📍 ${res.direccion || 'Dirección no disponible'}</p>
        <p>🕒 ${res.horario}</p>
    </div>

    ${mesasHTML}
    ${menuHTML}
    
    <div style="margin-top:25px; display:flex; gap:12px;">
      <button id="btn-fav-action" onclick="toggleFav('${res.id}')"
        style="flex:1; padding:16px; border-radius:18px; border:2px solid #000; 
               background:${esFav ? '#000':'#fff'}; color:${esFav ? '#fff':'#000'}; font-weight:700;">
        ${esFav ? '⭐ Guardado' : '☆ Guardar'}
      </button>
      
      <button onclick="trazarRuta(${res.lat},${res.lng})"
        style="flex:1; padding:16px; border-radius:18px; background:#000; color:#fff; font-weight:700;">
        📍 Ir ahora
      </button>
    </div>
    
    <button class="btn-ver-mas" 
            onclick="abrirWhatsApp('${res.whatsapp}', '${res.nombre}')"
            style="width: 100%; margin-top: 15px; background:#25D366; color:white; display:flex; align-items:center; justify-content:center; gap:10px; border:none; padding:15px; border-radius:18px; font-weight:700;">
      <span style="font-size:20px;">💬</span> Chatear por WhatsApp
    </button>
  `;

  cambiarVista('detalle');
}

// Ayudante de WhatsApp
function abrirWhatsApp(telefono, localNombre) {
    if (!telefono || telefono === "") return alert("Este local aún no tiene WhatsApp registrado.");
    const telLimpio = telefono.replace(/\D/g,'');
    const mensaje = encodeURIComponent(`¡Hola! Vengo de la App. Me gustaría pedir informes en ${localNombre}.`);
    window.open(`https://wa.me/${telLimpio}?text=${mensaje}`, '_blank');
}

async function toggleFav(restauranteId) {
  if (!usuarioId) return alert("Debes iniciar sesión para guardar favoritos.");
  const { data: existente } = await db.from('favoritos').select('id').match({ usuario_id: usuarioId, restaurante_id: restauranteId }).single();

  if (existente) {
      await db.from('favoritos').delete().eq('id', existente.id);
  } else {
      await db.from('favoritos').insert([{ usuario_id: usuarioId, restaurante_id: restauranteId }]);
  }

  const local = locales.find(l => l.id === restauranteId);
  if (!document.getElementById('view-detalle').classList.contains('hidden')) verDetalle(local.nombre);
  if (!document.getElementById('view-favoritos').classList.contains('hidden')) cargarFavoritos();
}

async function cargarFavoritos() {
  if (!usuarioId) return;
  const { data: favs } = await db.from('favoritos').select('restaurante_id').eq('usuario_id', usuarioId);
  const ids = favs ? favs.map(f => f.restaurante_id) : [];
  mostrarFavoritosEnGrid(locales.filter(loc => ids.includes(loc.id)));
}

function mostrarFavoritosEnGrid(lista) {
  const grid = document.getElementById('grid-favoritos');
  grid.innerHTML = lista.length ? "" : `<div style="text-align:center; padding:50px 20px; color:#888;">📂<p>No tienes favoritos.</p></div>`;
  lista.forEach(loc => {
    const card = document.createElement('div');
    card.className = "card-restaurante";
    card.innerHTML = `
      <div style="position:relative;">
        <img src="${loc.img}" style="width:100%; height:140px; object-fit:cover; border-radius:15px 15px 0 0;">
        <button onclick="toggleFav('${loc.id}')" style="position:absolute; top:10px; right:10px; background:white; border:none; width:30px; height:30px; border-radius:50%; box-shadow: 0 2px 5px rgba(0,0,0,0.2);">🗑️</button>
      </div>
      <div style="padding:15px;">
        <h3>${loc.nombre}</h3>
        <p style="color:var(--text-dim); font-size:12px;">${loc.cat}</p>
        <button class="btn-ver-detalle-negro" style="width:100%; margin-top:10px;" onclick="verDetalle('${loc.nombre}')">Ver Detalles</button>
      </div>`;
    grid.appendChild(card);
  });
}

// --- 8. RUTA GPS ---
function trazarRuta(lat, lng) {
  if (controlRuta) map.removeControl(controlRuta);
  document.getElementById('preview-card')?.classList.add('hidden');

  navigator.geolocation.getCurrentPosition(pos => {
    const start = L.latLng(pos.coords.latitude, pos.coords.longitude);
    const end = L.latLng(lat, lng);
    controlRuta = L.Routing.control({
      waypoints: [start, end],
      lineOptions: { styles: [{ color: '#000', weight: 6, opacity: 0.8 }] },
      createMarker: () => null,
      addWaypoints: false,
      draggableWaypoints: false,
      fitSelectedRoutes: true,
      show: false
    }).addTo(map);
    cambiarVista('mapa');
  }, () => alert("Activa el GPS para trazar la ruta."));
}