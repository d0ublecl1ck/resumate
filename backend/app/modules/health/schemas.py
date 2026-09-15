from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str  # API response: Service liveness status, "ok" when healthy.
