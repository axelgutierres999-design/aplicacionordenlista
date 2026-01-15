// --- 0. INICIALIZACIÓN ---
const db = window.supabase; 
let usuarioId = null;
let locales = [];
let map, capaMarcadores = L.layerGroup(), controlRuta = null;

// --- 1. CREADOR DE ICONOS PERSONALIZADOS (USANDO LOGO DEL SQL) ---
function crearIconoFlotante(logoUrl, index) {
    const delay = (index * 0.1) + "s";
    // Si no hay logo, ponemos un emoji genérico
    const contenido = logoUrl 
        ? `<img src="${logoUrl}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`
        : `<div style="transform: rotate(45deg); font-size: 20px;">🍽️</div>`;

    return L.divIcon({
        className: 'custom-marker-container',
        html: `
            <div style="
                background: #fff; width: 45px; height: 45px;
                border-radius: 50% 50% 50% 12px; transform: rotate(-45deg);
                display: flex; align-items: center; justify-content: center;
                box-shadow: 5px 10px 15px rgba(0,0,0,0.3); border: 2px solid white;
                overflow: hidden; animation: floating 3s ease-in-out ${delay} infinite;">
                <div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; transform: rotate(45deg);">
                    ${contenido}
                </div>
            </div>`,
        iconSize: [45, 45],
        iconAnchor: [22, 45]
    });
}

// --- 2. INICIALIZACIÓN Y SPLASH ANIMADO ---
document.addEventListener('DOMContentLoaded', async () => {
    // Verificar Sesión
    const { data: { session } } = await db.auth.getSession();
    if (session) usuarioId = session.user.id;

    // Inicializar mapa
    map = L.map('map', { zoomControl: false, attributionControl: false }).setView([19.2826, -99.6557], 14);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png').addTo(map);
    capaMarcadores.addTo(map);

    await cargarLocalesDesdeDB();

    // Splash Screen con salida suave
    const splash = document.getElementById('splash-screen');
    if (splash) {
        setTimeout(() => {
            splash.style.transition = "opacity 0.8s ease, transform 0.8s ease";
            splash.style.opacity = '0';
            splash.style.transform = "scale(1.1)"; // Efecto de zoom al salir
            setTimeout(() => {
                splash.style.display = 'none';
                map.invalidateSize();
            }, 800);
        }, 2000); // 2 segundos de lucimiento
    }
});

// --- 3. CARGAR DATOS (MAPEADO AL SQL V9.2) ---
async function cargarLocalesDesdeDB() {
    try {
        const { data, error } = await db.from('restaurantes').select('*');
        if (error) throw error;

        locales = data.map((r, index) => ({
            id: r.id,
            nombre: r.nombre,
            lat: r.lat || 0,
            lng: r.longitud || 0,
            cat: r.categoria || "Restaurante",
            logo: r.logo_url, // Extraído del SQL
            portada: r.foto_url || `https://picsum.photos/400/300?random=${index}`,
            direccion: r.direccion || "Dirección no disponible",
            horario: r.horarios || "8:00 AM - 10:00 PM",
            whatsapp: r.telefono || "", // Usamos 'telefono' del SQL para WhatsApp
            menu_img: r.menu_digital_url,
            mesas_total: r.num_mesas || 10,
            // Simulamos disponibilidad para el diseño (o podrías traerlo de otra tabla)
            mesas_libres: Math.floor(Math.random() * (r.num_mesas || 10)) 
        }));

        renderizarMarcadores(locales);
    } catch (err) {
        console.error("Error cargando locales:", err);
    }
}

// --- 4. RENDERIZADO EN MAPA ---
function renderizarMarcadores(lista) {
    capaMarcadores.clearLayers();
    lista.forEach((loc, index) => {
        if (!loc.lat || !loc.lng) return;
        const marker = L.marker([loc.lat, loc.lng], { icon: crearIconoFlotante(loc.logo, index) }).addTo(capaMarcadores);
        marker.on('click', () => {
            mostrarPreview(loc);
            map.panTo([loc.lat - 0.002, loc.lng], { animate: true });
        });
    });
}

function mostrarPreview(loc) {
    const card = document.getElementById('preview-card');
    document.getElementById('preview-nombre').textContent = loc.nombre;
    document.getElementById('preview-cat').textContent = loc.cat;
    document.getElementById('preview-img').src = loc.logo || loc.portada;
    document.getElementById('btn-abrir-detalle').onclick = () => verDetalle(loc.id);
    card.classList.remove('hidden');
}

