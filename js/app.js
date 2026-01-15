// ====================================================
// ☕ CAFÉ APP - VERSIÓN FINAL PREMIUM (CORREGIDA)
// ====================================================

const db = window.supabase;

// --- 1. VARIABLES GLOBALES ---
let usuarioId = null;
let locales = [];
let map, capaMarcadores = L.layerGroup(), controlRuta = null;

// --- 2. ICONOS PERSONALIZADOS ---
function crearIconoFlotante(emoji, imgUrl, index = 0) {
    const delay = (index * 0.1) + "s";
    const contenido = imgUrl
        ? `<img src="${imgUrl}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`
        : `<div style="transform:rotate(45deg);font-size:22px;">${emoji}</div>`;

    return L.divIcon({
        className: "custom-marker-container",
        html: `
            <div style="
                background:#fff;
                width:50px; height:50px;
                border-radius:50% 50% 50% 10px;
                transform:rotate(-45deg);
                display:flex; align-items:center; justify-content:center;
                box-shadow:5px 10px 15px rgba(0,0,0,0.3);
                border:3px solid white;
                overflow:hidden;
                animation:floating 3s ease-in-out ${delay} infinite;">
                <div style="width:100%;height:100%;transform:rotate(45deg);
                    display:flex;align-items:center;justify-content:center;">
                    ${contenido}
                </div>
            </div>`,
        iconSize: [50, 50],
        iconAnchor: [25, 50],
    });
}

// --- 3. INICIALIZACIÓN ---
document.addEventListener("DOMContentLoaded", async () => {
    // Verificar Sesión
    const { data: { session } } = await db.auth.getSession();
    if (session) {
        usuarioId = session.user.id;
        actualizarInfoUsuarioHeader();
    }

    // Inicializar mapa
    map = L.map("map", { zoomControl: false, attributionControl: false })
        .setView([19.2826, -99.6557], 13);
    
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png").addTo(map);
    capaMarcadores.addTo(map);

    await cargarLocalesDesdeDB();

    // Splash screen
    setTimeout(() => {
        const splash = document.getElementById("splash-screen");
        if (splash) {
            splash.style.opacity = "0";
            setTimeout(() => {
                splash.style.display = "none";
                map.invalidateSize();
            }, 500);
        }
    }, 1500);

    // Eventos búsqueda
    const inputMap = document.getElementById("search-input-map");
    if (inputMap) inputMap.addEventListener("input", e => filtrarLocales(e.target.value));

    // Clic en mapa para cerrar preview
    map.on("click", () => {
        document.getElementById("preview-card")?.classList.add("hidden");
        if (controlRuta) {
            map.removeControl(controlRuta);
            controlRuta = null;
        }
    });
});

// --- 4. PERFIL USUARIO ---
async function actualizarInfoUsuarioHeader() {
    const nameEl = document.getElementById("user-name");
    const photoEl = document.getElementById("user-photo");
    
    const { data } = await db.from("perfiles_clientes")
        .select("nombre, foto_url")
        .eq("id", usuarioId)
        .single();

    if (data) {
        if (nameEl) nameEl.textContent = data.nombre || "Cliente";
        if (photoEl) photoEl.src = data.foto_url || "https://picsum.photos/200";
    }
}

// --- 5. CARGAR RESTAURANTES ---
async function cargarLocalesDesdeDB() {
    try {
        const { data, error } = await db.from("restaurantes").select("*");
        if (error) throw error;

        locales = data.map((r, index) => ({
            id: r.id,
            nombre: r.nombre || "Sin nombre",
            lat: parseFloat(r.latitud || 0),
            lng: parseFloat(r.longitud || 0),
            direccion: r.direccion || "Dirección no disponible",
            horario: r.horarios || "Consultar horario",
            whatsapp: r.whatsapp || r.telefono || "",
            logo: r.logo_url || "",
            menu_img: r.menu_digital_url || "",
            mesas_total: r.num_mesas || 7, // Basado en tu captura de Supabase
            cat: r.categoria || "Restaurante",
            img: r.foto_url || `https://picsum.photos/400/300?random=${index}`,
            icono: "🍽️"
        }));

        renderizarMarcadores(locales);
    } catch (err) {
        console.error("❌ Error al cargar locales:", err);
    }
}

// --- 6. MARCADORES Y FILTROS (¡LAS QUE FALTABAN!) ---
function renderizarMarcadores(lista) {
    capaMarcadores.clearLayers();
    lista.forEach((loc, index) => {
        if (!loc.lat || !loc.lng) return;
        const icono = crearIconoFlotante(loc.icono, loc.logo, index);
        const marker = L.marker([loc.lat, loc.lng], { icon: icono }).addTo(capaMarcadores);

        marker.on("click", e => {
            L.DomEvent.stopPropagation(e);
            mostrarPreview(loc);
            map.panTo([loc.lat - 0.002, loc.lng], { animate: true });
        });
    });
}

function filtrarLocales(termino) {
    const q = termino.toLowerCase();
    const filtrados = locales.filter(l => 
        l.nombre.toLowerCase().includes(q) || 
        l.cat.toLowerCase().includes(q)
    );
    renderizarMarcadores(filtrados);
}

function filtrarPorChip(categoria) {
    // Si la categoría es 'Todos', mostramos todo. Si no, filtramos.
    const filtrados = (categoria === 'Todos') 
        ? locales 
        : locales.filter(l => l.cat.toLowerCase() === categoria.toLowerCase());
    
    renderizarMarcadores(filtrados);
    
    // Feedback visual opcional: cerrar preview si estaba abierta
    document.getElementById("preview-card")?.classList.add("hidden");
}

