"""WaterBuddy API entry point.

Privacy rule from day one: this server never receives drink logs. In Phase 6 it stores
only push subscriptions, reminder times and time zones. Drink data stays on the phone
unless a person explicitly opts in to sync (a later phase).
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import __version__
from .settings import get_settings


class Health(BaseModel):
    status: str
    service: str
    version: str
    environment: str


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="WaterBuddy API", version=__version__, docs_url="/docs", redoc_url=None)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.origins,
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["Content-Type"],
    )

    @app.get("/health", response_model=Health, tags=["meta"])
    def health() -> Health:
        return Health(
            status="ok", service="waterbuddy-api", version=__version__, environment=settings.environment
        )

    return app


app = create_app()