// --- 5. VISTA DE DETALLE PREMIUM ---
async function verDetalle(id) {
    const res = locales.find(l => l.id === id);
    if (!res) return;

    // 1. Imagen de Portada y Logo Flotante
    document.getElementById('detalle-img').src = res.portada;
    const logoImg = document.getElementById('detalle-logo-restaurante');
    if (logoImg) {
        logoImg.src = res.logo || "";
        logoImg.style.display = res.logo ? 'block' : 'none';
    }

    document.getElementById('detalle-titulo-header').textContent = res.nombre;
    document.getElementById('detalle-nombre').textContent = res.nombre;
    document.getElementById('detalle-categoria').textContent = res.cat;

    // 2. Construcción del cuerpo del detalle
    const infoBox = document.getElementById('detalle-info-box');
    
    // Diseño de Mesas Neumórfico
    const mesasHTML = `
        <div class="mesa-status-card">
            <div class="mesa-icon-box">🪑</div>
            <div class="mesa-info">
                <h3>${res.mesas_libres} Mesas Libres</h3>
                <p>De un total de ${res.mesas_total} lugares</p>
            </div>
            <div class="mesa-indicator" style="background: ${res.mesas_libres > 0 ? '#4CAF50' : '#F44336'}; box-shadow: 0 0 10px ${res.mesas_libres > 0 ? '#4CAF50' : '#F44336'};"></div>
        </div>
    `;

    infoBox.innerHTML = `
        <div class="info-box-neumorph" style="margin-bottom: 20px;">
            <p>📍 ${res.direccion}</p>
            <p>🕒 ${res.horario}</p>
        </div>

        ${mesasHTML}

        ${res.menu_img ? `
            <h3 style="margin: 25px 0 10px; font-weight: 800;">📖 Menú Digital</h3>
            <img src="${res.menu_img}" style="width:100%; border-radius:20px; box-shadow: 0 10px 20px rgba(0,0,0,0.1); margin-bottom: 20px;">
        ` : ''}

        <div style="display: flex; gap: 10px; margin-top: 20px;">
            <button onclick="abrirWhatsApp('${res.whatsapp}', '${res.nombre}')" 
                    style="flex: 1; background: #25D366; color: white; border: none; padding: 16px; border-radius: 15px; font-weight: bold; font-size: 16px; display: flex; align-items: center; justify-content: center; gap: 8px;">
                <span>💬 WhatsApp</span>
            </button>
            <button onclick="trazarRuta(${res.lat}, ${res.lng})" 
                    style="flex: 1; background: #000; color: white; border: none; padding: 16px; border-radius: 15px; font-weight: bold; font-size: 16px;">
                📍 Ir ahora
            </button>
        </div>
    `;

    cambiarVista('detalle');
}

// --- 6. UTILIDADES (WHATSAPP Y RUTAS) ---

function abrirWhatsApp(telefono, nombre) {
    if (!telefono) return alert("Este establecimiento no tiene WhatsApp registrado.");
    
    // Limpiar el número de caracteres no numéricos
    const numLimpio = telefono.replace(/\D/g, '');
    const mensaje = encodeURIComponent(`¡Hola! Vengo de la App y me gustaría pedir información sobre ${nombre}.`);
    
    // Abre WhatsApp en una nueva pestaña
    window.open(`https://wa.me/${numLimpio}?text=${mensaje}`, '_blank');
}

function trazarRuta(lat, lng) {
    if (controlRuta) map.removeControl(controlRuta);
    
    navigator.geolocation.getCurrentPosition(pos => {
        controlRuta = L.Routing.control({
            waypoints: [
                L.latLng(pos.coords.latitude, pos.coords.longitude),
                L.latLng(lat, lng)
            ],
            lineOptions: { styles: [{ color: '#000', weight: 5, opacity: 0.7 }] },
            createMarker: () => null,
            show: false
        }).addTo(map);
        cambiarVista('mapa');
    }, () => alert("Por favor activa el GPS"));
}

function cambiarVista(vista) {
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    document.getElementById(`view-${vista}`).classList.remove('hidden');
    if (vista === 'mapa') setTimeout(() => map.invalidateSize(), 300);
}

function regresarVistas() { cambiarVista('mapa'); }