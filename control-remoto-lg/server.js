// Control remoto para televisores LG webOS.
//
// Este programa hace de "puente": sirve la web del control remoto al móvil y
// habla con la tele por la red local (WebSocket del protocolo SSAP de LG).
//
// Uso:  npm install  &&  npm start
// Luego abre en el móvil la dirección que aparece en pantalla.

import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import dgram from 'node:dgram';
import {fileURLToPath} from 'node:url';
import LGTV from 'lgtv2';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PUBLICO = path.join(DIR, 'public');
const DATOS = process.env.DATOS_DIR || path.join(DIR, 'datos');
const CONFIG = path.join(DATOS, 'config.json');
const PUERTO = Number(process.env.PUERTO || process.env.PORT || 8080);

fs.mkdirSync(DATOS, {recursive: true});

// ---------------------------------------------------------------------------
// Configuración guardada (IP y MAC de la tele)
// ---------------------------------------------------------------------------

function leerConfig() {
    try {
        return JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
    } catch {
        return {};
    }
}

function guardarConfig(cfg) {
    fs.writeFileSync(CONFIG, JSON.stringify(cfg, null, 2));
}

let config = leerConfig();
if (process.env.TV_IP) config.host = process.env.TV_IP;

// ---------------------------------------------------------------------------
// Conexión con la tele
// ---------------------------------------------------------------------------

const estado = {
    host: null,
    nombre: null,
    conexion: 'sin-configurar', // sin-configurar | conectando | esperando-aceptar | conectada | desconectada
    error: null,
    volumen: null,
    silencio: false,
    appActual: null,
    mac: null,
};

let tv = null;
let suscripciones = [];

function actualizar(cambios) {
    Object.assign(estado, cambios);
    emitir();
}

function conectar(host) {
    desconectar();
    if (!host) {
        actualizar({conexion: 'sin-configurar', host: null});
        return;
    }
    const keyFile = path.join(DATOS, 'clave-' + host.replace(/[^a-zA-Z0-9.-]/g, '_'));
    actualizar({host, conexion: 'conectando', error: null, volumen: null, appActual: null});

    tv = new LGTV({host, keyFile, mac: config.mac || undefined, reconnect: 5000, timeout: 8000});
    const esta = tv;

    esta.on('connecting', () => {
        if (tv === esta && estado.conexion !== 'esperando-aceptar') actualizar({conexion: 'conectando'});
    });
    esta.on('prompt', () => {
        if (tv === esta) actualizar({conexion: 'esperando-aceptar', error: null});
    });
    esta.on('connect', () => {
        if (tv !== esta) return;
        actualizar({conexion: 'conectada', error: null});
        alConectar(esta);
    });
    esta.on('close', () => {
        if (tv === esta) actualizar({conexion: 'desconectada'});
    });
    esta.on('error', (err) => {
        if (tv !== esta) return;
        const msg = String((err && err.message) || err);
        let texto = msg;
        if (/cancel|denied|rejected|403/i.test(msg)) texto = 'La tele rechazó la conexión. Vuelve a intentarlo y pulsa "Aceptar" en la tele.';
        else if (/ECONNREFUSED|EHOSTUNREACH|ETIMEDOUT|ENETUNREACH|timeout/i.test(msg)) texto = 'No se puede llegar a la tele. ¿Está encendida y en la misma WiFi?';
        actualizar({error: texto, conexion: estado.conexion === 'conectada' ? 'conectada' : 'desconectada'});
    });
    esta.on('mac', (macs) => {
        const mac = macs.wired || macs.wifi;
        if (mac && mac !== config.mac) {
            config.mac = mac;
            guardarConfig(config);
        }
        actualizar({mac: mac || null});
    });
}

function desconectar() {
    if (tv) {
        const viejo = tv;
        tv = null;
        suscripciones = [];
        viejo.removeAllListeners();
        viejo.on('error', () => {});
        viejo.disconnect().catch(() => {});
    }
}

function alConectar(t) {
    suscripciones = [];
    t.request('ssap://system/getSystemInfo')
        .then((info) => actualizar({nombre: info && info.modelName ? 'LG ' + info.modelName : 'Tele LG'}))
        .catch(() => actualizar({nombre: 'Tele LG'}));

    suscripciones.push(
        t.subscribe('ssap://audio/getVolume', (err, res) => {
            if (err || !res) return;
            const v = res.volumeStatus || res;
            actualizar({
                volumen: typeof v.volume === 'number' ? v.volume : estado.volumen,
                silencio: typeof v.muteStatus === 'boolean' ? v.muteStatus : !!(v.muted ?? estado.silencio),
            });
        }),
    );
    suscripciones.push(
        t.subscribe('ssap://com.webos.applicationManager/getForegroundAppInfo', (err, res) => {
            if (!err && res && 'appId' in res) actualizar({appActual: res.appId || null});
        }),
    );
    if (t.mac) actualizar({mac: t.mac});
}

