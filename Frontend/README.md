# CriptoChat — Frontend

Cliente web construido con **React + Vite**. Se conecta a uno o más servidores FastAPI vía WebSocket y permite enviar mensajes planos o cifrados con Fernet.

## Estructura

```
src/
├── App.jsx                          # Estado global y lógica principal
├── App.css
├── main.jsx
├── components/
│   ├── LoginForm.jsx                # Login con detección de IP local
│   ├── ControlPanel.jsx             # Clave Fernet, ECDH y estado
│   ├── ConnectionPanel.jsx          # Conexiones activas (+ multi-servidor)
│   ├── ChatBox.jsx                  # Mensajes, reacciones, recibos, TTL, vistas previas
│   ├── MessageInput.jsx             # Input, adjuntos, TTL, @menciones
│   ├── AuditPanel.jsx               # Panel de auditoría de tráfico en vivo
│   └── UserPersonal.jsx             # Lista de usuarios en línea
├── hooks/
│   └── useMultiConnection.js        # Hook para N conexiones WebSocket
└── utils/
    └── crypto.js                    # Fernet + ECDH + ECDSA con Web Crypto API
```

## Instalación

```bash
pnpm install
```

## Ejecución en desarrollo

```bash
pnpm run dev
```

Abre `http://localhost:5173`. El backend debe estar corriendo en `http://localhost:8000`.

## Construcción para producción

```bash
pnpm run build
```

Genera los archivos estáticos en `dist/`. El backend puede servirlos automáticamente.

## Variables de entorno

| Variable      | Default               | Descripción                                 |
| ------------- | --------------------- | ------------------------------------------- |
| `VITE_WS_URL` | `ws://localhost:8000` | URL del WebSocket backend (solo desarrollo) |

En producción la URL se detecta automáticamente desde `window.location.origin`.

## Componentes

### LoginForm

- Campo de nombre de usuario, URL del servidor y sala.
- Muestra las IPs locales del servidor (obtenidas de `/api/local-ips`).
- Detecta automáticamente si está en desarrollo (puerto 5173) o producción.

### ControlPanel

- Campo para la clave Fernet manual.
- Botón "Generar Clave" (local y desde el backend).
- Indicador de conexión y estado de intercambio ECDH.

### ConnectionPanel

- Muestra la conexión principal destacada.
- Botón `+` para conectar a servidores adicionales.
- Badges cliqueables para desconectar.

### ChatBox

- Mensajes planos y cifrados con distintivo visual.
- Recibos de entrega/lectura (✓, ✓✓).
- Reacciones con emojis.
- Mensajes autodestructibles con cuenta regresiva (TTL).
- Vistas previas de imágenes y archivos adjuntos.
- Badge de verificación de firma digital (ECDSA).
- Scroll automático e IntersectionObserver para recibos de lectura.

### MessageInput

- Input de texto con dos botones: "plano" y "cifrado".
- Enter para enviar plano.
- Botón de adjuntar archivos e imágenes (codificados en base64).
- Selector de TTL para mensajes autodestructibles.
- Autocompletado de @menciones con Tab.
- Se deshabilita si no hay conexiones activas.

### AuditPanel

- Visualización en tiempo real de todo el tráfico WebSocket.
- Clasificación por tipo (mensaje, sistema, typing, claves públicas, etc.).
- Explicación en lenguaje natural de cada paquete.
- Filtros por categoría.
- Estadísticas: paquetes totales, cifrados vs planos, bytes transferidos.

### UserPersonal

- Lista de usuarios conectados en la sala actual.
- Indicador de cantidad de usuarios en línea.

## Cifrado

### Fernet (AES-128-CBC + HMAC-SHA256)

Implementación en el navegador usando Web Crypto API:

- **Clave**: 32 bytes aleatorios, codificados en base64.
- **Mitad de firma**: primeros 16 bytes (HMAC-SHA256).
- **Mitad de cifrado**: últimos 16 bytes (AES-128-CBC).
- **Token**: versión (1) + timestamp (8) + IV (16) + ciphertext + HMAC (32), todo en base64.

Compatible con el formato `cryptography.fernet` de Python.

### ECDH (Perfect Forward Secrecy)

- Intercambio de claves Diffie-Hellman sobre curva P-256.
- Cada sesión genera un par de claves efímero.
- La clave Fernet compartida se deriva sin que ninguna de las partes la haya elegido ni transmitido.

### ECDSA (Firma digital)

- Firma de cada mensaje cifrado con ECDSA P-256.
- El receptor verifica la autenticidad del remitente.
- Badge visual en la interfaz: ✔ firmado / ✘ firma inv.
