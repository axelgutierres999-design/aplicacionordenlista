// ==========================================
// 1. CONFIGURACIÓN E INICIALIZACIÓN ROBUSTA
// ==========================================
const supabaseUrl = "https://cpveuexgxwxjejurtwro.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwdmV1ZXhneHd4amVqdXJ0d3JvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2MTYxMzAsImV4cCI6MjA4MjE5MjEzMH0.I4FeC3dmtOXNqLWA-tRgxAb7JCe13HysOkqMGkXaUUc";

// Aseguramos que Supabase esté cargado
let db = window.db;

if (!db) {
    if (typeof window.supabase !== 'undefined') {
        window.supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
        window.db = window.supabaseClient;
        db = window.db;
    } else {
        console.error("La librería de Supabase no ha cargado aún.");
        // Si no hay librería, no podemos hacer nada, enviamos al registro por seguridad
        window.location.href = 'registro.html';
    }
}

let currentUser = null;

// ==========================================
// 2. GUARDIA DE SEGURIDAD (AL CARGAR)
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Verificamos si db existe antes de llamar a auth
        if (!db) throw new Error("No hay conexión con base de datos");

        const { data, error } = await db.auth.getSession();
        
        // Si hay error, no hay sesión, o no hay usuario: REDIRIGIR
        if (error || !data.session || !data.session.user) {
            console.log("No hay sesión válida. Redirigiendo a registro...");
            window.location.href = 'registro.html';
            return;
        }
        
        // Si llegamos aquí, todo está bien
        currentUser = data.session.user;
        console.log("Sesión activa:", currentUser.email);
        
        cargarDatosPerfil();

    } catch (err) {
        console.error("Error crítico de seguridad:", err);
        // EN CASO DE DUDA O ERROR, SACAR AL USUARIO
        window.location.href = 'registro.html';
    }
});

// ==========================================
// 3. FUNCIONES DE PERFIL
// ==========================================

async function cargarDatosPerfil() {
    const nombreElem = document.getElementById('user-name');
    const correoElem = document.getElementById('user-email');
    const fotoElem = document.getElementById('profile-display');

    try {
        // 1. Intentar datos de la base de datos SQL
        const { data, error } = await db
            .from('perfiles_clientes')
            .select('*')
            .eq('id', currentUser.id)
            .single();

        // 2. Datos por defecto (Auth) si falla la DB
        const nombreMostrar = (data && data.nombre) ? data.nombre : (currentUser.user_metadata.nombre || "Usuario");
        const correoMostrar = (data && data.email) ? data.email : currentUser.email;
        const fotoMostrar = (data && data.foto_url) ? data.foto_url : "https://picsum.photos/200";

        // 3. Pintar en pantalla
        if(nombreElem) nombreElem.innerText = nombreMostrar;
        if(correoElem) correoElem.innerText = correoMostrar;
        if(fotoElem) fotoElem.src = fotoMostrar;

    } catch (err) {
        console.error("Error al cargar datos visuales:", err);
    }
}

async function editarNombre() {
    const nombreElem = document.getElementById('user-name');
    const actual = nombreElem.innerText;
    const nuevoNombre = prompt("Ingresa tu nuevo nombre:", actual);
    
    if (nuevoNombre && nuevoNombre.trim() !== "") {
        try {
            const { error } = await db
                .from('perfiles_clientes')
                .update({ nombre: nuevoNombre.trim() })
                .eq('id', currentUser.id);

            if (!error) {
                nombreElem.innerText = nuevoNombre.trim();
            } else {
                alert("Error al actualizar: " + error.message);
            }
        } catch (e) {
            console.error(e);
            alert("Error de conexión");
        }
    }
}

async function editarCorreo() {
    alert("Para cambiar el correo, por favor contacta soporte o usa la gestión de cuenta de Supabase.");
}

// Manejo de imagen de perfil
const inputFile = document.getElementById('input-file');
if (inputFile) {
    inputFile.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            if (!file.type.startsWith('image/')) {
                alert("Por favor selecciona un archivo de imagen.");
                return;
            }
            const reader = new FileReader();
            reader.onload = async function(event) {
                const base64Image = event.target.result;
                
                // Actualizar visualmente primero (UX rápida)
                document.getElementById('profile-display').src = base64Image;

                // Guardar en DB
                const { error } = await db.from('perfiles_clientes')
                    .update({ foto_url: base64Image })
                    .eq('id', currentUser.id);
                
                if(error) alert("Error al guardar imagen en la nube: " + error.message);
            };
            reader.readAsDataURL(file);
        }
    });
}

async function cerrarSesion() {
    if (confirm("¿Estás seguro de que quieres cerrar sesión?")) {
        await db.auth.signOut();
        window.location.href = 'registro.html';
    }
}
window.verStatusReservaciones = async function() {
    // Asegúrate de que 'db' esté inicializado antes de llamar a esta función
    const { data: { user } } = await db.auth.getUser();

    if (!user) {
        alert("Debes iniciar sesión");
        return;
    }

    console.log("🔍 Consultando reservaciones para el usuario:", user.id);

    const { data, error } = await db
        .from('reservaciones')
        .select(`
            mesa,
            fecha_reserva,
            hora_reserva,
            estado,
            restaurante_id,
            restaurantes(nombre)
        `)
        .eq('usuario_id', user.id)
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Error reservaciones:", error);
        return;
    }

    console.log("Reservas encontradas:", data);

    const dialog = document.createElement('dialog');
    dialog.style = `
        padding:0;
        border-radius:25px;
        border:none;
        width:90%;
        max-width:400px;
        background:#eef0f3;
    `;

    let listaHTML = '';

    if (!data || data.length === 0) {
        listaHTML = `<p style="text-align:center; padding:20px;">No tienes reservas aún</p>`;
    } else {

        data.forEach(res => {

            let colorStatus = "#f5c518";
            let icono = "⏳";

            if (res.estado === 'aceptada' || res.estado === 'confirmada') {
                colorStatus = "#10ad93";
                icono = "✅";
            }

            if (res.estado === 'rechazada' || res.estado === 'cancelada') {
                colorStatus = "#ff4757";
                icono = "❌";
            }

            listaHTML += `
                <div style="
                    background:white;
                    margin-bottom:15px;
                    padding:15px;
                    border-radius:15px;
                    box-shadow:4px 4px 8px #caced1;
                ">
                    <div style="display:flex; justify-content:space-between;">
                        <strong>${res.restaurantes?.nombre || 'Restaurante'}</strong>
                        <span style="color:${colorStatus}; font-size:12px; font-weight:bold;">
                            ${icono} ${res.estado.toUpperCase()}
                        </span>
                    </div>

                    <div style="margin-top:8px; font-size:13px; color:#666;">
                        📍 ${res.mesa}<br>
                        📅 ${res.fecha_reserva}<br>
                        🕒 ${res.hora_reserva.slice(0,5)}
                    </div>
                </div>
            `;
        });
    }

    dialog.innerHTML = `
        <div style="padding:20px;">
            <h3>Mis Reservaciones</h3>
            <div style="max-height:400px; overflow:auto;">
                ${listaHTML}
            </div>
            <button onclick="this.closest('dialog').remove()"
                style="
                    width:100%;
                    margin-top:15px;
                    padding:15px;
                    background:black;
                    color:white;
                    border:none;
                    border-radius:15px;
                ">
                Cerrar
            </button>
        </div>
    `;

    document.body.appendChild(dialog);
    dialog.showModal();
}