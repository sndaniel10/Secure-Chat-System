from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import connect_db, close_db
from routers import auth_router, conversations, keys, users, hpo
from websocket.handler import router as ws_router
from hpo.crt_engine import start_crt, stop_crt
from config import HOST, PORT


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await connect_db()
    start_crt()
    yield
    # Shutdown
    stop_crt()
    await close_db()


app = FastAPI(
    title="HPO Encrypted Chat API",
    description="Secure Communications Server with E2EE and Metadata Obfuscation",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS - allow Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# REST routers
app.include_router(auth_router.router)
app.include_router(conversations.router)
app.include_router(keys.router)
app.include_router(users.router)
app.include_router(hpo.router)

# WebSocket router
app.include_router(ws_router)


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "HPO Encrypted Chat SCS"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=HOST, port=PORT, reload=True)
