// Referencia a Supabase (inicializado en index.html)
const db = window.supabase; 

// Variables Globales
let usuarioId = null;
let locales = [];
let map, capaMarcadores = L.layerGroup(), controlRuta = null;
let idRestauranteActual = null; 

// --- NUEVA FUNCIÓN: ELEGIR EMOJI SEGÚN CATEGORÍA ---
function obtenerEmojiPorCategoria(categoria) {
  // Convertimos a minúsculas para comparar fácil
  const cat = categoria ? categoria.toLowerCase() : "general";

  // 1. Asignación por palabras clave
  if (cat.includes('pizza')) return '🍕';
  if (cat.includes('tacos') || cat.includes('mexic')) return '🌮';
  if (cat.includes('hamburguesa') || cat.includes('burger')) return '🍔';
  if (cat.includes('cafe') || cat.includes('café') || cat.includes('coffee')) return '☕';
  if (cat.includes('bar') || cat.includes('cerveza') || cat.includes('bebida')) return '🍺';
  if (cat.includes('postre') || cat.includes('helado') || cat.includes('donut')) return '🍩';
  if (cat.includes('sushi') || cat.includes('asiatica')) return '🍣';
  if (cat.includes('carne') || cat.includes('parrilla')) return '🥩';
  if (cat.includes('pollo')) return '🍗';
  if (cat.includes('saludable') || cat.includes('ensalada')) return '🥗';

  // 2. Si no coincide con nada, usar uno aleatorio de comida
  const aleatorios = ['🍴', '🍽️', '🍗', '🥣', '🥢','🥩','🥗'];
  return aleatorios[Math.floor(Math.random() * aleatorios.length)];
}

// --- 1. ICONOS: SOLO EMOJIS (VERSIÓN CORREGIDA) ---
function crearIconoFlotante(emoji, index) {
  const delay = (index * 0.1) + "s";
  
  return L.divIcon({
    className: 'custom-marker-container',
    html: `
      <div style="
        position: relative;
        background: #000; 
        width: 45px; height: 45px;
        /* Esta forma crea la gota apuntando abajo-izquierda antes de rotar */
        border-radius: 50% 50% 50% 0; 
        /* Rotamos -45 grados para que la punta quede abajo al centro */
        transform: rotate(-45deg);
        display: flex; align-items: center; justify-content: center;
        box-shadow: 5px 5px 10px rgba(0,0,0,0.3); 
        border: 2px solid white;
        animation: floating 3s ease-in-out ${delay} infinite;">
        
        <div style="
          transform: rotate(45deg); 
          font-size: 24px; 
          line-height: 1;
          margin-top: 2px; /* Pequeño ajuste visual para centrado óptico */
          margin-left: 2px;">
          ${emoji}
        </div>
      </div>`,
    iconSize: [45, 45],
    iconAnchor: [22, 48] // El punto de anclaje (la punta del pin)
  });
}

