// Control remoto LG — lógica de la web.
'use strict';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

let estado = {};
let yaConectada = false; // si en esta sesión llegamos a conectar alguna vez
let appsCargadas = false;

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

async function api(ruta, cuerpo) {
    const opciones = cuerpo === undefined
        ? {}
        : {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(cuerpo)};
    let res;
    try {
        res = await fetch(ruta, opciones);
    } catch {
        throw new Error('No hay conexión con el puente. ¿Sigue encendido el ordenador?');
    }
    const datos = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(datos.error || 'Error ' + res.status);
    return datos;
}

let temporizadorToast;
function toast(texto, esError) {
    const t = $('#toast');
    t.textContent = texto;
    t.classList.toggle('error', !!esError);
    t.hidden = false;
    clearTimeout(temporizadorToast);
    temporizadorToast = setTimeout(() => (t.hidden = true), esError ? 4000 : 2000);
}

function vibrar() {
    if (navigator.vibrate) navigator.vibrate(8);
}

async function enviar(ruta, cuerpo, mensajeOk) {
    try {
        await api(ruta, cuerpo);
        if (mensajeOk) toast(mensajeOk);
    } catch (e) {
        toast(e.message, true);
    }
}

// ---------------------------------------------------------------------------
// Estado en vivo (Server-Sent Events)
// ---------------------------------------------------------------------------

function escucharEstado() {
    const fuente = new EventSource('api/eventos');
    fuente.onmessage = (ev) => {
        estado = JSON.parse(ev.data);
        if (estado.conexion === 'conectada') yaConectada = true;
        pintar();
    };
    fuente.onerror = () => {
        $('#teleEstado').textContent = 'Sin conexión con el puente…';
        $('#punto').className = 'punto error';
    };
}

const TEXTOS = {
    'sin-configurar': 'Sin tele',
    conectando: 'Conectando…',
    'esperando-aceptar': 'Acepta en la tele',
    conectada: 'Conectada',
    desconectada: 'Desconectada',
};

function pintar() {
    const c = estado.conexion;
    $('#teleNombre').textContent = estado.nombre || (estado.host ? 'Tele LG' : 'Mando LG');
    $('#teleEstado').textContent = (TEXTOS[c] || c) + (estado.host ? ' · ' + estado.host : '');
    $('#punto').className = 'punto ' + (c === 'conectada' ? 'conectada' : c === 'esperando-aceptar' || c === 'conectando' ? 'esperando' : estado.error ? 'error' : '');

    const verConexion = c === 'sin-configurar' || c === 'esperando-aceptar' || (!yaConectada && c !== 'conectada');
    $('#vistaConexion').hidden = !verConexion;
    $('#vistaMando').hidden = verConexion;

    $('#avisoAceptar').hidden = c !== 'esperando-aceptar';
    const err = $('#avisoError');
    err.hidden = !estado.error || c === 'esperando-aceptar';
    err.textContent = estado.error ? '⚠️ ' + estado.error : '';
    if (!verConexion) err.hidden = true;
    if (c === 'conectando' && !yaConectada && estado.host) {
        err.hidden = false;
        err.className = 'aviso';
        err.textContent = '⏳ Conectando con ' + estado.host + '…';
    } else {
        err.className = 'aviso error';
    }
    if (estado.host && !$('#inputIp').value) $('#inputIp').value = estado.host;

    const inactivo = c !== 'conectada';
    $('#vistaMando').classList.toggle('inactivo', inactivo);
    $('#bandaDesconectada').hidden = !inactivo;
    $('#bandaTexto').textContent = estado.error
        ? estado.error
        : c === 'conectando' ? 'Reconectando con la tele…' : 'La tele está apagada o no responde.';

    $('#nivelVolumen').textContent = estado.silencio ? '🔇' : estado.volumen ?? '–';
    $('#btnSilencio').classList.toggle('activo', !!estado.silencio);

    $$('.app').forEach((el) => el.classList.toggle('actual', el.dataset.id === estado.appActual));

    $('#infoTele').innerHTML = estado.host
        ? `Tele: <b>${escapar(estado.nombre || 'LG')}</b> · IP <b>${escapar(estado.host)}</b>` +
          (estado.mac ? ` · MAC <b>${escapar(estado.mac)}</b>` : '')
        : '';
}

function escapar(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]);
}

// ---------------------------------------------------------------------------
// Conexión
// ---------------------------------------------------------------------------

$('#btnBuscar').addEventListener('click', async () => {
    const btn = $('#btnBuscar');
    const lista = $('#listaTeles');
    btn.disabled = true;
    btn.textContent = '⏳ Buscando…';
    lista.innerHTML = '';
    try {
        const {teles} = await api('api/buscar');
        if (!teles.length) {
            lista.innerHTML = '<li class="vacio">No encontré ninguna tele LG. Comprueba que esté encendida y en la misma WiFi, o escribe su IP abajo.</li>';
        }
        for (const t of teles) {
            const li = document.createElement('li');
            li.innerHTML = `<button><span>📺 ${escapar(t.nombre)}</span><small>${escapar(t.host)}</small></button>`;
            li.firstChild.addEventListener('click', () => conectar(t.host));
            lista.appendChild(li);
        }
    } catch (e) {
        toast(e.message, true);
    } finally {
        btn.disabled = false;
        btn.textContent = '🔍 Buscar teles';
    }
});

