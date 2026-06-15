from __future__ import annotations

from fastapi import FastAPI

from backend.src.api.routes import dashboard, diagnosis, faults, metrics, model, simulation, stations


def create_app() -> FastAPI:
    app = FastAPI(title="AI Communication Fault Diagnosis System", version="0.1.0")
    app.include_router(dashboard.router, prefix="/api")
    app.include_router(stations.router, prefix="/api")
    app.include_router(metrics.router, prefix="/api")
    app.include_router(faults.router, prefix="/api")
    app.include_router(diagnosis.router, prefix="/api")
    app.include_router(model.router, prefix="/api")
    app.include_router(simulation.router, prefix="/api")
    return app


app = create_app()