// --- 2. INICIALIZACIÓN Y GESTIÓN DE SESIÓN ---
document.addEventListener('DOMContentLoaded', async () => {
  // A) Verificar Sesión
  const { data: { session } } = await db.auth.getSession();
  
  if (session) {
    // Si hay sesión, cargamos sus datos normalmente
    usuarioId = session.user.id;
    console.log("Usuario autenticado:", usuarioId);
    await actualizarInfoUsuarioHeader(); 
  } else {
    // SI NO HAY SESIÓN: No redirigimos, solo marcamos como invitado
    usuarioId = null;
    console.log("Modo Invitado activo");
    
    // Opcional: Ajustar UI para invitados
    if(document.getElementById('user-name')) {
        document.getElementById('user-name').textContent = "Invitado";
    }
    if(document.getElementById('user-photo')) {
        document.getElementById('user-photo').src = "https://via.placeholder.com/150?text=Guest";
    }
  }
  // C) Inicializar mapa
  map = L.map('map', { zoomControl: false, attributionControl: false }).setView([19.2826, -99.6557], 14);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png').addTo(map);
  capaMarcadores.addTo(map);

  // D) Cargar Restaurantes
  await cargarLocalesDesdeDB();

  // E) Ocultar Splash screen
  setTimeout(() => {
    const splash = document.getElementById('splash-screen');
    if (splash) {
      splash.style.opacity = '0';
      setTimeout(() => { splash.style.display = 'none'; map.invalidateSize(); }, 500);
    }
  }, 1500);

  // F) Eventos de búsqueda
  document.getElementById('search-input-map')?.addEventListener('input', e => filtrarLocales(e.target.value, false));
  document.getElementById('search-input-fav')?.addEventListener('input', e => filtrarLocales(e.target.value, true));

  // G) Limpiar ruta al tocar el mapa
  map.on('click', () => {
    document.getElementById('preview-card')?.classList.add('hidden');
    if (controlRuta) {
        map.removeControl(controlRuta);
        controlRuta = null;
    }
  });
  // --- ESCUCHA TIEMPO REAL: ACTUALIZAR MESAS ---
  db.channel('cambios-mesas')
    .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'ordenes' }, 
        (payload) => {
          console.log('Cambio en órdenes detectado:', payload);
          // Si el cliente tiene abierto el detalle de UN restaurante...
          if (idRestauranteActual) {
            // ...y el cambio pertenece a ese restaurante, refrescamos el plano
            if (payload.new.restaurante_id === idRestauranteActual || payload.old.restaurante_id === idRestauranteActual) {
              cargarPlanoEsteticoCliente(idRestauranteActual);
              // También refrescamos los locales para actualizar el contador de "Libres/Ocupadas"
              cargarLocalesDesdeDB(); 
            }
          }
        })
    .subscribe();
});