$('#btnConectar').addEventListener('click', () => conectar($('#inputIp').value.trim()));
$('#inputIp').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') conectar($('#inputIp').value.trim());
});

function conectar(host) {
    if (!host) return toast('Escribe la IP de la tele.', true);
    yaConectada = false;
    appsCargadas = false;
    enviar('api/conectar', {host});
}

async function cambiarTele() {
    cerrarHojas();
    yaConectada = false;
    appsCargadas = false;
    $('#rejillaApps').innerHTML = '';
    $('#inputIp').value = '';
    await enviar('api/olvidar', {});
}
$('#btnCambiarTele').addEventListener('click', cambiarTele);
$('#btnBandaCambiar').addEventListener('click', cambiarTele);

// ---------------------------------------------------------------------------
// Botones del mando (con repetición al mantener pulsado)
// ---------------------------------------------------------------------------

function accionDe(el) {
    if (el.dataset.boton) return () => api('api/boton', {nombre: el.dataset.boton});
    if (el.dataset.volumen) return () => api('api/volumen', {accion: el.dataset.volumen});
    if (el.dataset.canal) return () => api('api/canal', {accion: el.dataset.canal});
    return null;
}

function ejecutar(fn) {
    vibrar();
    fn().catch((e) => toast(e.message, true));
}

$$('[data-boton], [data-volumen], [data-canal]').forEach((el) => {
    const fn = accionDe(el);
    if (!el.hasAttribute('data-repetir')) {
        el.addEventListener('click', () => ejecutar(fn));
        return;
    }
    let espera, repeticion;
    const parar = () => {
        clearTimeout(espera);
        clearInterval(repeticion);
        el.classList.remove('pulsado');
    };
    el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        el.classList.add('pulsado');
        ejecutar(fn);
        espera = setTimeout(() => {
            repeticion = setInterval(() => ejecutar(fn), 160);
        }, 450);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((t) => el.addEventListener(t, parar));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
});

$$('[data-accion="apagar"]').forEach((el) =>
    el.addEventListener('click', () => {
        vibrar();
        enviar('api/apagar', {}, 'Apagando la tele…');
    }),
);
$$('[data-accion="encender"]').forEach((el) =>
    el.addEventListener('click', () => {
        vibrar();
        enviar('api/encender', {}, 'Señal de encendido enviada');
    }),
);

// ---------------------------------------------------------------------------
// Pestañas
// ---------------------------------------------------------------------------

$$('.pestanas button').forEach((b) =>
    b.addEventListener('click', () => {
        $$('.pestanas button').forEach((x) => x.classList.toggle('activa', x === b));
        $$('.pestana').forEach((p) => (p.hidden = p.dataset.pestana !== b.dataset.ir));
        if (b.dataset.ir === 'apps' && !appsCargadas) cargarApps();
    }),
);

// ---------------------------------------------------------------------------
// Apps
// ---------------------------------------------------------------------------

const FAVORITAS = ['netflix', 'youtube.leanback.v4', 'amazon', 'com.disney.disneyplus-prod', 'spotify-beehive'];

async function cargarApps() {
    const rejilla = $('#rejillaApps');
    rejilla.innerHTML = '<p class="ayuda">Cargando apps…</p>';
    try {
        const {apps} = await api('api/apps');
        apps.sort((a, b) => {
            const fa = FAVORITAS.indexOf(a.id), fb = FAVORITAS.indexOf(b.id);
            if (fa !== fb) return (fa === -1 ? 99 : fa) - (fb === -1 ? 99 : fb);
            return a.titulo.localeCompare(b.titulo);
        });
        rejilla.innerHTML = '';
        for (const a of apps) {
            const b = document.createElement('button');
            b.className = 'app';
            b.dataset.id = a.id;
            const icono = a.icono && /^https?:/.test(a.icono)
                ? `<img loading="lazy" alt="" src="api/icono?url=${encodeURIComponent(a.icono)}">`
                : `<div class="sin-icono">${escapar(a.titulo[0] || '?')}</div>`;
            b.innerHTML = `${icono}<span>${escapar(a.titulo)}</span>`;
            const img = b.querySelector('img');
            if (img) {
                img.onerror = () => img.replaceWith(Object.assign(document.createElement('div'), {className: 'sin-icono', textContent: a.titulo[0] || '?'}));
            }
            b.addEventListener('click', () => {
                vibrar();
                enviar('api/app', {id: a.id}, 'Abriendo ' + a.titulo + '…');
            });
            rejilla.appendChild(b);
        }
        appsCargadas = true;
        pintar();
    } catch (e) {
        rejilla.innerHTML = `<p class="ayuda">No se pudieron cargar las apps: ${escapar(e.message)}</p>`;
    }
}
$('#btnRecargarApps').addEventListener('click', cargarApps);