function exigirConexion() {
    if (!tv || estado.conexion !== 'conectada') {
        const e = new Error('La tele no está conectada.');
        e.status = 409;
        throw e;
    }
    return tv;
}

// Botones que se envían por el "socket de puntero" (como el Magic Remote).
const BOTONES = new Set([
    'UP', 'DOWN', 'LEFT', 'RIGHT', 'ENTER', 'BACK', 'EXIT', 'HOME', 'MENU', 'QMENU', 'INFO', 'GUIDE',
    'RED', 'GREEN', 'YELLOW', 'BLUE', 'DASH', 'LIST', 'AD', 'CC', 'ASTERISK',
    'VOLUMEUP', 'VOLUMEDOWN', 'MUTE', 'CHANNELUP', 'CHANNELDOWN',
    'PLAY', 'PAUSE', 'STOP', 'REWIND', 'FASTFORWARD', 'RECORD',
    '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
]);

const URI_PUNTERO = 'ssap://com.webos.service.networkinput/getPointerInputSocket';

async function enviarPuntero(tipo, datos) {
    const t = exigirConexion();
    let sock = await t.getSocket(URI_PUNTERO);
    try {
        sock.send(tipo, datos);
    } catch {
        // El socket pudo cerrarse: se pide uno nuevo y se reintenta una vez.
        sock = await t.getSocket(URI_PUNTERO);
        sock.send(tipo, datos);
    }
}

// ---------------------------------------------------------------------------
// Búsqueda de teles LG en la red (SSDP)
// ---------------------------------------------------------------------------

function buscarTeles(ms = 3000) {
    return new Promise((resolve) => {
        const encontradas = new Map();
        const sock = dgram.createSocket({type: 'udp4', reuseAddr: true});
        const busqueda = [
            'M-SEARCH * HTTP/1.1',
            'HOST: 239.255.255.250:1900',
            'MAN: "ssdp:discover"',
            'MX: 2',
            'ST: urn:lge-com:service:webos-second-screen:1',
            '',
            '',
        ].join('\r\n');

        sock.on('message', (msg, rinfo) => {
            const texto = msg.toString();
            if (!/webos|LG/i.test(texto)) return;
            const nombre = (texto.match(/^DLNADeviceName\.lge\.com:\s*(.+)$/im) || [])[1];
            const anterior = encontradas.get(rinfo.address);
            encontradas.set(rinfo.address, {
                host: rinfo.address,
                nombre: nombre ? decodeURIComponent(nombre.trim()) : (anterior && anterior.nombre) || 'Tele LG',
            });
        });
        sock.on('error', () => {
            try { sock.close(); } catch { /* ya cerrado */ }
            resolve([...encontradas.values()]);
        });
        sock.bind(() => {
            try {
                sock.setBroadcast(true);
                const buf = Buffer.from(busqueda);
                sock.send(buf, 1900, '239.255.255.250');
                setTimeout(() => sock.send(buf, 1900, '239.255.255.250'), 800);
            } catch { /* sin red */ }
        });
        setTimeout(() => {
            try { sock.close(); } catch { /* ya cerrado */ }
            resolve([...encontradas.values()]);
        }, ms);
    });
}

// ---------------------------------------------------------------------------
// API HTTP
// ---------------------------------------------------------------------------

const clientesEventos = new Set();

function emitir() {
    const datos = 'data: ' + JSON.stringify(estado) + '\n\n';
    for (const res of clientesEventos) res.write(datos);
}

function leerCuerpo(req) {
    return new Promise((resolve, reject) => {
        let cuerpo = '';
        req.on('data', (c) => {
            cuerpo += c;
            if (cuerpo.length > 1e5) req.destroy();
        });
        req.on('end', () => {
            if (!cuerpo) return resolve({});
            try {
                resolve(JSON.parse(cuerpo));
            } catch {
                reject(Object.assign(new Error('JSON inválido'), {status: 400}));
            }
        });
        req.on('error', reject);
    });
}

