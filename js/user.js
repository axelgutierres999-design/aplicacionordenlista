// ==========================================
// 1. CONFIGURACIÓN E INICIALIZACIÓN
// ==========================================
const supabaseUrl = "https://cpveuexgxwxjejurtwro.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwdmV1ZXhneHd4amVqdXJ0d3JvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2MTYxMzAsImV4cCI6MjA4MjE5MjEzMH0.I4FeC3dmtOXNqLWA-tRgxAb7JCe13HysOkqMGkXaUUc";

// Inicializar el cliente si no existe
if (!window.db) {
    window.supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
    window.db = window.supabaseClient;
}

const db = window.db;
let currentUser = null;

// ==========================================
// 2. GUARDIA DE SEGURIDAD (AL CARGAR)
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    // Obtenemos la sesión actual
    const { data: { session } } = await db.auth.getSession();
    
    if (!session) {
        console.log("Usuario no autenticado. Redirigiendo...");
        window.location.href = 'registro.html';
        return;
    }
    
    currentUser = session.user;
    console.log("Sesión iniciada:", currentUser.email);
    
    // Ejecutamos la carga de datos
    cargarDatosPerfil();
});

// ==========================================
// 3. FUNCIONES DE PERFIL
// ==========================================

async function cargarDatosPerfil() {
    const nombreElem = document.getElementById('user-name');
    const correoElem = document.getElementById('user-email');
    const fotoElem = document.getElementById('profile-display');

    try {
        // Intentamos traer los datos de la tabla SQL
        const { data, error } = await db
            .from('perfiles_clientes')
            .select('*')
            .eq('id', currentUser.id)
            .single();

        // FALLBACK: Si hay error o no existe la fila aún, usamos los datos de Auth
        if (error || !data) {
            console.log("Usando datos de Auth (Metadata de registro)");
            if(nombreElem) nombreElem.innerText = currentUser.user_metadata.nombre || "Usuario VIP";
            if(correoElem) correoElem.innerText = currentUser.email;
            if(fotoElem) fotoElem.src = "https://picsum.photos/200";
            return;
        }

        // Si todo está bien, usamos los datos de la tabla 'perfiles_clientes'
        if(nombreElem) nombreElem.innerText = data.nombre || "Usuario";
        if(correoElem) correoElem.innerText = data.email || currentUser.email;
        if(fotoElem) fotoElem.src = data.foto_url || "https://picsum.photos/200";

    } catch (err) {
        console.error("Error crítico al cargar perfil:", err);
    }
}

async function editarNombre() {
    const actual = document.getElementById('user-name').innerText;
    const nuevoNombre = prompt("Ingresa tu nuevo nombre:", actual);
    
    if (nuevoNombre && nuevoNombre.trim() !== "") {
        const { error } = await db
            .from('perfiles_clientes')
            .update({ nombre: nuevoNombre.trim() })
            .eq('id', currentUser.id);

        if (!error) {
            document.getElementById('user-name').innerText = nuevoNombre.trim();
            alert("Nombre actualizado");
        } else {
            alert("Error al actualizar: " + error.message);
        }
    }
}

async function editarCorreo() {
    alert("Por seguridad, el cambio de correo requiere validación oficial desde los ajustes de cuenta.");
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
                
                // 1. Mostrar cambio inmediato en la UI
                document.getElementById('profile-display').src = base64Image;

                // 2. Guardar en la base de datos
                const { error } = await db.from('perfiles_clientes')
                    .update({ foto_url: base64Image })
                    .eq('id', currentUser.id);
                
                if(error) alert("Error al guardar imagen: " + error.message);
            };
            reader.readAsDataURL(file);
        }
    });
}

async function cerrarSesion() {
    if (confirm("¿Estás seguro de que quieres cerrar sesión?")) {
        await db.auth.signOut();
        localStorage.clear(); 
        window.location.href = 'registro.html';
    }
}