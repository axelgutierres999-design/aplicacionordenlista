const supabaseUrl = 'https://cpveuexgxwxjejurtwro.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwdmV1ZXhneHd4amVqdXJ0d3JvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2MTYxMzAsImV4cCI6MjA4MjE5MjEzMH0.I4FeC3dmtOXNqLWA-tRgxAb7JCe13HysOkqMGkXaUUc';

const client = window.supabase.createClient(supabaseUrl, supabaseKey);

const station = document.getElementById('station');

async function iniciarSesion(e) {
    e.preventDefault(); 

    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const btnEntrar = document.getElementById('btn-entrar');

    const email = emailInput.value;
    const password = passwordInput.value;

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
            station.classList.remove('is-cooking');
            alert("Error: " + error.message);
            if (btnEntrar) {
                btnEntrar.innerText = "Reintentar Orden";
                btnEntrar.disabled = false;
            }
        } else {
            // ÉXITO
            console.log("Sesión iniciada:", data);
            
            station.classList.remove('is-cooking');
            station.classList.add('is-cooked'); 
            
            if (btnEntrar) btnEntrar.innerText = "¡Orden Lista!";

            // Redirigir después de 1 segundo para mostrar la comida cocinada
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

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const inputs = document.querySelectorAll('input');

    if (loginForm) {
        loginForm.addEventListener('submit', iniciarSesion);
    }

    inputs.forEach(input => {
        input.addEventListener('focus', () => {
            if (station) {
                station.classList.remove('is-cooked');
                station.classList.add('is-cooking');
            }
        });

        input.addEventListener('blur', () => {
            const emailVal = document.getElementById('email').value;
            const passVal = document.getElementById('password').value;
            if(emailVal === '' && passVal === '' && station) {
                station.classList.remove('is-cooking');
            }
        });
    });
});