// --- 0. INICIALIZACIÓN SUPABASE ---
const db = window.supabase; 

// --- 1. CONFIGURACIÓN Y DATOS ---
let usuarioId = null;
let locales = [];

// Variables globales del mapa
let map, capaMarcadores = L.layerGroup(), controlRuta = null;

// --- 2. CREADOR DE ICONOS ---
function crearIconoFlotante(emoji, imgUrl) {
  // Si tiene logo, lo usamos en el marcador, si no, usamos el emoji
  const contenido = imgUrl 
    ? `<img src="${imgUrl}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`
    : `<div style="transform: rotate(45deg); font-size: 22px;">${emoji}</div>`;

  return L.divIcon({
    className: 'custom-marker-container',
    html: `
      <div style="
        background: #fff;
        width: 50px; height: 50px;
        border-radius: 50% 50% 50% 10px;
        transform: rotate(-45deg);
        display: flex; align-items: center; justify-content: center;
        box-shadow: 5px 10px 15px rgba(0,0,0,0.3);
        border: 3px solid white;
        overflow: hidden; 
        animation: floating 3s ease-in-out infinite;">
        <div style="width: 100%; height: 100%; transform: rotate(45deg); display:flex; align-items:center; justify-content:center;">
            ${contenido}
        </div>
      </div>`,
    iconSize: [50, 50],
    iconAnchor: [25, 50]
  });
}

// --- 3. INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', async () => {
  // 3.0 Verificar Sesión
  const { data: { session } } = await db.auth.getSession();
  if (session) {
    usuarioId = session.user.id;
    actualizarInfoUsuarioHeader();
  }

  // 3.1 Inicializar mapa
  map = L.map('map', { zoomControl: false, attributionControl: false }).setView([19.2826, -99.6557], 13);
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

  // 3.5 Clic en el mapa para cerrar preview
  map.on('click', () => {
    document.getElementById('preview-card')?.classList.add('hidden');
    if (controlRuta) {
      map.removeControl(controlRuta);
      controlRuta = null;
    }
  });
});

async function actualizarInfoUsuarioHeader() {
    const nameEl = document.getElementById('user-name');
    const photoEl = document.getElementById('user-photo');
    
    if (nameEl || photoEl) {
        const { data } = await db.from('perfiles').select('nombre, foto').eq('id', usuarioId).single();
        if (data) {
            if (nameEl) nameEl.textContent = data.nombre;
            if (photoEl) photoEl.src = data.foto || "https://picsum.photos/200";
        }
    }
}

// --- 4. CARGAR DATOS DESDE SUPABASE (MODIFICADO PARA TU SQL) ---
async function cargarLocalesDesdeDB() {
  try {
    const { data, error } = await db.from('restaurantes').select('*');

    if (error) throw error;
    if (!data || data.length === 0) {
      console.warn("⚠️ No hay restaurantes en la base de datos.");
      return;
    }

    // Mapeo EXACTO según tu SQL
    locales = data.map((r, index) => ({
      id: r.id,
      nombre: r.nombre || "Sin nombre",
      lat: r.lat ? parseFloat(r.lat) : 0,
      lng: r.longitud ? parseFloat(r.longitud) : 0,
      cat: "Restaurante", // Tu tabla no tiene categoria, ponemos genérico
      icono: "🍽️",
      
      // LOGICA DE IMÁGENES
      logo: r.logo_url, // URL DEL LOGO
      // Como no tienes foto de portada en SQL, usamos un placeholder o el mismo logo
      img: `https://picsum.photos/500/300?random=${index}`, 
      
      direccion: r.direccion || "",
      horario: r.horarios || "Consultar",
      whatsapp: r.telefono || "", // Mapeamos telefono a whatsapp
      
      menu_img: r.menu_digital_url, 
      
      // LOGICA DE MESAS (Base de datos)
      mesas_total: r.num_mesas || 0
    }));

    renderizarMarcadores(locales);
  } catch (err) {
    console.error("❌ Error al cargar restaurantes:", err);
  }
}

// --- 5. VISTAS Y NAVEGACIÓN ---
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
    // Pasamos el logo al creador de iconos
    const icono = crearIconoFlotante(loc.icono, loc.logo);
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
  
  // Usar logo en el preview si existe
  document.getElementById('preview-img').src = loc.logo || loc.img;
  
  const btn = document.getElementById('btn-abrir-detalle');
  btn.onclick = () => verDetalle(loc.nombre);
  card.classList.remove('hidden');
}

async function filtrarLocales(termino, esFav) {
  const q = termino.toLowerCase();
  let listaFiltrada = locales;

  if (esFav) {
      // lógica de favoritos simulada localmente por ahora si no hay tabla user-favs completa
      // Ojo: Tu SQL no tiene tabla 'favoritos', así que filtraremos en local por ahora
      listaFiltrada = locales; 
  }

  const res = listaFiltrada.filter(l => {
    return l.nombre.toLowerCase().includes(q);
  });

  esFav ? mostrarFavoritosEnGrid(res) : renderizarMarcadores(res);
}