// --- 3. CARGAR DATOS (V9.3 ACTUALIZADO) ---
async function cargarLocalesDesdeDB() {
  try {
    // A) Traemos los restaurantes
    const { data: dataRestaurantes, error } = await db.from('restaurantes').select('*');
    if (error) throw error;

    // B) Traemos TODAS las calificaciones para calcular promedios
    const { data: dataCalificaciones } = await db.from('calificaciones').select('*');

    locales = dataRestaurantes.map((r, index) => {
      // 1. Calcular promedio de estrellas
      const votosEsteLocal = dataCalificaciones.filter(c => c.restaurante_id === r.id);
      const sumaPuntos = votosEsteLocal.reduce((acc, curr) => acc + curr.puntuacion, 0);
      const promedio = votosEsteLocal.length > 0 ? (sumaPuntos / votosEsteLocal.length).toFixed(1) : "Nuevo";
      const totalVotos = votosEsteLocal.length;

      // 2. Manejo de Galería
      let galeriaMenu = [];
      if (Array.isArray(r.galeria_menu)) {
          galeriaMenu = r.galeria_menu;
      } else if (typeof r.galeria_menu === 'string') {
          try { galeriaMenu = JSON.parse(r.galeria_menu); } catch(e) { galeriaMenu = []; }
      }

      return {
        id: r.id,
        nombre: r.nombre || "Sin nombre",
        lat: r.lat ? parseFloat(r.lat) : 0,
        lng: r.longitud ? parseFloat(r.longitud) : 0,
        cat: r.categoria || "General",
        icono: obtenerEmojiPorCategoria(r.categoria),
        horario: r.horarios || "Consultar",
        direccion: r.direccion || "",
        
        img: r.foto_lugar_url || `https://picsum.photos/400/300?random=${index}`,
        logo: r.logo_url, 
        menu_img: r.menu_digital_url, 
        galeria: galeriaMenu,

        whatsapp: r.whatsapp || r.telefono || "", 
        mesas_libres: r.mesas_disponibles ?? r.num_mesas, 
        mesas_total: r.mesas_totales ?? r.num_mesas ?? 10,
        
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
  
  const ratingHTML = loc.rating === "Nuevo" 
    ? `<span style="color:#888; font-size:12px; font-weight:bold;">✨ Nuevo</span>` 
    : `<span style="color:#FFD700;">★</span> <b>${loc.rating}</b> <span style="font-size:10px; color:#888;">(${loc.votos})</span>`;

  document.getElementById('preview-cat').innerHTML = `
    ${ratingHTML} • ${loc.cat} <br> 
    <span style="font-size:11px; color:#666;">🕒 ${loc.horario}</span>`;
  
  document.getElementById('preview-img').src = loc.img || loc.logo; 
  
  const btnDetalle = document.getElementById('btn-abrir-detalle');
  btnDetalle.onclick = () => verDetalle(loc.nombre);

  const btnIr = document.getElementById('btn-ir-ahora');
  if(btnIr) {
      btnIr.onclick = () => trazarRuta(loc.lat, loc.lng);
  }
  
  card.classList.remove('hidden');
}

// --- 5. VISTA DE DETALLE ---
async function verDetalle(nombre) {
  const res = locales.find(l => l.nombre === nombre);
  if (!res) return;
  
  idRestauranteActual = res.id; 

 // Verificar favoritos (Solo si hay usuarioId)
  let esFav = false;
  if (usuarioId) {
      const { data } = await db.from('favoritos').select('*').match({ usuario_id: usuarioId, restaurante_id: res.id });
      esFav = data && data.length > 0;
  }

  // Verificar calificación previa (Solo si hay usuarioId)
  let miPuntuacion = 0;
  if (usuarioId) {
      const { data: calif } = await db.from('calificaciones')
        .select('puntuacion')
        .match({ usuario_id: usuarioId, restaurante_id: res.id })
        .single();
      if(calif) miPuntuacion = calif.puntuacion;
  }

  // Renderizado
  document.getElementById('detalle-nombre').textContent = res.nombre;
  document.getElementById('detalle-titulo-header').textContent = res.nombre;
  
  const ratingTexto = res.rating === "Nuevo" ? "Nuevo" : `${res.rating} (${res.votos} opiniones)`;
  document.getElementById('detalle-categoria').innerHTML = `${res.cat} • <span style="color:#f5c518">★ ${ratingTexto}</span>`;
  
  document.getElementById('detalle-img').src = res.img;
  const logoEl = document.getElementById('detalle-logo-restaurante');
  logoEl.src = res.logo || res.img;

  const info = document.getElementById('detalle-info-box');

  // Carrusel de Menú
  let menuHTML = '';
  if (res.galeria && res.galeria.length > 0) {
      const itemsGaleria = res.galeria.map(imgUrl => `
        <div style="flex: 0 0 auto; width: 85%; scroll-snap-align: center; margin-right: 15px;">
            <img src="${imgUrl}" style="width:100%; height:450px; object-fit:contain; background:#f9f9f9; border-radius:15px; box-shadow:0 4px 10px rgba(0,0,0,0.1);">
        </div>
      `).join('');

      menuHTML = `
        <h3 style="margin: 25px 0 10px; font-weight: 800;">📖 Menú Digital (${res.galeria.length} págs)</h3>
        <div class="menu-carousel" style="display: flex; overflow-x: auto; padding: 10px 0 20px 0; scroll-snap-type: x mandatory; -webkit-overflow-scrolling: touch;">
            ${itemsGaleria}
        </div>
        <p style="text-align:center; color:#999; font-size:12px; margin-top:-10px;">← Desliza para ver más →</p>
      `;

  } else if (res.menu_img) {
      menuHTML = `
        <h3 style="margin: 25px 0 10px; font-weight: 800;">📖 Menú Digital</h3>
        <img src="${res.menu_img}" style="width:100%; border-radius:20px; box-shadow: 0 10px 20px rgba(0,0,0,0.1); margin-bottom: 20px;">
      `;
  }

  // 1. Cálculos previos (importante ponerlos antes del HTML)
const mesasOcupadas = res.mesas_total - res.mesas_libres;
const porcentajeOcupado = (mesasOcupadas / res.mesas_total) * 100;

// 2. Insertar el contenido al contenedor info
info.innerHTML = `
    <div class="info-box-neumorph" style="margin-bottom: 20px;">
        <p>📍 ${res.direccion || 'Sin dirección'}</p>
        <p>🕒 ${res.horario}</p>
    </div>

    <div class="mesa-status-card" style="display: flex; align-items: center; justify-content: space-around; padding: 15px; text-align: center;">
        <div>
            <span style="font-size: 20px;">🟢</span>
            <h3 style="margin: 5px 0 0;">${res.mesas_libres}</h3>
            <p style="font-size: 10px; color: #666; text-transform: uppercase;">Libres</p>
        </div>
        <div style="width: 1px; height: 30px; background: #ddd;"></div>
        <div>
            <span style="font-size: 20px;">🔴</span>
            <h3 style="margin: 5px 0 0;">${mesasOcupadas}</h3>
            <p style="font-size: 10px; color: #666; text-transform: uppercase;">Ocupadas</p>
        </div>
        <div style="width: 1px; height: 30px; background: #ddd;"></div>
        <div>
            <span style="font-size: 20px;">📊</span>
            <h3 style="margin: 5px 0 0;">${res.mesas_total}</h3>
            <p style="font-size: 10px; color: #666; text-transform: uppercase;">Total</p>
        </div>
    </div>

    <div style="width: 100%; height: 6px; background: #eee; border-radius: 10px; margin: 15px 0 25px; overflow: hidden;">
        <div style="width: ${porcentajeOcupado}%; height: 100%; background: ${porcentajeOcupado > 80 ? '#F44336' : '#000'}; transition: width 0.5s;"></div>
    </div>

    <h3 style="margin: 20px 0 10px; font-weight: 800; font-size: 16px;">🗺️ Distribución del Lugar</h3>
    <div id="contenedorPlanoCliente" style="width: 100%; height: 250px; background: #f9f9f9; border-radius: 20px; box-shadow: inset 0 2px 10px rgba(0,0,0,0.05); border: 1px solid #eaeaea; margin-bottom: 25px; overflow: hidden; position: relative;">
        <div id="canvasPlanoCliente"></div>
    </div>

    ${menuHTML}

    <div style="text-align: center; margin-bottom: 25px; background: #fff; padding: 20px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.05);">
        <p style="margin: 0 0 10px; font-weight: bold; font-size: 15px; color: #333;">Califica tu experiencia</p>
        <div id="stars-container">
            ${[1,2,3,4,5].map(i => `
                <span class="star" onclick="calificar(${i})" 
                      style="font-size: 36px; cursor: pointer; transition: 0.2s; color: ${i <= miPuntuacion ? '#FFD700' : '#ddd'}; transform: ${i <= miPuntuacion ? 'scale(1.1)' : 'scale(1)'}">★</span>
            `).join('')}
        </div>
        <small style="color:#999; display:block; margin-top:5px;">Toca una estrella para guardar</small>
    </div>

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
    </button>
`;

  cambiarVista('detalle');
  
setTimeout(() => {
   cargarPlanoEsteticoCliente(res.id);
}, 300);}

// --- 9. RENDERIZAR PLANO ESTÉTICO (CLIENTES) ---
// --- 9. RENDERIZAR PLANO ESTÉTICO (CLIENTES) ---
async function cargarPlanoEsteticoCliente(restauranteId) {
    try {
        // 1. Obtener datos del plano desde Supabase
        const { data: planoData, error } = await db
            .from('planos')
            .select('estructura')
            .eq('restaurante_id', restauranteId)
            .single();

        if (error || !planoData || !planoData.estructura) {
            console.warn("No se encontró estructura de plano para este restaurante.");
            const cont = document.getElementById('contenedorPlanoCliente');
            if (cont) cont.style.display = 'none';
            return;
        }

        // 2. Obtener órdenes activas para saber qué mesas marcar como ocupadas
        const { data: ordenesActivas } = await db
            .from('ordenes')
            .select('mesa')
            .eq('restaurante_id', restauranteId)
            .not('estado', 'in', '("pagado","cancelado")');

        const mesasOcupadas = (ordenesActivas || []).map(o => o.mesa);

        // 3. Pequeña espera para asegurar que el HTML del detalle ya se pintó en pantalla
        setTimeout(() => {
            const container = document.getElementById('contenedorPlanoCliente');
            const canvasDiv = document.getElementById('canvasPlanoCliente');
            if (!canvasDiv) return console.error("No existe el div del canvas");

            canvasDiv.innerHTML = ""; // Limpieza total

            // Asegurarnos de que el JSON sea un objeto, no un string
            const rawData = typeof planoData.estructura === 'string' 
                ? JSON.parse(planoData.estructura) 
                : planoData.estructura;

           // Extraer la parte visual si existe
           const stageData = rawData.visual || rawData;

           const stage = Konva.Node.create(stageData, 'canvasPlanoCliente');
            // 5. AJUSTE DE TAMAÑO Y ESCALA AUTOMÁTICA
            const rect = container.getBoundingClientRect();
            if (rect.width === 0) return; // Evitar cálculos si el contenedor no es visible

            stage.width(rect.width);
            stage.height(rect.height);

            const dataBox = stage.getClientRect({ skipTransform: true });
            const padding = 20;
            const scaleX = (rect.width - padding) / (dataBox.width || 500);
            const scaleY = (rect.height - padding) / (dataBox.height || 400);
            const escala = Math.min(scaleX, scaleY);

            stage.scale({ x: escala, y: escala });
            
            // Centrado
            const xCentrado = (rect.width - (dataBox.width * escala)) / 2 - (dataBox.x * escala);
            const yCentrado = (rect.height - (dataBox.height * escala)) / 2 - (dataBox.y * escala);
            stage.position({ x: xCentrado, y: yCentrado });

            // 6. COLOREAR MESAS SEGÚN ESTADO
            pintarMesas(stage, mesasOcupadas, restauranteId);

        }, 100); // 100ms es suficiente después del render de innerHTML

    } catch (e) {
        console.error("Error fatal en cargarPlanoEsteticoCliente:", e);
    }
}
async function pintarMesas(stage, restauranteId) {
    // 1. Consultamos las órdenes activas en la base de datos
    const { data: ordenesActivas, error } = await db
        .from('ordenes')
        .select('mesa')
        .eq('restaurante_id', restauranteId)
        .not('estado', 'in', '("pagado","cancelado")'); // Solo mesas que realmente están comiendo

    if (error) return console.error("Error al obtener mesas:", error);

    // Creamos un Set para una búsqueda ultra rápida de mesas ocupadas
    const setMesasOcupadas = new Set(ordenesActivas.map(o => o.mesa));

    let mesas = stage.find('.mesa-interactiva');

    // Si no tienen el nombre asignado, se lo ponemos a los grupos con ID
    if (mesas.length === 0) {
        stage.find('Group').forEach(g => { if (g.id()) g.name('mesa-interactiva'); });
        mesas = stage.find('.mesa-interactiva');
    }

    mesas.forEach(mesaGroup => {
        const nombreMesa = mesaGroup.id();
        const estaOcupada = setMesasOcupadas.has(nombreMesa);
        const shape = mesaGroup.findOne('Rect') || mesaGroup.findOne('Circle') || mesaGroup.findOne('Line');

        if (shape) {
            if (estaOcupada) {
                // MESA OCUPADA - Color único por privacidad
                shape.fill('#FF6B6B'); 
                shape.stroke('#EE5253');
            } else {
                // MESA LIBRE
                shape.fill('#FFFFFF'); 
                shape.stroke('#10ad93'); 
            }
            shape.strokeWidth(3);
        }

        // Interacciones y Cursor
        mesaGroup.listening(true);
        mesaGroup.on('mouseenter', () => document.body.style.cursor = 'pointer');
        mesaGroup.on('mouseleave', () => document.body.style.cursor = 'default');

        // Evento de clic con animación
        mesaGroup.off('click tap'); // Limpiamos eventos previos para evitar duplicados
        mesaGroup.on('click tap', () => {
            mesaGroup.to({
                scaleX: 1.05,
                scaleY: 1.05,
                duration: 0.1,
                yoyo: true,
                repeat: 1
            });
            
            // Llamamos al modal de opciones
            mostrarOpcionesMesaCliente(nombreMesa, estaOcupada, restauranteId);
        });
    });

    stage.batchDraw();
}        

// --- 6. FUNCIÓN DE CALIFICAR ---
async function calificar(n) {
    if (!usuarioId) {
        alert("🔒 Inicia sesión para guardar tu opinión.");
        return;
    }

    const stars = document.querySelectorAll('.star');
    stars.forEach((s, index) => {
        s.style.color = (index < n) ? '#FFD700' : '#ddd';
        s.style.transform = (index < n) ? 'scale(1.2)' : 'scale(1)';
    });

    try {
        const { error } = await db
            .from('calificaciones')
            .upsert({ 
                usuario_id: usuarioId, 
                restaurante_id: idRestauranteActual, 
                puntuacion: n 
            }, { onConflict: 'usuario_id, restaurante_id' });

        if (error) throw error;
        console.log("Calificación guardada exitosamente");
        
    } catch (err) {
        console.error("Error al calificar:", err);
        alert("Hubo un error al guardar tu calificación. Intenta de nuevo.");
    }
}

// --- 7. FUNCIONES DE APOYO ---
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
    if (!document.getElementById('view-favoritos').classList.contains('hidden')) {
        cargarFavoritos();
    } else if (!document.getElementById('view-detalle').classList.contains('hidden')) {
        const res = locales.find(l => l.id === id);
        if(res) verDetalle(res.nombre);
    }
}

function regresarVistas() { cambiarVista('mapa'); }
function abrirWhatsApp(tel, nom) { window.open(`https://wa.me/${tel.replace(/\D/g,'')}?text=Hola, vengo de la app y quiero informes de ${nom}`); }

// --- 8. OBTENER INFO USUARIO SIDEBAR ---
async function actualizarInfoUsuarioHeader() {
    const btnLogout = document.querySelector('.logout'); // El botón del sidebar
    const userNameElem = document.getElementById('user-name');
    const userPhotoElem = document.getElementById('user-photo');

    // 1. Lógica para Invitados (Sin sesión)
    if (!usuarioId) {
        userNameElem.textContent = "Invitado";
        userPhotoElem.src = "https://via.placeholder.com/150?text=Guest";
        
        if (btnLogout) {
            btnLogout.textContent = "Iniciar Sesión";
            btnLogout.style.background = "#25D366"; // Verde
            btnLogout.onclick = () => window.location.href = 'login.html';
        }
        return; // Detenemos la ejecución aquí porque no hay datos que buscar
    }

    // 2. Lógica para Usuarios Logueados
    try {
        // Intentamos obtener perfil de la base de datos
        const { data, error } = await db.from('perfiles_clientes')
            .select('nombre, foto_url')
            .eq('id', usuarioId)
            .single();
        
        if (data) {
            userNameElem.textContent = data.nombre || "Usuario";
            userPhotoElem.src = data.foto_url || "https://picsum.photos/200";
        } else {
            // Fallback: Si el usuario existe pero no tiene perfil en la tabla aún
            const { data: authData } = await db.auth.getUser();
            const email = authData.user?.email || "Usuario";
            userNameElem.textContent = email.split('@')[0]; 
            userNameElem.style.fontSize = "16px";
            userPhotoElem.src = "https://picsum.photos/200";
        }

        // Si el usuario está logueado, nos aseguramos que el botón diga "Cerrar Sesión"
        if (btnLogout) {
            btnLogout.textContent = "Cerrar Sesión";
            btnLogout.style.background = ""; // Color original (rojo usualmente)
            // Aquí llamarías a tu función de logout normal
            btnLogout.onclick = () => supaLogout(); 
        }

    } catch (e) {
        console.error("Error al cargar perfil:", e);
    }
}
// --- 10. INTERACCIÓN DE MESAS PARA CLIENTES ---
function mostrarOpcionesMesaCliente(nombreMesa, ocupada, restauranteId) {
    // 1. Crear el elemento <dialog> nativo de HTML5
    const dialog = document.createElement('dialog');
    dialog.style = "padding:0; border-radius:20px; border:none; max-width:320px; width:90%; overflow:hidden; box-shadow: 0 15px 35px rgba(0,0,0,0.2); margin: auto;";
    
    // 2. Configurar colores y textos según el estado
    const headerColor = ocupada ? '#FF6B6B' : '#10ad93';
    const estadoTexto = ocupada ? 'Mesa Ocupada' : 'Mesa Disponible';
    const icono = ocupada ? '🔴' : '🟢';

    // 3. Construir los botones
    let botonesHTML = '';
    if (ocupada) {
        botonesHTML = `
            <button onclick="alert('La función de Lista de Espera estará disponible pronto.')" style="width:100%; padding:15px; background:#f0f0f3; border:2px solid #ddd; border-radius:15px; margin-bottom:10px; font-weight:bold; color:#555; cursor:pointer;">
                ⏱️ Unirse a Lista de Espera
            </button>
        `;
    } else {
        botonesHTML = `
            <button onclick="alert('La función de Reservas estará disponible pronto.')" style="width:100%; padding:15px; background:#000; color:#fff; border:none; border-radius:15px; margin-bottom:10px; font-weight:bold; cursor:pointer; box-shadow: 0 5px 15px rgba(0,0,0,0.2);">
                📅 Reservar esta Mesa
            </button>
            <button onclick="window.location.href='menu.html?rid=${restauranteId}&mesa=${nombreMesa}'" style="width:100%; padding:15px; background:#10ad93; color:#fff; border:none; border-radius:15px; margin-bottom:10px; font-weight:bold; cursor:pointer;">
                🍔 Ver Menú / Pedir Aquí
            </button>
        `;
    }

    // 4. Inyectar el HTML
    dialog.innerHTML = `
        <div style="background:${headerColor}; color:white; padding:20px; text-align:center;">
            <h2 style="margin:0; font-size:22px;">${icono} ${nombreMesa}</h2>
            <p style="margin:5px 0 0 0; font-size:14px; font-weight:500;">${estadoTexto}</p>
        </div>
        <div style="padding:20px; background:#fff;">
            <p style="text-align:center; color:#888; font-size:14px; margin-top:0; margin-bottom: 20px;">¿Qué deseas hacer?</p>
            ${botonesHTML}
            <button onclick="this.closest('dialog').remove()" style="width:100%; padding:15px; background:transparent; border:none; color:#888; font-weight:bold; cursor:pointer;">Cancelar</button>
        </div>
    `;

    // 5. Mostrar en pantalla
    document.body.appendChild(dialog);
    dialog.showModal();
    
    // 6. Cerrar automáticamente si el usuario toca fuera de la tarjeta blanca
    dialog.addEventListener('click', (e) => {
        const rect = dialog.getBoundingClientRect();
        if (e.clientY < rect.top || e.clientY > rect.bottom || e.clientX < rect.left || e.clientX > rect.right) {
            dialog.remove(); // Destruye el modal
        }
    });
}