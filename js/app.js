// === CONFIGURACIÓN SUPABASE ===
const db = window.supabase;
let usuarioId = null;
let locales = [];
let map, capaMarcadores = L.layerGroup(), controlRuta = null;

// === ICONOS (Solo emojis flotantes) ===
function crearIconoFlotante(emoji, index) {
  const delay = (index * 0.1) + "s";
  return L.divIcon({
    className: 'custom-marker-container',
    html: `
      <div style="
        background: #000; width: 45px; height: 45px;
        border-radius: 50% 50% 50% 12px; transform: rotate(-45deg);
        display: flex; align-items: center; justify-content: center;
        box-shadow: 5px 10px 15px rgba(0,0,0,0.3); border: 2px solid white;
        animation: floating 3s ease-in-out ${delay} infinite;">
        <div style="transform: rotate(45deg); font-size: 22px;">${emoji || '🍽️'}</div>
      </div>`,
    iconSize: [45, 45],
    iconAnchor: [22, 45]
  });
}

// === INICIALIZACIÓN ===
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

  // Splash screen
  setTimeout(() => {
    const splash = document.getElementById('splash-screen');
    if (splash) {
      splash.style.opacity = '0';
      setTimeout(() => { splash.style.display = 'none'; map.invalidateSize(); }, 500);
    }
  }, 1500);

  // Eventos de búsqueda
  document.getElementById('search-input-map')?.addEventListener('input', e => filtrarLocales(e.target.value, false));
  document.getElementById('search-input-fav')?.addEventListener('input', e => filtrarLocales(e.target.value, true));

  // Cerrar preview al tocar el mapa
  map.on('click', () => {
    document.getElementById('preview-card')?.classList.add('hidden');
    if (controlRuta) { map.removeControl(controlRuta); controlRuta = null; }
  });
});

// === CARGAR RESTAURANTES ===
async function cargarLocalesDesdeDB() {
  try {
    const { data, error } = await db.from('restaurantes').select('*');
    if (error) throw error;

    locales = data.map((r, index) => ({
      id: r.id,
      nombre: r.nombre || "Sin nombre",
      lat: r.lat ? parseFloat(r.lat) : 0,
      lng: r.lng ? parseFloat(r.lng) : 0,
      cat: r.categoria || "General",
      icono: "🍽️",
      horario: r.horarios || "Consultar",
      direccion: r.direccion || "",
      img: r.foto_url || `https://picsum.photos/400/300?random=${index}`,
      logo: r.logo_url,
      menu_img: r.menu_digital_url,
      whatsapp: r.whatsapp || r.telefono || "",
      mesas_libres: r.mesas_disponibles ?? r.num_mesas ?? 5,
      mesas_total: r.mesas_totales ?? r.num_mesas ?? 10
    }));

    renderizarMarcadores(locales);
  } catch (err) {
    console.error("Error al cargar locales:", err);
  }
}

// === MARCADORES Y TARJETA PREVIA ===
function renderizarMarcadores(lista) {
  capaMarcadores.clearLayers();
  lista.forEach((loc, index) => {
    if (!loc.lat || !loc.lng) return;
    const marker = L.marker([loc.lat, loc.lng], { icon: crearIconoFlotante(loc.icono, index) }).addTo(capaMarcadores);
    marker.on('click', e => {
      L.DomEvent.stopPropagation(e);
      mostrarPreview(loc);
      map.panTo([loc.lat - 0.002, loc.lng], { animate: true });
    });
  });
}

function mostrarPreview(loc) {
  const card = document.getElementById('preview-card');
  const imgEl = document.getElementById('preview-img');
  const nameEl = document.getElementById('preview-nombre');
  const catEl = document.getElementById('preview-cat');
  const btn = document.getElementById('btn-abrir-detalle');

  imgEl.src = loc.logo || loc.img;
  nameEl.textContent = loc.nombre;
  catEl.innerHTML = `${loc.cat} <br><span style="font-size:11px;color:#666;">🕒 ${loc.horario}</span>`;
  btn.textContent = "Ver detalles";
  btn.onclick = () => verDetalle(loc.nombre);

  card.classList.remove('hidden');
}

