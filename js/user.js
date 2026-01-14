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