// --- CONFIGURACIÓN SUPABASE ---
const db = window.supabase;

// --- GUARDIA DE SEGURIDAD Y CARGA ---
let currentUser = null;

document.addEventListener('DOMContentLoaded', async () => {
    const { data: { session } } = await db.auth.getSession();
    
    if (!session) {
        window.location.href = 'registro.html';
        return;
    }
    
    currentUser = session.user;
    cargarDatosPerfil();
});

async function cargarDatosPerfil() {
  // ... dentro de cargarDatosPerfil ...
if (error) {
    console.log("No se encontró fila en perfiles_clientes, usando datos de Auth");
    if(nombreElem) nombreElem.innerText = currentUser.user_metadata.nombre || "Usuario";
    if(correoElem) correoElem.innerText = currentUser.email;
    if(fotoElem) fotoElem.src = "https://picsum.photos/200";
    return;
}
    const nombreElem = document.getElementById('user-name');
    const correoElem = document.getElementById('user-email');
    const fotoElem = document.getElementById('profile-display');
    
    // Usar datos de DB o fallbacks
    if(nombreElem) nombreElem.innerText = data.nombre || "Usuario";
    if(correoElem) correoElem.innerText = data.email || currentUser.email;
    if(fotoElem) fotoElem.src = data.foto_url || "https://picsum.photos/200";
}

async function editarNombre() {
    const actual = document.getElementById('user-name').innerText;
    const nuevoNombre = prompt("Ingresa tu nuevo nombre:", actual);
    
    if (nuevoNombre && nuevoNombre.trim() !== "") {
        // Actualizar en Supabase
        const { error } = await db
            .from('perfiles_clientes')
            .update({ nombre: nuevoNombre.trim() })
            .eq('id', currentUser.id);

        if (!error) {
            document.getElementById('user-name').innerText = nuevoNombre.trim();
        } else {
            alert("Error al actualizar nombre");
        }
    }
}

async function editarCorreo() {
    alert("Para cambiar el correo, por favor contacta soporte o usa la gestión de cuenta de Supabase (requiere confirmación de email).");
    // Cambiar email en auth es un proceso delicado que requiere confirmación, 
    // por seguridad es mejor no hacerlo con un simple prompt.
}

// Subida de Imagen (Simulada guardando Base64 en DB por simplicidad)
// Lo ideal es usar Supabase Storage, pero esto mantendrá tu lógica actual funcionando
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
                
                // Actualizar visualmente
                document.getElementById('profile-display').src = base64Image;

                // Guardar en DB (Nota: Base64 es pesado, idealmente usa Buckets)
                await db.from('perfiles_clientes')
                    .update({ foto_url: base64Image })
                    .eq('id', currentUser.id);
            };
            reader.readAsDataURL(file);
        }
    });
}

async function cerrarSesion() {
    const confirmar = confirm("¿Estás seguro de que quieres cerrar sesión?");
    if (confirmar) {
        await db.auth.signOut();
        localStorage.clear(); // Limpiamos residuos locales
        window.location.href = 'registro.html';
    }
}