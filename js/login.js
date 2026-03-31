// 1. Configuración de Supabase
const supabaseUrl = 'https://cpveuexgxwxjejurtwro.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwdmV1ZXhneHd4amVqdXJ0d3JvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2MTYxMzAsImV4cCI6MjA4MjE5MjEzMH0.I4FeC3dmtOXNqLWA-tRgxAb7JCe13HysOkqMGkXaUUc';

const client = window.supabase.createClient(supabaseUrl, supabaseKey);

// 2. Referencias a los elementos visuales de la animación
const station = document.getElementById('station'); // El círculo de la sartén
const alertMsg = document.getElementById('alert-msg'); // Si usas el div de mensajes

// 3. Función para iniciar sesión
async function iniciarSesion(e) {
    e.preventDefault(); 

    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const btnEntrar = document.getElementById('btn-entrar');

    const email = emailInput.value;
    const password = passwordInput.value;

    // ESTADO: Iniciando proceso
    if (btnEntrar) {
        btnEntrar.innerText = "Cocinando...";
        btnEntrar.disabled = true;
    }

    try {
        const { data, error } = await client.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (error) {
            // ERROR: Detener animación y mostrar fallo
            station.classList.remove('is-cooking');
            alert("Error: " + error.message);
            
            if (btnEntrar) {
                btnEntrar.innerText = "Reintentar Orden";
                btnEntrar.disabled = false;
            }
        } else {
            // ÉXITO: Activar animación de "Plato Terminado"
            console.log("Sesión iniciada:", data);
            
            station.classList.remove('is-cooking');
            station.classList.add('is-cooked'); // La comida cambia de color
            
            if (btnEntrar) btnEntrar.innerText = "¡Orden Lista!";

            // Pequeña pausa para que el usuario vea la comida lista antes de redirigir
            setTimeout(() => {
                window.location.replace('index.html');
            }, 1000);
        }
    } catch (err) {
        console.error("Error inesperado:", err);
        station.classList.remove('is-cooking');
        alert("Ocurrió un error de conexión.");
        if (btnEntrar) {
            btnEntrar.innerText = "Entrar";
            btnEntrar.disabled = false;
        }
    }
}

// 4. Control de animaciones mientras el usuario escribe
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const inputs = document.querySelectorAll('input');

    if (loginForm) {
        loginForm.addEventListener('submit', iniciarSesion);
    }

    // Iniciar animación cuando el usuario toca un campo
    inputs.forEach(input => {
        input.addEventListener('focus', () => {
            if (station) {
                station.classList.remove('is-cooked');
                station.classList.add('is-cooking');
            }
        });

        // Detener animación si deja los campos vacíos
        input.addEventListener('blur', () => {
            const emailVal = document.getElementById('email').value;
            const passVal = document.getElementById('password').value;
            if(emailVal === '' && passVal === '' && station) {
                station.classList.remove('is-cooking');
            }
        });
    });
});