// === VISTA DETALLE ===
async function verDetalle(nombre) {
  const res = locales.find(l => l.nombre === nombre);
  if (!res) return;

  let esFav = false;
  if (usuarioId) {
    const { data } = await db.from('favoritos').select('*').match({ usuario_id: usuarioId, restaurante_id: res.id });
    esFav = data && data.length > 0;
  }

  document.getElementById('detalle-nombre').textContent = res.nombre;
  document.getElementById('detalle-titulo-header').textContent = res.nombre;
  document.getElementById('detalle-categoria').textContent = res.cat;
  document.getElementById('detalle-img').src = res.img;
  document.getElementById('detalle-logo-restaurante').src = res.logo || res.img;

  const info = document.getElementById('detalle-info-box');
  info.innerHTML = `
    <div class="info-box-neumorph" style="margin-bottom: 20px;">
        <p>📍 ${res.direccion || 'Sin dirección'}</p>
        <p>🕒 ${res.horario}</p>
    </div>

    <div class="mesa-status-card">
        <div class="mesa-icon-box">🪑</div>
        <div class="mesa-info">
            <h3>${res.mesas_libres} Mesas Libres</h3>
            <p>De un total de ${res.mesas_total}</p>
        </div>
        <div class="mesa-indicator" style="background:${res.mesas_libres > 0 ? '#4CAF50':'#F44336'};box-shadow:0 0 10px ${res.mesas_libres > 0 ? '#4CAF50':'#F44336'};"></div>
    </div>

    ${res.menu_img ? `
      <h3 style="margin:25px 0 10px;font-weight:800;">📖 Menú Digital</h3>
      <img src="${res.menu_img}" style="width:100%;border-radius:20px;box-shadow:0 10px 20px rgba(0,0,0,0.1);margin-bottom:20px;">
    ` : ''}

    <div style="display:flex;gap:10px;margin-top:20px;">
      <button id="btn-fav-action" onclick="toggleFav('${res.id}')"
        style="flex:1;padding:15px;border-radius:15px;border:1px solid #000;
        background:${esFav ? '#000':'#fff'};color:${esFav ? '#fff':'#000'};font-weight:600;">
        ${esFav ? '⭐ Guardado' : '☆ Guardar'}
      </button>
      <button onclick="trazarRuta(${res.lat},${res.lng})"
        style="flex:1;padding:15px;border-radius:15px;background:#000;color:#fff;font-weight:600;">
        📍 Ir ahora
      </button>
    </div>
    
    <button class="btn-ver-mas" onclick="abrirWhatsApp('${res.whatsapp}', '${res.nombre}')" 
      style="width:100%;margin-top:15px;background:#25D366;border:none;color:white;">
      💬 Chatear por WhatsApp
    </button>
  `;

  cambiarVista('detalle');
}

// === FUNCIONES DE NAVEGACIÓN Y FILTRADO ===
function cambiarVista(target) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(`view-${target}`).classList.remove('hidden');
  if (target !== 'detalle') {
    const activeBtn = document.getElementById(`btn-${target}`);
    if (activeBtn) activeBtn.classList.add('active');
  }
  if (target === 'mapa') setTimeout(() => map.invalidateSize(), 300);
  if (target === 'favoritos') cargarFavoritos();
}

async function filtrarLocales(termino, esFav) {
  const q = termino.toLowerCase();
  let listaFiltrada = locales;
  if (esFav) {
    const { data: favs } = await db.from('favoritos').select('restaurante_id').eq('usuario_id', usuarioId);
    const idsFavs = favs.map(f => f.restaurante_id);
    listaFiltrada = locales.filter(l => idsFavs.includes(l.id));
  }
  const res = listaFiltrada.filter(l => l.nombre.toLowerCase().includes(q) || l.cat.toLowerCase().includes(q));
  esFav ? mostrarFavoritosEnGrid(res) : renderizarMarcadores(res);
}

// === TRAZAR RUTA (sin tarjeta) ===
function trazarRuta(lat, lng) {
  if (controlRuta) map.removeControl(controlRuta);
  document.getElementById('preview-card')?.classList.add('hidden'); // Ocultar preview

  navigator.geolocation.getCurrentPosition(pos => {
    controlRuta = L.Routing.control({
      waypoints: [
        L.latLng(pos.coords.latitude, pos.coords.longitude),
        L.latLng(lat, lng)
      ],
      lineOptions: { styles: [{ color: '#000', weight: 6 }] },
      createMarker: () => null,
      show: false
    }).addTo(map);
    cambiarVista('mapa');
  }, () => alert("No se pudo obtener tu ubicación. Activa el GPS."));
}

// === FAVORITOS Y UTILIDADES ===
async function cargarFavoritos() {
  if (!usuarioId) return;
  const { data: favs } = await db.from('favoritos').select('restaurante_id').eq('usuario_id', usuarioId);
  const ids = favs.map(f => f.restaurante_id);
  mostrarFavoritosEnGrid(locales.filter(loc => ids.includes(loc.id)));
}

function mostrarFavoritosEnGrid(lista) {
  const grid = document.getElementById('grid-favoritos');
  grid.innerHTML = lista.length ? "" : "<p style='text-align:center;'>No tienes favoritos.</p>";
  lista.forEach(loc => {
    const card = document.createElement('div');
    card.className = "card-restaurante";
    card.innerHTML = `
      <div style="position:relative;">
        <img src="${loc.img}" style="width:100%;height:140px;object-fit:cover;border-radius:15px 15px 0 0;">
        <button onclick="toggleFav('${loc.id}')" style="position:absolute;top:10px;right:10px;background:white;border:none;width:30px;height:30px;border-radius:50%;">🗑️</button>
      </div>
      <div style="padding:15px;">
        <h3>${loc.nombre}</h3>
        <p style="color:#888;font-size:12px;">${loc.cat}</p>
        <button class="btn-ver-mas" style="width:100%;margin-top:10px;" onclick="verDetalle('${loc.nombre}')">Ver Detalles</button>
      </div>`;
    grid.appendChild(card);
  });
}

function regresarVistas() { cambiarVista('mapa'); }
function abrirWhatsApp(tel, nom) { 
  window.open(`https://wa.me/${tel.replace(/\D/g,'')}?text=Hola, vengo de la app y quiero informes de ${nom}`); 
}

async function actualizarInfoUsuarioHeader() {
  const { data } = await db.from('perfiles_clientes').select('nombre, foto_url').eq('id', usuarioId).single();
  if (data) {
    document.getElementById('user-name').textContent = data.nombre;
    document.getElementById('user-photo').src = data.foto_url || "https://picsum.photos/200";
  }
}