// 1. Configuración de Supabase
const supabaseUrl = 'https://cpveuexgxwxjejurtwro.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwdmV1ZXhneHd4amVqdXJ0d3JvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2MTYxMzAsImV4cCI6MjA4MjE5MjEzMH0.I4FeC3dmtOXNqLWA-tRgxAb7JCe13HysOkqMGkXaUUc';

// Inicializamos el cliente. Usamos window.supabase que viene del CDN del HTML
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

// 2. Función para iniciar sesión
async function iniciarSesion(e) {
    e.preventDefault(); // Evita que la página se recargue

    // Referencias a los elementos del DOM (IDs corregidos según tu HTML)
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const btnEntrar = document.getElementById('btn-entrar');

    const email = emailInput.value;
    const password = passwordInput.value;

    // Feedback visual (Cargando...)
    btnEntrar.innerText = "Cargando...";
    btnEntrar.disabled = true;

    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (error) {
            // Si hay error (contraseña mal, usuario no existe)
            alert("Error: " + error.message);
            btnEntrar.innerText = "Entrar";
            btnEntrar.disabled = false;
        } else {
            // ¡Éxito!
            console.log("Sesión iniciada:", data);
            // Redirigir a la app principal
            window.location.href = 'index.html';
        }
    } catch (err) {
        console.error("Error inesperado:", err);
        alert("Ocurrió un error de conexión.");
        btnEntrar.innerText = "Entrar";
        btnEntrar.disabled = false;
    }
}

// 3. Escuchar el evento del formulario
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', iniciarSesion);
    }
});