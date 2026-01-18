const db = window.supabase; 
let usuarioId = null;
let locales = [];
let map, capaMarcadores = L.layerGroup(), controlRuta = null;
let idRestauranteActual = null; // Variable global vital para las calificaciones

// --- 1. ICONOS: SOLO EMOJIS ---
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

// --- 2. INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await db.auth.getSession();
  if (session) {
    usuarioId = session.user.id;
    actualizarInfoUsuarioHeader();
  }

  // Inicializar mapa
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

  // --- LIMPIAR RUTA AL TOCAR EL MAPA ---
  map.on('click', () => {
    document.getElementById('preview-card')?.classList.add('hidden');
    if (controlRuta) {
        map.removeControl(controlRuta);
        controlRuta = null;
    }
  });
});

// --- 3. CARGAR DATOS (RESTAURANTES + CALIFICACIONES) ---
async function cargarLocalesDesdeDB() {
  try {
    // A) Traemos los restaurantes
    const { data: dataRestaurantes, error } = await db.from('restaurantes').select('*');
    if (error) throw error;

    // B) Traemos TODAS las calificaciones para calcular promedios
    const { data: dataCalificaciones } = await db.from('calificaciones').select('*');

    locales = dataRestaurantes.map((r, index) => {
      // 1. Calcular promedio de estrellas para este restaurante
      const votosEsteLocal = dataCalificaciones.filter(c => c.restaurante_id === r.id);
      const sumaPuntos = votosEsteLocal.reduce((acc, curr) => acc + curr.puntuacion, 0);
      const promedio = votosEsteLocal.length > 0 ? (sumaPuntos / votosEsteLocal.length).toFixed(1) : "Nuevo";
      const totalVotos = votosEsteLocal.length;

      return {
        id: r.id,
        nombre: r.nombre || "Sin nombre",
        lat: r.lat ? parseFloat(r.lat) : 0,
        lng: r.longitud ? parseFloat(r.longitud) : 0,
        cat: r.categoria || "General",
        icono: "🍽️", 
        horario: r.horarios || "Consultar",
        direccion: r.direccion || "",
        img: r.foto_url || `https://picsum.photos/400/300?random=${index}`,
        logo: r.logo_url,
        menu_img: r.menu_digital_url, 
        whatsapp: r.whatsapp || r.telefono || "", 
        mesas_libres: r.mesas_disponibles ?? r.num_mesas, 
        mesas_total: r.mesas_totales ?? r.num_mesas ?? 10,
        // Datos de calificación
        rating: promedio,
        votos: totalVotos
      };
    });

    renderizarMarcadores(locales);
  } catch (err) { console.error("Error cargando datos:", err); }
}

// --- 4. MAPA Y PREVIEW ---
function renderizarMarcadores(lista) {
  capaMarcadores.clearLayers();
  lista.forEach((loc, index) => {
    if (!loc.lat || !loc.lng) return;
    const marker = L.marker([loc.lat, loc.lng], { icon: crearIconoFlotante(loc.icono, index) }).addTo(capaMarcadores);
    
    marker.on('click', e => {
      L.DomEvent.stopPropagation(e);
      if (controlRuta) {
          map.removeControl(controlRuta);
          controlRuta = null;
      }
      mostrarPreview(loc);
      map.panTo([loc.lat - 0.002, loc.lng], { animate: true });
    });
  });
}

function mostrarPreview(loc) {
  const card = document.getElementById('preview-card');
  document.getElementById('preview-nombre').textContent = loc.nombre;
  
  // AQUI MOSTRAMOS LA CALIFICACIÓN EN EL PREVIEW
  const ratingHTML = loc.rating === "Nuevo" 
    ? `<span style="color:#888; font-size:12px; font-weight:bold;">✨ Nuevo</span>` 
    : `<span style="color:#FFD700;">★</span> <b>${loc.rating}</b> <span style="font-size:10px; color:#888;">(${loc.votos})</span>`;

  document.getElementById('preview-cat').innerHTML = `
    ${ratingHTML} • ${loc.cat} <br> 
    <span style="font-size:11px; color:#666;">🕒 ${loc.horario}</span>`;
  
  document.getElementById('preview-img').src = loc.logo || loc.img; 
  
  const btnDetalle = document.getElementById('btn-abrir-detalle');
  btnDetalle.onclick = () => verDetalle(loc.nombre);

  const btnIr = document.getElementById('btn-ir-ahora');
  if(btnIr) {
      btnIr.onclick = () => trazarRuta(loc.lat, loc.lng);
  }
  
  card.classList.remove('hidden');
}

