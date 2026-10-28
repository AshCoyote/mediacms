# AGENTS.md — running MediaCMS in the Base44 sandbox

## How to run it

```bash
docker compose -f docker-compose.base44.yml up -d --build
```

Start it **after** editing anything under `frontend/` that webpack reads at boot
(`webpack.config.js`, `package.json`), otherwise the running dev server keeps the old config.

Use `docker-compose.base44.yml`, not the repo's own `docker-compose.yaml` /
`docker-compose-dev.yaml`: those run the published `mediacms/mediacms` images, so a source
edit would never show up. The Base44 file bind-mounts the checkout into every app service
and runs the app's development commands live.

## What runs where

| service | what it does |
| --- | --- |
| `frontend` | webpack dev server on host **3000** (the preview entry). Serves `static/js|css` from the live build and proxies every other request to Django, so the whole app is one origin — sessions, CSRF and media work without CORS. |
| `web` | Django dev server (`runserver`, auto-reload) inside the container on port 80, exposed on host **8000** (admin `/admin/`, API docs `/swagger/`). |
| `celery_worker` | one Celery worker on both `short_tasks,long_tasks` queues (upload/encoding/state checks). |
| `migrations` | one-shot: migrate, load `fixtures/`, create the admin user, `collectstatic`. Re-runs on every `up` and is idempotent. |
| `db`, `redis` | postgres (`db_data` volume) and redis. |

Image: built once from the repo's own `Dockerfile` target `base` (dev build) as
`mediacms-base44-dev:local` — Python/system deps only, the source in it is shadowed by the
bind mount. The `frontend` service uses plain `node:24` and installs its dependencies into
the `frontend_node_modules` volume on start.

Admin user: **admin / admin** (dev only; set by `ADMIN_PASSWORD` in the compose file).

Nothing here needs an external credential: postgres/redis/admin are local and
`deploy/docker/entrypoint.sh` writes `SECRET_KEY` to `.secret_key` on first start.

## Sandbox-only overrides (all gated on `BASE44_PREVIEW_MODE === "1"`)

The preview proxy terminates TLS and forwards the browser's `Origin`
(`https://<port>-<BASE44_PUBLIC_HOST_SUFFIX>`) unchanged, while the app sees an internal
`Host`. Three narrow, flag-gated accommodations:

- `cms/dev_settings.py` — adds the two preview origins to `CSRF_TRUSTED_ORIGINS`. Without
  it every POST (login, upload, admin) fails with "Origin checking failed" 403. Verified:
  an untrusted origin still gets 403.
- `cms/dev_settings.py` — sets `CELERY_EMAIL_BACKEND` to the console backend. The repo's
  default mailer targets the public `mediacms.io` SMTP server with a placeholder password,
  so mail (new-admin welcome, invites, password resets) failed and `djcelery_email` retried
  it forever. Mail is now printed to the worker log, through the same Celery path.
- `frontend/webpack.config.js` — extends the dev server's host allowlist with
  `.<BASE44_SANDBOX_HOST_DOMAIN>`; the default `auto` allowlist rejects the proxied host
  with 403.

With the flag unset (or any value other than `1`) these settings are untouched. This applies
to the repo's own `docker-compose-dev.yaml` usage too.

## Gotchas

- `deploy/docker/entrypoint.sh` chowns the mounted checkout to `www-data`, which makes git
  refuse to work as root ("dubious ownership in repository"). Fixed in this sandbox with
  `git config --system --add safe.directory '*'` — re-apply if git starts complaining after
  a container start.
- The compose files must never set a platform secret under `environment:`; see
  `docker-compose.base44.yml`.
- Email: in the sandbox mail is printed to the `celery_worker` log (see the flag-gated
  `CELERY_EMAIL_BACKEND` above) instead of being sent through the repo's default public
  `mediacms.io` SMTP server. Uploads, encoding, playback, login and admin are unaffected.
  Set real `EMAIL_*` values (and `USE_X_ACCEL_REDIRECT=False` if not fronted by nginx) for a
  deployment that should actually deliver mail.
- In dev the React bundles come from the webpack dev server, not from `static/`: no build
  step is needed after editing frontend source, but a `make build-frontend`-style production
  bundle is not what the preview shows.
- Runtime artifacts are gitignored and safe to delete: `.secret_key`, `cms/local_settings.py`,
  `static_collected/`, `media_files/`, `logs/`.

## Verifying changes

Frontend edits: webpack recompiles in place, the page live-reloads.
Backend edits: Django's autoreloader restarts itself (~5 s); `docker compose -f
docker-compose.base44.yml restart web` if it does not.

```bash
# app + assets through the preview entry point
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/static/js/base.js

# Django directly (admin / API docs)
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8000/swagger/
```

Tests run inside the containers (the sandbox host has no language runtimes):

```bash
docker compose -f docker-compose.base44.yml exec --env TESTING=True -T web pytest -n auto
docker compose -f docker-compose.base44.yml exec -T frontend npm run test -- --ci
```