function json(res, status, datos) {
    res.writeHead(status, {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'});
    res.end(JSON.stringify(datos));
}

const IP_VALIDA = /^[a-zA-Z0-9.-]{1,253}$/;

const rutas = {
    'GET /api/estado': async () => estado,

    'GET /api/buscar': async () => ({teles: await buscarTeles()}),

    'POST /api/conectar': async (b) => {
        const host = String(b.host || '').trim();
        if (!IP_VALIDA.test(host)) throw Object.assign(new Error('Dirección no válida.'), {status: 400});
        if (host !== config.host) {
            config = {host};
            guardarConfig(config);
        }
        conectar(host);
        return {ok: true};
    },

    'POST /api/olvidar': async () => {
        desconectar();
        config = {};
        guardarConfig(config);
        actualizar({host: null, nombre: null, conexion: 'sin-configurar', error: null, mac: null, volumen: null});
        return {ok: true};
    },

    'POST /api/boton': async (b) => {
        const nombre = String(b.nombre || '').toUpperCase();
        if (!BOTONES.has(nombre)) throw Object.assign(new Error('Botón desconocido.'), {status: 400});
        await enviarPuntero('button', {name: nombre});
        return {ok: true};
    },

    'POST /api/puntero': async (b) => {
        const dx = Math.max(-200, Math.min(200, Math.round(Number(b.dx) || 0)));
        const dy = Math.max(-200, Math.min(200, Math.round(Number(b.dy) || 0)));
        if (b.accion === 'click') await enviarPuntero('click');
        else if (b.accion === 'scroll') await enviarPuntero('scroll', {dx, dy});
        else await enviarPuntero('move', {dx, dy, down: 0});
        return {ok: true};
    },

    'POST /api/volumen': async (b) => {
        const t = exigirConexion();
        if (b.accion === 'subir') await t.request('ssap://audio/volumeUp');
        else if (b.accion === 'bajar') await t.request('ssap://audio/volumeDown');
        else if (b.accion === 'silencio') await t.request('ssap://audio/setMute', {mute: !estado.silencio});
        else if (typeof b.nivel === 'number') {
            await t.request('ssap://audio/setVolume', {volume: Math.max(0, Math.min(100, Math.round(b.nivel)))});
        } else throw Object.assign(new Error('Acción de volumen no válida.'), {status: 400});
        return {ok: true};
    },

    'POST /api/canal': async (b) => {
        const t = exigirConexion();
        if (b.accion === 'subir') await t.request('ssap://tv/channelUp');
        else if (b.accion === 'bajar') await t.request('ssap://tv/channelDown');
        else throw Object.assign(new Error('Acción de canal no válida.'), {status: 400});
        return {ok: true};
    },

    'POST /api/apagar': async () => {
        await exigirConexion().request('ssap://system/turnOff');
        return {ok: true};
    },

    'POST /api/encender': async () => {
        const mac = (tv && tv.mac) || config.mac;
        if (!mac) {
            throw Object.assign(
                new Error('Todavía no conozco la MAC de la tele. Conéctate una vez con la tele encendida.'),
                {status: 409},
            );
        }
        await LGTV.wake(mac, {count: 5});
        return {ok: true};
    },

    'GET /api/apps': async () => {
        const res = await exigirConexion().request('ssap://com.webos.applicationManager/listLaunchPoints');
        const apps = (res.launchPoints || [])
            .filter((a) => a.id && a.title)
            .map((a) => ({id: a.id, titulo: a.title, icono: a.icon || a.largeIcon || null}));
        return {apps};
    },

    'POST /api/app': async (b) => {
        const id = String(b.id || '');
        if (!/^[\w.-]{1,200}$/.test(id)) throw Object.assign(new Error('App no válida.'), {status: 400});
        await exigirConexion().request('ssap://system.launcher/launch', {id});
        return {ok: true};
    },

    'GET /api/entradas': async () => {
        const res = await exigirConexion().request('ssap://tv/getExternalInputList');
        return {entradas: (res.devices || []).map((d) => ({id: d.id, nombre: d.label || d.id, conectada: !!d.connected}))};
    },

    'POST /api/entrada': async (b) => {
        const id = String(b.id || '');
        if (!/^[\w.-]{1,100}$/.test(id)) throw Object.assign(new Error('Entrada no válida.'), {status: 400});
        await exigirConexion().request('ssap://tv/switchInput', {inputId: id});
        return {ok: true};
    },

    'POST /api/texto': async (b) => {
        const t = exigirConexion();
        const texto = String(b.texto || '').slice(0, 500);
        if (b.borrar) await t.request('ssap://com.webos.service.ime/deleteCharacters', {count: Math.min(500, Number(b.borrar) || 1)});
        if (texto) await t.request('ssap://com.webos.service.ime/insertText', {text: texto, replace: 0});
        if (b.enter) await t.request('ssap://com.webos.service.ime/sendEnterKey');
        return {ok: true};
    },

    'POST /api/aviso': async (b) => {
        const mensaje = String(b.mensaje || '').slice(0, 200);
        if (!mensaje) throw Object.assign(new Error('Escribe un mensaje.'), {status: 400});
        await exigirConexion().request('ssap://system.notifications/createToast', {message: mensaje});
        return {ok: true};
    },
};

const TIPOS = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
};

function servirEstatico(req, res) {
    let ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (ruta === '/') ruta = '/index.html';
    const archivo = path.join(PUBLICO, path.normalize(ruta));
    if (!archivo.startsWith(PUBLICO + path.sep)) {
        res.writeHead(403).end();
        return;
    }
    fs.readFile(archivo, (err, datos) => {
        if (err) {
            res.writeHead(404, {'Content-Type': 'text/plain; charset=utf-8'}).end('No encontrado');
            return;
        }
        res.writeHead(200, {
            'Content-Type': TIPOS[path.extname(archivo)] || 'application/octet-stream',
            'Cache-Control': 'no-cache',
        });
        res.end(datos);
    });
}

// Los iconos de las apps los sirve la propia tele (a veces por https con un
// certificado que el móvil no acepta), así que el puente hace de intermediario.
// Solo se permiten direcciones de la tele conectada.
function servirIcono(direccion, res) {
    let url;
    try {
        url = new URL(direccion);
    } catch {
        res.writeHead(400).end();
        return;
    }
    if (!estado.host || url.hostname !== estado.host || !/^https?:$/.test(url.protocol)) {
        res.writeHead(403).end();
        return;
    }
    const cliente = url.protocol === 'https:' ? https : http;
    const peticion = cliente.get(url, {rejectUnauthorized: false, timeout: 5000}, (r) => {
        if (r.statusCode !== 200 || !/^image\//.test(r.headers['content-type'] || '')) {
            r.resume();
            res.writeHead(404).end();
            return;
        }
        res.writeHead(200, {'Content-Type': r.headers['content-type'], 'Cache-Control': 'max-age=86400'});
        r.pipe(res);
    });
    peticion.on('timeout', () => peticion.destroy());
    peticion.on('error', () => {
        if (!res.headersSent) res.writeHead(502).end();
    });
}

const servidor = http.createServer(async (req, res) => {
    const ruta = new URL(req.url, 'http://x').pathname;

    if (req.method === 'GET' && ruta === '/api/eventos') {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-store',
            Connection: 'keep-alive',
        });
        res.write('data: ' + JSON.stringify(estado) + '\n\n');
        clientesEventos.add(res);
        const latido = setInterval(() => res.write(': latido\n\n'), 20000);
        req.on('close', () => {
            clearInterval(latido);
            clientesEventos.delete(res);
        });
        return;
    }

    if (req.method === 'GET' && ruta === '/api/icono') {
        servirIcono(new URL(req.url, 'http://x').searchParams.get('url'), res);
        return;
    }

    const manejador = rutas[req.method + ' ' + ruta];
    if (manejador) {
        try {
            const cuerpo = req.method === 'POST' ? await leerCuerpo(req) : {};
            json(res, 200, await manejador(cuerpo));
        } catch (err) {
            json(res, err.status || 502, {error: err.message || String(err)});
        }
        return;
    }

    if (ruta.startsWith('/api/')) {
        json(res, 404, {error: 'Ruta no encontrada.'});
        return;
    }
    servirEstatico(req, res);
});

function ipsLocales() {
    return Object.values(os.networkInterfaces())
        .flat()
        .filter((i) => i && i.family === 'IPv4' && !i.internal)
        .map((i) => i.address);
}

servidor.listen(PUERTO, '0.0.0.0', () => {
    console.log('\n📺  Control remoto LG en marcha.\n');
    console.log('   Abre esta dirección en el móvil (conectado a la misma WiFi):');
    for (const ip of ipsLocales()) console.log(`   ➜  http://${ip}:${PUERTO}`);
    console.log(`   (en este ordenador: http://localhost:${PUERTO})\n`);
    if (config.host) conectar(config.host);
});

function salir() {
    desconectar();
    servidor.close();
    setTimeout(() => process.exit(0), 300);
}
process.on('SIGINT', salir);
process.on('SIGTERM', salir);
