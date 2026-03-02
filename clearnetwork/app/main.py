from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.db import engine
from app.routes import adequacy, alerts, health, networks, plans, providers, quality


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    yield
    # Shutdown — dispose DB engine
    await engine.dispose()


app = FastAPI(
    title="ClearNetwork API",
    description=(
        "Healthcare Insurance Network Intelligence Platform. "
        "Aggregates federally-mandated insurer network disclosures "
        "so consumers can verify in-network provider status."
    ),
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/v1/docs",
    redoc_url="/v1/redoc",
    openapi_url="/v1/openapi.json",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routes
app.include_router(health.router, prefix="/v1")
app.include_router(providers.router, prefix="/v1")
app.include_router(plans.router, prefix="/v1")
app.include_router(networks.router, prefix="/v1")
app.include_router(alerts.router, prefix="/v1")
app.include_router(adequacy.router, prefix="/v1")
app.include_router(quality.router, prefix="/v1")


@app.get("/")
async def root():
    return {
        "service": "ClearNetwork",
        "version": "0.1.0",
        "description": "Healthcare Insurance Network Intelligence Platform",
        "docs": "/v1/docs",
        "legal_basis": "CMS Transparency in Coverage Rule (45 CFR §147.211)",
    }


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal server error",
            "detail": str(exc) if app.debug else "An unexpected error occurred",
        },
    )