// --- 7. DETALLES Y PREVIEW ---
function mostrarPreview(loc) {
    const card = document.getElementById("preview-card");
    document.getElementById("preview-nombre").textContent = loc.nombre;
    document.getElementById("preview-cat").textContent = loc.cat;
    document.getElementById("preview-img").src = loc.logo || loc.img;
    document.getElementById("btn-abrir-detalle").onclick = () => verDetalle(loc);
    card.classList.remove("hidden");
}

async function verDetalle(res) {
    let mesasOcupadas = 0;
    if (res.mesas_total > 0) {
        const { count } = await db
            .from("ordenes")
            .select("*", { count: "exact", head: true })
            .eq("restaurante_id", res.id)
            .neq("estado", "pagado")
            .neq("estado", "terminado");

        mesasOcupadas = count || 0;
    }

    const mesasLibres = Math.max(0, res.mesas_total - mesasOcupadas);
    const colorEstado = mesasLibres > 0 ? "#25D366" : "#FF3B30";

    document.getElementById("detalle-img").src = res.img;
    const logoEl = document.getElementById("detalle-logo-restaurante");
    logoEl.src = res.logo;
    logoEl.style.display = res.logo ? "block" : "none";

    document.getElementById("detalle-nombre").textContent = res.nombre;
    document.getElementById("detalle-titulo-header").textContent = res.nombre;
    document.getElementById("detalle-categoria").textContent = res.cat;

    // Verificar favoritos
    let esFav = false;
    if (usuarioId) {
        const { data } = await db.from("favoritos")
            .select("*")
            .match({ usuario_id: usuarioId, restaurante_id: res.id });
        esFav = data && data.length > 0;
    }

    const info = document.getElementById("detalle-info-box");
    info.innerHTML = `
        <div class="info-box-neumorph" style="margin-bottom:15px; padding:15px;">
            <p style="margin:0;">📍 ${res.direccion}</p>
            <p style="margin:5px 0 0 0; color:gray; font-size:14px;">🕒 ${res.horario}</p>
        </div>

        <div class="mesa-status-card">
            <div class="mesa-icon-box">🪑</div>
            <div class="mesa-info">
                <h3>${mesasLibres} mesas disponibles</h3>
                <p>Capacidad total: ${res.mesas_total}</p>
            </div>
            <div class="mesa-indicator" style="background:${colorEstado};"></div>
        </div>

        ${res.menu_img 
            ? `<button onclick="window.open('${res.menu_img}','_blank')" class="btn-ver-mas" style="margin-top:15px; width:100%;">📖 Ver Menú Digital</button>`
            : `<p style="color:gray; text-align:center; margin-top:10px;">📄 Menú no disponible</p>`
        }

        <div style="margin-top:20px; display:flex; gap:10px;">
            <button onclick="trazarRuta(${res.lat},${res.lng})" 
                style="flex:1; padding:15px; border-radius:15px; background:#000; color:#fff; font-weight:700; border:none;">📍 GPS</button>
            <button onclick="abrirWhatsApp('${res.whatsapp}','${res.nombre}')"
                style="flex:1; padding:15px; border-radius:15px; background:#25D366; color:#fff; font-weight:700; border:none;">💬 WhatsApp</button>
        </div>

        <button id="btn-fav-action" onclick="toggleFav('${res.id}')"
            style="margin-top:15px; width:100%; padding:15px; border-radius:15px; border:2px solid #000; background:${esFav ? '#000' : '#fff'}; color:${esFav ? '#fff' : '#000'}; font-weight:700;">
            ${esFav ? '⭐ Guardado' : '☆ Guardar en favoritos'}
        </button>
    `;

    cambiarVista("detalle");
}

// --- 8. FAVORITOS ---
async function toggleFav(restauranteId) {
    if (!usuarioId) return alert("Inicia sesión para esta función.");

    const { data: existente } = await db.from("favoritos")
        .select("id")
        .match({ usuario_id: usuarioId, restaurante_id: restauranteId })
        .maybeSingle();

    if (existente) {
        await db.from("favoritos").delete().eq("id", existente.id);
    } else {
        await db.from("favoritos").insert([{ usuario_id: usuarioId, restaurante_id: restauranteId }]);
    }

    const local = locales.find(l => l.id === restauranteId);
    verDetalle(local);
}

// --- 9. WHATSAPP Y GPS ---
function abrirWhatsApp(tel, nombre) {
    if (!tel) return alert("Número no disponible.");
    const limpio = tel.replace(/\D/g, "");
    const msg = encodeURIComponent(`¡Hola! Vi "${nombre}" en la app y me gustaría información.`);
    window.open(`https://wa.me/${limpio}?text=${msg}`, "_blank");
}

function trazarRuta(lat, lng) {
    if (controlRuta) map.removeControl(controlRuta);
    navigator.geolocation.getCurrentPosition(pos => {
        controlRuta = L.Routing.control({
            waypoints: [L.latLng(pos.coords.latitude, pos.coords.longitude), L.latLng(lat, lng)],
            lineOptions: { styles: [{ color: "#000", weight: 6, opacity: 0.8 }] },
            createMarker: () => null,
            addWaypoints: false,
            fitSelectedRoutes: true,
            show: false
        }).addTo(map);
        cambiarVista("mapa");
    }, () => alert("Por favor activa el GPS."));
}

// --- 10. VISTAS ---
function cambiarVista(vista) {
    document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
    const target = document.getElementById(`view-${vista}`);
    if (target) target.classList.remove("hidden");
    if (vista === "mapa") setTimeout(() => map.invalidateSize(), 300);
}

function regresarVistas() {
    cambiarVista("mapa");
}