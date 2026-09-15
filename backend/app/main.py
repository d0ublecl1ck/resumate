from fastapi import FastAPI

from app.modules.health.api import router as health_router

app = FastAPI(title="backend")

app.include_router(health_router)
