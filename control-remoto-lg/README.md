# 📺 Mando LG — control remoto web para teles LG

Controla tu tele LG (webOS) desde el móvil, por WiFi. Funciona en iPhone y Android, y se puede
añadir a la pantalla de inicio como si fuera una app.

## Qué puede hacer

- Encender (Wake-on-LAN) y apagar
- Flechas, OK, Atrás, Inicio, Ajustes, Info, Guía, Salir, botones de colores
- Volumen (con el nivel en vivo), silencio y canales; los botones se repiten al mantenerlos pulsados
- Reproducir, pausa, avanzar, retroceder
- **Puntero**: el móvil hace de touchpad, como el Magic Remote
- **Apps**: lista las apps instaladas en la tele (Netflix, YouTube…) y las abre con un toque
- **Entradas**: cambiar a HDMI 1, HDMI 2, TV…
- **Teclado**: escribir en los buscadores de la tele desde el móvil
- Enviar un mensaje que aparece en la pantalla de la tele
- Búsqueda automática de teles LG en tu red

## Cómo funciona

```
Móvil (web) ──WiFi──► Puente (este programa, en un PC/Raspberry Pi) ──WiFi──► Tele LG
```

Las teles LG se controlan por un WebSocket con un certificado propio que Safari y Chrome no
dejan abrir desde una página web. Por eso hace falta un pequeño **puente** en casa: sirve la web
al móvil y habla con la tele. Puede ser cualquier ordenador (Windows, Mac, Linux) o una
Raspberry Pi que esté en la misma red.

## Instalación

1. Instala **Node.js 18 o superior**: <https://nodejs.org>
2. En esta carpeta, ejecuta:

   ```bash
   npm install
   npm start
   ```

3. En pantalla aparecerá una dirección como `http://192.168.1.20:8080`. Ábrela en el móvil
   (conectado a la **misma WiFi**).
4. Pulsa **Buscar teles** o escribe la IP de la tele.
5. La primera vez, la tele muestra un aviso: pulsa **Aceptar** con el mando normal.
   A partir de ahí, se conecta sola.

### Añadirla a la pantalla de inicio

- **iPhone (Safari):** botón Compartir → *Añadir a pantalla de inicio*.
- **Android (Chrome):** menú ⋮ → *Añadir a pantalla de inicio* / *Instalar app*.

## Ajustes en la tele

- **Para encender desde el móvil:** *Configuración → General → Dispositivos → TV Management →
  Encender con Wi-Fi* (en modelos antiguos: *Red → LG Connect Apps* y *General → Encendido rápido+*).
  La primera conexión debe hacerse con la tele encendida para que el puente aprenda su MAC.
- **IP fija:** conviene reservar la IP de la tele en el router para que no cambie.

## Opciones

| Variable | Para qué | Por defecto |
|---|---|---|
| `PUERTO` | Puerto de la web | `8080` |
| `TV_IP` | IP de la tele (salta la pantalla de conexión) | — |
| `DATOS_DIR` | Dónde se guardan la IP, la MAC y la clave de emparejamiento | `./datos` |

Ejemplo: `PUERTO=3000 TV_IP=192.168.1.50 npm start`

## Dejarlo siempre encendido (opcional)

En una Raspberry Pi u ordenador Linux puedes usar **pm2**:

```bash
npm install -g pm2
pm2 start server.js --name mando-lg
pm2 save && pm2 startup
```

## Problemas frecuentes

| Problema | Solución |
|---|---|
| No encuentra la tele | La tele y el puente deben estar en la misma red (algunas redes de invitados lo bloquean). Prueba escribiendo la IP. |
| "La tele rechazó la conexión" | Vuelve a conectar y pulsa **Aceptar** en la tele. |
| El botón ON no enciende | Activa *Encender con Wi-Fi* en la tele. Si la tele va por WiFi, algunas no se pueden encender cuando llevan mucho rato apagadas; por cable de red es más fiable. |
| Quiero emparejar de nuevo | Borra la carpeta `datos/` y reinicia. |

## Seguridad

Cualquiera conectado a tu WiFi que abra la dirección del puente puede controlar la tele (igual
que con la app oficial de LG). No expongas el puerto a Internet.

## Tecnología

- Node.js sin frameworks + [`lgtv2`](https://www.npmjs.com/package/lgtv2) para el protocolo de LG
- Web en HTML, CSS y JavaScript puros, sin dependencias
