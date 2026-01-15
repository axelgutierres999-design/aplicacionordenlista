// ====================================================
// ☕ CAFÉ APP - VERSIÓN FINAL PREMIUM
// ====================================================

// --- 0. SUPABASE GLOBAL ---
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
  const inputFav = document.getElementById("search-input-fav");
  if (inputMap) inputMap.addEventListener("input", e => filtrarLocales(e.target.value, false));
  if (inputFav) inputFav.addEventListener("input", e => filtrarLocales(e.target.value, true));

  // Clic en mapa
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
    if (!data || data.length === 0) {
      console.warn("⚠️ No hay restaurantes registrados.");
      return;
    }

    locales = data.map((r, index) => ({
      id: r.id,
      nombre: r.nombre || "Sin nombre",
      lat: parseFloat(r.latitud || 0),
      lng: parseFloat(r.longitud || 0),
      direccion: r.direccion || "",
      horario: r.horarios || "Consultar horario",
      whatsapp: r.whatsapp || r.telefono || "",
      logo: r.logo_url || "",
      menu_img: r.menu_digital_url || "",
      mesas_total: r.mesas_totales || r.num_mesas || 0,
      cat: r.categoria || "Restaurante",
      img: r.foto_url || `https://picsum.photos/400/300?random=${index}`,
      icono: "🍽️"
    }));

    renderizarMarcadores(locales);
  } catch (err) {
    console.error("❌ Error al cargar locales:", err);
  }
}

// --- 6. MARCADORES Y PREVIEW ---
function renderizarMarcadores(lista) {
  capaMarcadores.clearLayers();
  lista.forEach((loc, index) => {
    if (!loc.lat || !loc.lng) return;
    const icono = crearIconoFlotante(loc.icono, loc.logo, index);
    const marker = L.marker([loc.lat, loc.lng], { icon: icono }).addTo(capaMarcadores);

    marker.on("click", e => {
      L.DomEvent.stopPropagation(e);
      mostrarPreview(loc);
      map.panTo([loc.lat - 0.002, loc.lng]);
    });
  });
}

function mostrarPreview(loc) {
  const card = document.getElementById("preview-card");
  document.getElementById("preview-nombre").textContent = loc.nombre;
  document.getElementById("preview-cat").textContent = loc.cat;
  document.getElementById("preview-img").src = loc.logo || loc.img;
  document.getElementById("btn-abrir-detalle").onclick = () => verDetalle(loc);
  card.classList.remove("hidden");
}

// --- 7. DETALLES CON MESAS Y FAVORITOS ---
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

  // Verificar si es favorito
  let esFav = false;
  if (usuarioId) {
    const { data } = await db.from("favoritos")
      .select("*")
      .match({ usuario_id: usuarioId, restaurante_id: res.id });
    esFav = data && data.length > 0;
  }

  const info = document.getElementById("detalle-info-box");
  info.innerHTML = `
    <div class="info-box-neumorph" style="margin-bottom:15px;">
      <p>📍 ${res.direccion}</p>
      <p>🕒 ${res.horario}</p>
    </div>

    <div class="mesa-status-card">
      <div class="mesa-icon-box">🪑</div>
      <div class="mesa-info">
        <h3>${mesasLibres} mesas disponibles</h3>
        <p>Total: ${res.mesas_total}</p>
      </div>
      <div class="mesa-indicator" style="background:${colorEstado};"></div>
    </div>

    ${
      res.menu_img
        ? `<button onclick="window.open('${res.menu_img}','_blank')" class="btn-ver-mas">📖 Ver menú</button>`
        : "<p style='color:gray;margin-top:10px;'>📄 Menú no disponible</p>"
    }

    <div style="margin-top:25px;display:flex;gap:12px;">
      <button onclick="trazarRuta(${res.lat},${res.lng})"
        style="flex:1;padding:16px;border-radius:18px;background:#000;color:#fff;font-weight:700;">
        📍 Ir ahora
      </button>
      <button onclick="abrirWhatsApp('${res.whatsapp}','${res.nombre}')"
        style="flex:1;padding:16px;border-radius:18px;background:#25D366;color:#fff;font-weight:700;">
        💬 WhatsApp
      </button>
    </div>

    <button id="btn-fav-action" onclick="toggleFav('${res.id}')"
      style="margin-top:15px;width:100%;padding:14px;border-radius:16px;
      border:1px solid #000;background:${esFav ? '#000':'#fff'};
      color:${esFav ? '#fff':'#000'};font-weight:700;">
      ${esFav ? '⭐ Guardado en favoritos' : '☆ Guardar en favoritos'}
    </button>
  `;

  cambiarVista("detalle");
}

// --- 8. FAVORITOS ---
async function toggleFav(restauranteId) {
  if (!usuarioId) return alert("Debes iniciar sesión para guardar favoritos.");

  const { data: existente } = await db.from("favoritos")
    .select("id")
    .match({ usuario_id: usuarioId, restaurante_id: restauranteId })
    .single();

  if (existente) {
    await db.from("favoritos").delete().eq("id", existente.id);
  } else {
    await db.from("favoritos").insert([{ usuario_id: usuarioId, restaurante_id: restauranteId }]);
  }

  const local = locales.find(l => l.id === restauranteId);
  if (!document.getElementById("view-detalle").classList.contains("hidden")) verDetalle(local);
}

// --- 9. WHATSAPP Y GPS ---
function abrirWhatsApp(tel, nombre) {
  if (!tel) return alert("No hay número disponible.");
  const limpio = tel.replace(/\D/g, "");
  const msg = encodeURIComponent(`¡Hola! Vi su restaurante "${nombre}" en la app.`);
  window.open(`https://wa.me/${limpio}?text=${msg}`, "_blank");
}

function trazarRuta(lat, lng) {
  if (controlRuta) map.removeControl(controlRuta);
  navigator.geolocation.getCurrentPosition(
    pos => {
      const start = L.latLng(pos.coords.latitude, pos.coords.longitude);
      const end = L.latLng(lat, lng);
      controlRuta = L.Routing.control({
        waypoints: [start, end],
        lineOptions: { styles: [{ color: "#000", weight: 6, opacity: 0.8 }] },
        createMarker: () => null,
        addWaypoints: false,
        draggableWaypoints: false,
        fitSelectedRoutes: true,
        show: false,
      }).addTo(map);
      cambiarVista("mapa");
    },
    () => alert("Activa tu GPS para calcular la ruta.")
  );
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