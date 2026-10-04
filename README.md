# ChefOS

A kitchen operations application for managing recipes, ingredients, inventory, costs, cooking batches, and events. The repository contains a React frontend, a Python API, and a Tauri desktop wrapper.

## Capabilities

The [user guide](CHEF_GUIDE.md) documents recipe costing, stock management, cooking simulations, waste tracking, event planning, an assistant, and backup workflows. Desktop activation and local-network access are also described there.

## Architecture

| Component | Stack | Location |
| --- | --- | --- |
| Frontend | React and Vite | `frontend/` |
| API | FastAPI, SQLAlchemy, Pydantic | `backend/` |
| Desktop application | Tauri | `frontend/src-tauri/` |
| License service | Cloudflare Worker | `license-server/` |

## Development

Install backend dependencies in a Python virtual environment:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend/requirements.txt
```

Review `backend/.env.example` and [the build guide](STEP1_BUILD_GUIDE.md) for the backend startup and local configuration.

For the frontend, use a Node.js version compatible with the Vite version in `frontend/package.json`:

```powershell
cd frontend
npm ci
npm run dev
```

For desktop development, see the build guide and the `dev:desktop`, `build:desktop`, and `tauri` scripts. Rust and the platform-specific Tauri build tools are required.

## Documentation

- [User guide](CHEF_GUIDE.md)
- [Build guide](STEP1_BUILD_GUIDE.md)
- [Technical stack](TECHNICAL_STACK.md)
- [Update workflow](UPDATING.md)
- [Google Drive setup](GOOGLE_DRIVE_SETUP.md)
- [License service](license-server/README.md)

## Status

Application source with desktop and cloud configuration. Features are described from repository documentation; the application has not been built or tested as part of this portfolio update. Deployment requires environment-specific setup.
