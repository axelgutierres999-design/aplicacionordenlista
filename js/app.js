// --- 0. INICIALIZACIÓN SUPABASE ---
// Asegúrate de que 'db' o 'supabase' esté definido globalmente en tu HTML o defínelo aquí
// const supabase = supabase.createClient('TU_URL', 'TU_ANON_KEY');
const db = window.supabase; // Asumiendo que usas la variable global del script CDN

// --- 1. CONFIGURACIÓN Y DATOS ---
let usuarioId = null;
let locales = [];

// Variables globales del mapa
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
  // 3.0 Verificar Sesión
  const { data: { session } } = await db.auth.getSession();
  if (session) {
    usuarioId = session.user.id;
    actualizarInfoUsuarioHeader(); // Función opcional para actualizar foto en header
  }

  // 3.1 Inicializar mapa
  map = L.map('map', { zoomControl: false, attributionControl: false }).setView([19.2826, -99.6557], 14);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png').addTo(map);
  capaMarcadores.addTo(map);

  // 3.2 Cargar locales desde Supabase
  await cargarLocalesDesdeDB();

  // 3.3 Splash screen
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

  // 3.4 Eventos de búsqueda
  const inputMap = document.getElementById('search-input-map');
  const inputFav = document.getElementById('search-input-fav');
  if (inputMap) inputMap.addEventListener('input', e => filtrarLocales(e.target.value, false));
  if (inputFav) inputFav.addEventListener('input', e => filtrarLocales(e.target.value, true));

  // 3.5 Clic en el mapa
  map.on('click', () => {
    document.getElementById('preview-card')?.classList.add('hidden');
    if (controlRuta) {
      map.removeControl(controlRuta);
      controlRuta = null;
    }
  });
});