// --- 5. VISTA DE DETALLE (INTEGRADA CON DB) ---
async function verDetalle(nombre) {
  const res = locales.find(l => l.nombre === nombre);
  if (!res) return;
  
  idRestauranteActual = res.id; // IMPORTANTE: Seteamos el ID global

  // 1. Verificar si es favorito
  let esFav = false;
  if (usuarioId) {
      const { data } = await db.from('favoritos').select('*').match({ usuario_id: usuarioId, restaurante_id: res.id });
      esFav = data && data.length > 0;
  }

  // 2. Verificar si el usuario YA calificó este lugar para pintar las estrellas
  let miPuntuacion = 0;
  if (usuarioId) {
      const { data: calif } = await db.from('calificaciones')
        .select('puntuacion')
        .match({ usuario_id: usuarioId, restaurante_id: res.id })
        .single();
      if(calif) miPuntuacion = calif.puntuacion;
  }

  // Llenar datos del DOM
  document.getElementById('detalle-nombre').textContent = res.nombre;
  document.getElementById('detalle-titulo-header').textContent = res.nombre;
  
  // Mostrar Rating Promedio Grande en Detalle
  const ratingTexto = res.rating === "Nuevo" ? "Nuevo" : `${res.rating} (${res.votos} opiniones)`;
  document.getElementById('detalle-categoria').innerHTML = `${res.cat} • <span style="color:#f5c518">★ ${ratingTexto}</span>`;
  
  document.getElementById('detalle-img').src = res.img;
  const logoEl = document.getElementById('detalle-logo-restaurante');
  logoEl.src = res.logo || res.img;

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
            <p>De un total de ${res.mesas_total} lugares</p>
        </div>
        <div class="mesa-indicator" style="background: ${res.mesas_libres > 0 ? '#4CAF50' : '#F44336'}; box-shadow: 0 0 10px ${res.mesas_libres > 0 ? '#4CAF50' : '#F44336'};"></div>
    </div>

    <div style="text-align: center; margin: 25px 0; background: #fff; padding: 20px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.05);">
        <p style="margin: 0 0 10px; font-weight: bold; font-size: 15px; color: #333;">Califica tu experiencia</p>
        <div id="stars-container">
            ${[1,2,3,4,5].map(i => `
                <span class="star" onclick="calificar(${i})" 
                      style="font-size: 36px; cursor: pointer; transition: 0.2s; color: ${i <= miPuntuacion ? '#FFD700' : '#ddd'}; transform: ${i <= miPuntuacion ? 'scale(1.1)' : 'scale(1)'}">★</span>
            `).join('')}
        </div>
        <small style="color:#999; display:block; margin-top:5px;">Toca una estrella para guardar</small>
    </div>

    ${res.menu_img ? `
        <h3 style="margin: 25px 0 10px; font-weight: 800;">📖 Menú Digital</h3>
        <img src="${res.menu_img}" style="width:100%; border-radius:20px; box-shadow: 0 10px 20px rgba(0,0,0,0.1); margin-bottom: 20px;">
    ` : ''}

    <div style="display: flex; gap: 10px; margin-top: 20px;">
      <button id="btn-fav-action" onclick="toggleFav('${res.id}')"
        style="flex:1; padding:15px; border-radius:15px; border:1px solid #000; background:${esFav ? '#000':'#fff'}; color:${esFav ? '#fff':'#000'}; font-weight:600; transition: all 0.3s;">
        ${esFav ? '⭐ Guardado' : '☆ Guardar'}
      </button>
      <button onclick="trazarRuta(${res.lat},${res.lng})"
        style="flex:1; padding:15px; border-radius:15px; background:#000; color:#fff; font-weight:600;">
        📍 Ir ahora
      </button>
    </div>
    
    <button class="btn-ver-mas" onclick="abrirWhatsApp('${res.whatsapp}', '${res.nombre}')" style="width: 100%; margin-top: 15px; background:#25D366; border:none; color:white;">
      💬 Chatear por WhatsApp
    </button>`;

  cambiarVista('detalle');
}

// --- 6. FUNCIÓN DE CALIFICAR (DB CONNECTED) ---
async function calificar(n) {
    if (!usuarioId) {
        alert("🔒 Inicia sesión para guardar tu opinión.");
        return;
    }

    // 1. Efecto visual inmediato (UX Rápida)
    const stars = document.querySelectorAll('.star');
    stars.forEach((s, index) => {
        s.style.color = (index < n) ? '#FFD700' : '#ddd';
        s.style.transform = (index < n) ? 'scale(1.2)' : 'scale(1)';
    });

    try {
        // 2. Guardar en Supabase (Upsert: crea si no existe, actualiza si existe)
        const { error } = await db
            .from('calificaciones')
            .upsert({ 
                usuario_id: usuarioId, 
                restaurante_id: idRestauranteActual, 
                puntuacion: n 
            }, { onConflict: 'usuario_id, restaurante_id' });

        if (error) throw error;

        // 3. Feedback visual (Toast o Alert simple)
        // Opcional: Recargar datos para actualizar promedio global
        // await cargarLocalesDesdeDB(); // Descomentar si quieres actualización en tiempo real (consume más datos)
        
        console.log("Calificación guardada exitosamente");
        
    } catch (err) {
        console.error("Error al calificar:", err);
        alert("Hubo un error al guardar tu calificación. Intenta de nuevo.");
        // Revertir estrellas visualmente si falla (opcional)
    }
}

// --- 7. FUNCIONES DE APOYO Y RUTAS ---

function trazarRuta(lat, lng) {
  const previewCard = document.getElementById('preview-card');
  if(previewCard) {
      previewCard.classList.add('hidden');
  }

  if (controlRuta) map.removeControl(controlRuta);

  navigator.geolocation.getCurrentPosition(pos => {
    controlRuta = L.Routing.control({
      waypoints: [L.latLng(pos.coords.latitude, pos.coords.longitude), L.latLng(lat, lng)],
      lineOptions: { styles: [{ color: '#000', weight: 6, opacity: 0.8 }] },
      createMarker: () => null,
      addWaypoints: false,
      draggableWaypoints: false,
      fitSelectedRoutes: true,
      show: false 
    }).addTo(map);
    
    cambiarVista('mapa');
  }, (err) => {
      alert("Necesitamos tu ubicación para guiarte. Por favor, actívala.");
  });
}

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
    // Calculamos texto de rating para la tarjeta de favoritos
    const ratingTxt = loc.rating === "Nuevo" ? "✨ Nuevo" : `⭐ ${loc.rating}`;
    
    const card = document.createElement('div');
    card.className = "card-restaurante";
    card.innerHTML = `
      <div style="position:relative;">
        <img src="${loc.img}" style="width:100%; height:140px; object-fit:cover; border-radius:15px 15px 0 0;">
        <button onclick="toggleFav('${loc.id}')" style="position:absolute; top:10px; right:10px; background:white; border:none; width:30px; height:30px; border-radius:50%; box-shadow:0 2px 5px rgba(0,0,0,0.2);">🗑️</button>
      </div>
      <div style="padding:15px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
            <h3>${loc.nombre}</h3>
            <span style="font-size:12px; font-weight:bold; color:#f5c518;">${ratingTxt}</span>
        </div>
        <p style="color:#888; font-size:12px;">${loc.cat}</p>
        <button class="btn-ver-mas" style="width:100%; margin-top:10px;" onclick="verDetalle('${loc.nombre}')">Ver Detalles</button>
      </div>`;
    grid.appendChild(card);
  });
}

async function toggleFav(id) {
    if (!usuarioId) return alert("Inicia sesión para guardar favoritos.");
    const { data } = await db.from('favoritos').select('*').match({ usuario_id: usuarioId, restaurante_id: id });
    if (data && data.length > 0) {
        await db.from('favoritos').delete().match({ usuario_id: usuarioId, restaurante_id: id });
    } else {
        await db.from('favoritos').insert({ usuario_id: usuarioId, restaurante_id: id });
    }
    // Refrescar vista actual
    if (!document.getElementById('view-favoritos').classList.contains('hidden')) {
        cargarFavoritos();
    } else if (!document.getElementById('view-detalle').classList.contains('hidden')) {
        const res = locales.find(l => l.id === id);
        if(res) verDetalle(res.nombre);
    }
}

function regresarVistas() { cambiarVista('mapa'); }
function abrirWhatsApp(tel, nom) { window.open(`https://wa.me/${tel.replace(/\D/g,'')}?text=Hola, vengo de la app y quiero informes de ${nom}`); }
async function actualizarInfoUsuarioHeader() {
    const { data } = await db.from('perfiles_clientes').select('nombre, foto_url').eq('id', usuarioId).single();
    if (data) {
        document.getElementById('user-name').textContent = data.nombre;
        document.getElementById('user-photo').src = data.foto_url || "https://picsum.photos/200";
    }
}