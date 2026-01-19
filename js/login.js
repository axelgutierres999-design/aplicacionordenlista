// Configuración de Supabase (Usa las mismas credenciales de tu index.html)
const supabaseUrl = 'https://cpveuexgxwxjejurtwro.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwdmV1ZXhneHd4amVqdXJ0d3JvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2MTYxMzAsImV4cCI6MjA4MjE5MjEzMH0.I4FeC3dmtOXNqLWA-tRgxAb7JCe13HysOkqMGkXaUUc';
const supabase = supabasejs.createClient(supabaseUrl, supabaseKey);

// Función para iniciar sesión
async function iniciarSesion(e) {
    e.preventDefault(); // Evita que la página se recargue

    // Obtenemos los valores de los inputs (asegúrate que tus <input> tengan estos IDs)
    const email = document.getElementById('email-input').value;
    const password = document.getElementById('password-input').value;

    const btnEntrar = e.target.querySelector('button');
    btnEntrar.innerText = "Cargando...";
    btnEntrar.disabled = true;

    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (error) {
            alert("Error: " + error.message);
            btnEntrar.innerText = "Entrar";
            btnEntrar.disabled = false;
        } else {
            // ¡Éxito! Redirigir a la app principal
            console.log("Sesión iniciada:", data);
            window.location.href = 'index.html';
        }
    } catch (err) {
        console.error("Error inesperado:", err);
        alert("Ocurrió un error al intentar entrar.");
        btnEntrar.innerText = "Entrar";
        btnEntrar.disabled = false;
    }
}

// Escuchar el evento del formulario
// Asegúrate de que tu etiqueta <form> tenga id="login-form"
document.getElementById('login-form').addEventListener('submit', iniciarSesion);