// --- 7. DETALLE Y CÁLCULO DE MESAS ---
// --- DENTRO DE LA FUNCIÓN verDetalle EN app.js ---

  // Definir color según disponibilidad
  const colorEstado = mesasLibres > 0 ? '#25D366' : '#FF3B30'; // Verde si hay sitio, Rojo si no
  const textoEstado = mesasLibres > 0 ? 'Disponibles' : 'Lleno';

  const mesasHTML = res.mesas_total > 0 
    ? `<div class="mesa-status-card">
         <div class="mesa-icon-box">
           🪑
         </div>
         <div class="mesa-info">
           <h3>${mesasLibres} Mesas ${textoEstado}</h3>
           <p>Capacidad total: ${res.mesas_total}</p>
         </div>
         <div class="mesa-indicator" style="background: ${colorEstado};"></div>
       </div>`
    : '';

  // 1. CALCULAR MESAS DISPONIBLES EN TIEMPO REAL
  // Contamos órdenes que NO estén terminadas ni pagadas
  let mesasOcupadas = 0;
  if(res.mesas_total > 0) {
      const { count, error } = await db
        .from('ordenes')
        .select('*', { count: 'exact', head: true })
        .eq('restaurante_id', res.id)
        .neq('estado', 'pagado') // Asumimos que pagado libera la mesa
        .neq('estado', 'terminado'); // O terminado
      
      if (!error) mesasOcupadas = count;
  }
  
  const mesasLibres = Math.max(0, res.mesas_total - mesasOcupadas);

  // 2. Imagen principal y Logo Flotante
  document.getElementById('detalle-img').src = res.img; // Imagen fondo (genérica)
  const logoEl = document.getElementById('detalle-logo-restaurante');
  
  if (res.logo) {
      logoEl.src = res.logo;
      logoEl.style.display = 'block';
  } else {
      logoEl.style.display = 'none'; // Ocultar si no hay logo
  }

  // 3. Textos básicos
  document.getElementById('detalle-nombre').textContent = res.nombre;
  document.getElementById('detalle-titulo-header').textContent = res.nombre;
  document.getElementById('detalle-categoria').textContent = res.cat;

  // 4. Lógica de Mesas (Visualización)
  const mesasHTML = res.mesas_total > 0 
    ? `<div class="info-box-neumorph" style="background: #eef1f5; border-left: 5px solid #000; margin-bottom: 15px;">
         <div style="display:flex; justify-content:space-between; align-items:center;">
             <div>
                <p style="margin:0; font-weight:bold; font-size: 14px; color:#555;">Disponibilidad</p>
                <h2 style="margin:0; color:#000; font-size: 24px;">${mesasLibres} <span style="font-size:14px; color:#666; font-weight:400;">mesas libres</span></h2>
             </div>
             <div style="text-align:right;">
                <span style="font-size:12px; color:#888;">Capacidad total</span><br>
                <strong>${res.mesas_total}</strong>
             </div>
         </div>
       </div>`
    : '';

  // 5. Menú Digital
  const menuHTML = res.menu_img 
    ? `<div style="margin-top:20px;">
         <h3 style="font-size:16px; margin-bottom:10px;">📖 Menú Digital</h3>
         <button onclick="window.open('${res.menu_img}', '_blank')" style="width:100%; padding:15px; background:#fff; border:1px solid #ccc; border-radius:12px; font-weight:bold;">Ver Menú PDF/Imagen</button>
       </div>`
    : '';

  // 6. Construcción del cuerpo
  const info = document.getElementById('detalle-info-box');
  info.innerHTML = `
    <div class="info-box-neumorph" style="margin-bottom:15px;">
        <p style="margin-bottom:8px;">📍 ${res.direccion || 'Dirección no disponible'}</p>
        <p>🕒 ${res.horario}</p>
    </div>

    ${mesasHTML}
    ${menuHTML}
    
    <div style="margin-top:25px; display:flex; gap:12px;">
      <button onclick="alert('Guardado en favoritos (local)')"
        style="flex:1; padding:16px; border-radius:18px; border:2px solid #000; background:#fff; color:#000; font-weight:700;">
        ☆ Guardar
      </button>
      
      <button onclick="trazarRuta(${res.lat},${res.lng})"
        style="flex:1; padding:16px; border-radius:18px; background:#000; color:#fff; font-weight:700;">
        📍 Ir ahora
      </button>
    </div>
    
    <button class="btn-ver-mas" 
            onclick="abrirWhatsApp('${res.whatsapp}', '${res.nombre}')"
            style="width: 100%; margin-top: 15px; background:#25D366; color:white; display:flex; align-items:center; justify-content:center; gap:10px; border:none; padding:15px; border-radius:15px; font-weight:bold; font-size:16px;">
      <span style="font-size:22px;">💬</span> Chatear por WhatsApp
    </button>
  `;

  cambiarVista('detalle');
}

// Ayudante de WhatsApp
function abrirWhatsApp(telefono, localNombre) {
    if (!telefono || telefono === "") return alert("Este local aún no tiene número registrado.");
    const telLimpio = telefono.replace(/\D/g,''); // Quitar todo lo que no sea numero
    const mensaje = encodeURIComponent(`¡Hola! Vi su local "${localNombre}" en la App y quisiera más información.`);
    window.open(`https://wa.me/${telLimpio}?text=${mensaje}`, '_blank');
}

// --- 8. RUTA GPS ---
function trazarRuta(lat, lng) {
  if (controlRuta) map.removeControl(controlRuta);
  
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
    alert("Activa el GPS para trazar la ruta.");
  });
}