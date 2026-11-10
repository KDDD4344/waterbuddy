"""WaterBuddy API entry point.

Privacy rule from day one: this server never receives drink logs. It stores only push
subscriptions, one reminder time, the time zone and bedtime, and a yes/no for whether
today's goal is met (decision D-009). Drink data stays on the phone unless a person
explicitly opts in to sync (a later phase).
"""

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import __version__
from .db import init_db
from .reminders import router as reminders_router
from .settings import get_settings


class Health(BaseModel):
    status: str
    service: str
    version: str
    environment: str


def create_app() -> FastAPI:
    settings = get_settings()

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        init_db()
        task = None
        if settings.scheduler_enabled and settings.push_configured:
            from .scheduler import loop

            task = asyncio.create_task(loop())
        yield
        if task:
            task.cancel()

    app = FastAPI(
        title="WaterBuddy API", version=__version__, docs_url="/docs", redoc_url=None, lifespan=lifespan
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.origins,
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["Content-Type"],
    )
    app.include_router(reminders_router)

    @app.get("/health", response_model=Health, tags=["meta"])
    def health() -> Health:
        return Health(
            status="ok", service="waterbuddy-api", version=__version__, environment=settings.environment
        )

    return app


app = create_app()
