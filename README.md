# CriptoChat

Chat seguro con cifrado de extremo a extremo (E2EE). Cliente web en React + Vite y servidor WebSocket en FastAPI.

## Arquitectura

```
┌──────────────┐    WebSocket     ┌──────────────┐
│   Frontend   │ ◄──────────────► │   Backend    │
│  React+Vite  │    REST API      │   FastAPI    │
└──────────────┘                  └──────────────┘
```

El servidor retransmite mensajes entre clientes sin tener acceso al contenido cifrado. Todo el cifrado/descifrado ocurre en el navegador.

## Componentes

### Backend (`Backend/`)

- Servidor WebSocket con salas (`/ws/{room}/{username}`)
- API REST para estado, usuarios, IPs locales y generación de claves Fernet
- Retransmisión de mensajes, typing indicators, reacciones, recibos de lectura
- Intercambio de claves públicas (ECDH/ECDSA)
- Sirve los archivos estáticos del frontend en producción

### Frontend (`Frontend/`)

- Interfaz de chat en tiempo real con React
- Cifrado Fernet (AES-128-CBC + HMAC-SHA256) en el navegador vía Web Crypto API
- Intercambio de claves ECDH (Perfect Forward Secrecy)
- Firmas digitales ECDSA para verificación de autenticidad
- Múltiples conexiones WebSocket simultáneas
- Mensajes autodestructibles (TTL)
- Adjuntos de archivos e imágenes
- Mensajes privados entre usuarios (`@usuario`)
- Panel de auditoría de tráfico en tiempo real

## Inicio rápido

```bash
# Backend
cd Backend
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Frontend (otra terminal)
cd Frontend
npm install
npm run dev
```

Abrir `http://localhost:5173`.