// ---------------------------------------------------------------------------
// Entradas (HDMI, etc.)
// ---------------------------------------------------------------------------

$$('[data-abrir="entradas"]').forEach((el) =>
    el.addEventListener('click', async () => {
        const lista = $('#listaEntradas');
        lista.innerHTML = '<li class="vacio">Cargando…</li>';
        $('#hojaEntradas').hidden = false;
        try {
            const {entradas} = await api('api/entradas');
            lista.innerHTML = '';
            const tv = document.createElement('li');
            tv.innerHTML = '<button><span>📡 TV (antena)</span></button>';
            tv.firstChild.addEventListener('click', () => {
                cerrarHojas();
                enviar('api/app', {id: 'com.webos.app.livetv'});
            });
            lista.appendChild(tv);
            for (const en of entradas) {
                const li = document.createElement('li');
                li.innerHTML = `<button><span>🔌 ${escapar(en.nombre)}</span><small>${en.conectada ? 'conectado' : ''}</small></button>`;
                li.firstChild.addEventListener('click', () => {
                    cerrarHojas();
                    enviar('api/entrada', {id: en.id}, 'Cambiando a ' + en.nombre);
                });
                lista.appendChild(li);
            }
        } catch (e) {
            lista.innerHTML = `<li class="vacio">${escapar(e.message)}</li>`;
        }
    }),
);

// ---------------------------------------------------------------------------
// Hojas
// ---------------------------------------------------------------------------

function cerrarHojas() {
    $$('.hoja').forEach((h) => (h.hidden = true));
}
$$('[data-cerrar]').forEach((b) => b.addEventListener('click', cerrarHojas));
$$('.hoja').forEach((h) => h.addEventListener('click', (e) => e.target === h && cerrarHojas()));
$('#btnAjustes').addEventListener('click', () => ($('#hojaAjustes').hidden = false));

$('#btnAviso').addEventListener('click', async () => {
    const mensaje = $('#inputAviso').value.trim();
    if (!mensaje) return;
    await enviar('api/aviso', {mensaje}, 'Mensaje enviado a la tele');
    $('#inputAviso').value = '';
});

// ---------------------------------------------------------------------------
// Teclado
// ---------------------------------------------------------------------------

$('#btnEnviarTexto').addEventListener('click', async () => {
    const texto = $('#textoTele').value;
    if (!texto) return;
    await enviar('api/texto', {texto}, 'Texto enviado');
    $('#textoTele').value = '';
});
$('#btnEnter').addEventListener('click', () => {
    const texto = $('#textoTele').value;
    $('#textoTele').value = '';
    enviar('api/texto', {texto, enter: true});
});
$('#btnBorrar').addEventListener('click', () => enviar('api/texto', {borrar: 1}));

// ---------------------------------------------------------------------------
// Touchpad (puntero tipo Magic Remote)
// ---------------------------------------------------------------------------

(function touchpad() {
    const zona = $('#touchpad');
    const SENSIBILIDAD = 1.6;
    let modoScroll = false;
    let ultimo = null;
    let inicio = null;
    let movido = 0;
    let pendiente = {dx: 0, dy: 0};
    let enviando = false;

    $('#btnScroll').addEventListener('click', () => {
        modoScroll = !modoScroll;
        $('#btnScroll').textContent = '↕ Desplazar: ' + (modoScroll ? 'sí' : 'no');
    });

    async function vaciar() {
        if (enviando || (!pendiente.dx && !pendiente.dy)) return;
        enviando = true;
        const {dx, dy} = pendiente;
        pendiente = {dx: 0, dy: 0};
        try {
            await api('api/puntero', {accion: modoScroll ? 'scroll' : 'move', dx, dy});
        } catch { /* se ignora para no saturar de avisos */ }
        enviando = false;
        vaciar();
    }

    zona.addEventListener('pointerdown', (e) => {
        zona.setPointerCapture(e.pointerId);
        zona.classList.add('tocando');
        ultimo = {x: e.clientX, y: e.clientY};
        inicio = {t: Date.now()};
        movido = 0;
    });
    zona.addEventListener('pointermove', (e) => {
        if (!ultimo) return;
        const dx = (e.clientX - ultimo.x) * SENSIBILIDAD;
        const dy = (e.clientY - ultimo.y) * SENSIBILIDAD;
        ultimo = {x: e.clientX, y: e.clientY};
        movido += Math.abs(dx) + Math.abs(dy);
        pendiente.dx += dx;
        pendiente.dy += dy;
        vaciar();
    });
    const soltar = () => {
        zona.classList.remove('tocando');
        if (inicio && movido < 8 && Date.now() - inicio.t < 300) {
            vibrar();
            api('api/puntero', {accion: 'click'}).catch((err) => toast(err.message, true));
        }
        ultimo = null;
        inicio = null;
    };
    zona.addEventListener('pointerup', soltar);
    zona.addEventListener('pointercancel', () => {
        zona.classList.remove('tocando');
        ultimo = null;
        inicio = null;
    });
})();

escucharEstado();
