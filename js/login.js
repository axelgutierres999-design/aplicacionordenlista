// 1. Configuración de Supabase
const supabaseUrl = 'https://cpveuexgxwxjejurtwro.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwdmV1ZXhneHd4amVqdXJ0d3JvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2MTYxMzAsImV4cCI6MjA4MjE5MjEzMH0.I4FeC3dmtOXNqLWA-tRgxAb7JCe13HysOkqMGkXaUUc';

// Cambiamos el nombre de la variable a 'client' para evitar el error de duplicado
const client = window.supabase.createClient(supabaseUrl, supabaseKey);

// 2. Función para iniciar sesión
async function iniciarSesion(e) {
    e.preventDefault(); 

    // Referencias al DOM (Asegúrate de que en tu HTML el botón tenga id="btn-entrar")
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const btnEntrar = document.getElementById('btn-entrar') || e.target.querySelector('button');

    const email = emailInput.value;
    const password = passwordInput.value;

    if (btnEntrar) {
        btnEntrar.innerText = "Cargando...";
        btnEntrar.disabled = true;
    }

    try {
        // Usamos 'client' en lugar de 'supabase'
        const { data, error } = await client.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (error) {
            alert("Error: " + error.message);
            if (btnEntrar) {
                btnEntrar.innerText = "Entrar";
                btnEntrar.disabled = false;
            }
        } else {
            console.log("Sesión iniciada:", data);
            // Redirigir a la app principal
            window.location.replace('index.html');
        }
    } catch (err) {
        console.error("Error inesperado:", err);
        alert("Ocurrió un error de conexión.");
        if (btnEntrar) {
            btnEntrar.innerText = "Entrar";
            btnEntrar.disabled = false;
        }
    }
}

// 3. Escuchar el evento del formulario
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', iniciarSesion);
    }
});