async function actualizarInfoUsuarioHeader() {
    // Busca datos básicos para el header si existen elementos
    const nameEl = document.getElementById('user-name');
    const photoEl = document.getElementById('user-photo');
    
    if (nameEl || photoEl) {
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
    if (!data || data.length === 0) {
      console.warn("⚠️ No hay restaurantes en la base de datos.");
      return;
    }

    // Mapeo exacto con tu SQL
    locales = data.map((r, index) => ({
      id: r.id,
      nombre: r.nombre || "Sin nombre",
      lat: r.lat ? parseFloat(r.lat) : 0,         // SQL: lat
      lng: r.longitud ? parseFloat(r.longitud) : 0, // SQL: longitud
      cat: r.categoria || "General",              // Asegúrate de tener esta columna o usa un default
      icono: "🍽️",                                // Puedes agregar col icono en SQL o usar default
      pago: "Efectivo/Tarjeta",
      horario: r.horarios || "Consultar",
      direccion: r.direccion || "",
      img: r.menu_digital_url || r.qr_pago_url || `https://picsum.photos/400/300?random=${index}` // Usamos urls disponibles o random
    }));

    renderizarMarcadores(locales);
  } catch (err) {
    console.error("❌ Error al cargar restaurantes:", err);
    // alert("Error de conexión con la base de datos."); 
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

  if (esFav) {
      // Lógica especial para filtrar favoritos desde DB
      if (!usuarioId) return;
      const { data: favs } = await db.from('favoritos').select('restaurante_id').eq('usuario_id', usuarioId);
      const idsFavs = favs.map(f => f.restaurante_id);
      listaFiltrada = locales.filter(l => idsFavs.includes(l.id));
  }

  const res = listaFiltrada.filter(l => {
    return l.nombre.toLowerCase().includes(q) || l.cat.toLowerCase().includes(q);
  });

  esFav ? mostrarFavoritosEnGrid(res) : renderizarMarcadores(res);
}

// --- 7. DETALLE Y FAVORITOS ---
async function verDetalle(nombre) {
  const res = locales.find(l => l.nombre === nombre);
  if (!res) return;

  // Verificar si es favorito en DB
  let esFav = false;
  if (usuarioId) {
      const { data } = await db.from('favoritos')
        .select('*')
        .match({ usuario_id: usuarioId, restaurante_id: res.id });
      esFav = data && data.length > 0;
  }

  document.getElementById('detalle-nombre').textContent = res.nombre;
  document.getElementById('detalle-titulo-header').textContent = res.nombre;
  document.getElementById('detalle-categoria').textContent = res.cat;
  document.getElementById('detalle-img').src = res.img;

  const info = document.getElementById('detalle-info-box');
  info.innerHTML = `
    <p>📍 ${res.direccion || 'Sin dirección registrada'}</p>
    <p>🕒 ${res.horario}</p>
    <p>💳 Pago: ${res.pago}</p>
    <div style="margin-top:20px; display:flex; gap:10px;">
      <button id="btn-fav-action" onclick="toggleFav('${res.id}')"
        style="flex:1; padding:15px; border-radius:15px;
               border:1px solid #000; background:${esFav ? '#000':'#fff'};
               color:${esFav ? '#fff':'#000'}; font-weight:600;">
        ${esFav ? '⭐ Guardado' : '☆ Guardar'}
      </button>
      <button onclick="trazarRuta(${res.lat},${res.lng})"
        style="flex:1; padding:15px; border-radius:15px;
               background:#000; color:#fff; font-weight:600;">
        📍 Ir ahora
      </button>
    </div>`;
  cambiarVista('detalle');
}

async function toggleFav(restauranteId) {
  if (!usuarioId) return alert("Debes iniciar sesión para guardar favoritos.");

  // 1. Verificar si ya existe
  const { data: existente } = await db.from('favoritos')
    .select('id')
    .match({ usuario_id: usuarioId, restaurante_id: restauranteId })
    .single();

  if (existente) {
      // BORRAR
      await db.from('favoritos').delete().eq('id', existente.id);
  } else {
      // INSERTAR
      await db.from('favoritos').insert([{ usuario_id: usuarioId, restaurante_id: restauranteId }]);
  }

  // Refrescar vistas
  const local = locales.find(l => l.id === restauranteId);
  if (!document.getElementById('view-detalle').classList.contains('hidden')) verDetalle(local.nombre);
  if (!document.getElementById('view-favoritos').classList.contains('hidden')) cargarFavoritos();
}

async function cargarFavoritos() {
  if (!usuarioId) {
      document.getElementById('grid-favoritos').innerHTML = "<p style='text-align:center; padding:20px;'>Inicia sesión para ver tus favoritos.</p>";
      return;
  }

  // Obtener IDs de favoritos
  const { data: favs, error } = await db.from('favoritos').select('restaurante_id').eq('usuario_id', usuarioId);
  
  if (error || !favs) return;

  const ids = favs.map(f => f.restaurante_id);
  const listaFavoritos = locales.filter(loc => ids.includes(loc.id));
  
  mostrarFavoritosEnGrid(listaFavoritos);
}

function mostrarFavoritosEnGrid(lista) {
  const grid = document.getElementById('grid-favoritos');
  grid.innerHTML = "";
  if (!lista.length) {
    grid.innerHTML = `
      <div style="text-align:center; padding:50px 20px; color:#888;">
        <div style="font-size:40px; margin-bottom:10px;">📂</div>
        <p>No tienes favoritos guardados.</p>
        <button onclick="regresarVistas()" style="margin-top:20px;">Explorar mapa</button>
      </div>`;
    return;
  }
  lista.forEach(loc => {
    const card = document.createElement('div');
    card.className = "card-restaurante";
    card.innerHTML = `
      <div style="position:relative;">
        <img src="${loc.img}" style="width:100%; height:140px; object-fit:cover;">
        <button onclick="toggleFav('${loc.id}')"
          style="position:absolute; top:10px; right:10px; background:white;
                 border:none; width:30px; height:30px; border-radius:50%;
                 box-shadow:0 2px 5px rgba(0,0,0,0.2);">🗑️</button>
      </div>
      <div style="padding:15px;">
        <h3>${loc.nombre}</h3>
        <p style="color:var(--text-dim); font-size:12px;">${loc.cat} • ${loc.horario}</p>
        <button class="btn-ver-detalle-negro" style="width:100%;" onclick="verDetalle('${loc.nombre}')">Ver Detalles</button>
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
  }, err => {
    alert("No se pudo obtener tu ubicación. Activa el GPS.");
    console.error(err);
  });
}