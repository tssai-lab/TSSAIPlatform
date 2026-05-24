# Frontend Server Deployment

This frontend is prepared for deployment to `47.114.84.133`.

## Production defaults

- Frontend route mode: `hash`
- Browser requests `/api` on the same origin
- Browser requests `/mlflow-api` on the same origin
- Static server host: `0.0.0.0`
- Static server port: `8000`
- Internal backend proxy target: `http://127.0.0.1:8080`
- Internal MLflow proxy target: `http://127.0.0.1:5000/ajax-api`

These defaults come from [`.env.production`](./.env.production).

## Build

```bash
npm install
npm run build
```

## Run directly on the server

```bash
npm install
npm run serve:prod
```

Then open:

```text
http://47.114.84.133:8000
```

## Optional override

You can override the internal proxy targets when starting the server:

```bash
BACKEND_PROXY_TARGET=http://127.0.0.1:8080
MLFLOW_PROXY_TARGET=http://127.0.0.1:5000
```

## Why this setup

The browser cannot use `127.0.0.1` to reach your server backend, because `127.0.0.1` in the browser means the visitor's own machine.

So the frontend stays on the public address:

```text
http://47.114.84.133:8000
```

while the server process forwards:

- `/api` -> `127.0.0.1:8080`
- `/mlflow-api` -> `127.0.0.1:5000/ajax-api`
