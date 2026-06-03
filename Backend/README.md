# CriptoChat — Backend

Servidor WebSocket construido con **FastAPI**. Retransmite mensajes entre los clientes conectados sin tener acceso al contenido cifrado.

## Endpoints

| Método | Ruta                    | Descripción                            |
| ------ | ----------------------- | -------------------------------------- |
| `GET`  | `/api/status`           | Estado del servidor                    |
| `GET`  | `/api/users`            | Lista de usuarios conectados           |
| `GET`  | `/api/local-ips`        | IPs locales del servidor               |
| `POST` | `/api/generate-key`     | Genera una clave Fernet válida         |
| `WS`   | `/ws/{room}/{username}` | WebSocket para mensajes en tiempo real |

## WebSocket — Formato de mensajes

### Cliente → Servidor

```json
{ "type": "message", "content": "texto", "mode": "PLANO", "encrypted": false }
{ "type": "typing" }
{ "type": "read", "msg_id": "msg-xxx", "sender": "Alice" }
{ "type": "reaction", "msg_id": "msg-xxx", "emoji": "👍" }
{ "type": "users" }
{ "type": "public-keys", "ecdhPublic": "...", "ecdsaPublic": "..." }
```

### Servidor → Cliente

```json
{ "type": "message", "sender": "Alice", "content": "texto", "mode": "PLANO", "encrypted": false }
{ "type": "system", "content": "Alice se ha conectado" }
{ "type": "error", "content": "Nombre de usuario ya en uso" }
{ "type": "receipt", "status": "delivered", "msg_id": "msg-xxx" }
{ "type": "typing", "sender": "Alice" }
{ "type": "users", "users": ["Alice", "Bob"] }
{ "type": "public-keys", "sender": "Alice", "ecdhPublic": "...", "ecdsaPublic": "..." }
{ "type": "reaction", "sender": "Bob", "msg_id": "msg-xxx", "emoji": "😂" }
```

## Instalación y ejecución

```bash
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

## Variables de entorno

| Variable       | Default                 | Descripción              |
| -------------- | ----------------------- | ------------------------ |
| `PORT`         | `8000`                  | Puerto del servidor      |
| `CORS_ORIGINS` | `http://localhost:5173` | Orígenes CORS permitidos |

## Notas

- Los nombres de usuario son únicos por sala.
- El servidor no almacena mensajes ni claves.
- Soporta salas: cada sala tiene su propio espacio de nombres de usuarios.
- Los mensajes con `target` se entregan solo al destinatario (mensaje privado).
- Las claves públicas ECDH/ECDSA se reenvían a todos los clientes en la sala.
- En producción sirve automáticamente el frontend compilado desde `Frontend/dist/`.
