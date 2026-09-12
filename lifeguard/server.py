"""Local-only approval callback server."""

from __future__ import annotations

from typing import Any, Callable

from .actions import execute_action
from .notify import push_confirmation
from .observer import foreground_pid, memory_snapshot
from .policy.broker import Broker
from .proposals import PROPOSALS
from .registry import REGISTRY
from .tokens import consume


class DecisionError(Exception):
    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def fresh_observation() -> dict[str, Any]:
    return {"memory": memory_snapshot(), "foreground_pid": foreground_pid()}


class DecisionService:
    def __init__(
        self,
        proposal_store=PROPOSALS,
        registry=REGISTRY,
        broker: Any | None = None,
        *,
        consume_token: Callable[[str], dict[str, str] | None] = consume,
        observe: Callable[[], dict[str, Any]] = fresh_observation,
        execute: Callable[[str, dict[str, Any]], None] = execute_action,
        confirm: Callable[[str], None] = push_confirmation,
    ):
        self.proposal_store = proposal_store
        self.registry = registry
        self.broker = broker or Broker(registry)
        self.consume_token = consume_token
        self.observe = observe
        self.execute = execute
        self.confirm = confirm

    def decide(self, authorization: str | None, body: dict[str, Any] | None) -> dict[str, str]:
        if not authorization or not authorization.startswith("Bearer "):
            raise DecisionError(401, "Missing bearer token")
        payload = self.consume_token(authorization.removeprefix("Bearer "))
        if payload is None:
            raise DecisionError(403, "Invalid, expired, or already-used token")
        decision = (body or {}).get("decision")
        if decision != payload["decision"]:
            raise DecisionError(403, "Decision body does not match token")
        proposal = self.proposal_store.claim(payload["proposal_id"], payload["proposal_hash"])
        if proposal is None:
            raise DecisionError(409, "Proposal is missing, changed, or already decided")
        if decision == "deny":
            self.confirm("Denied")
            return {"status": "denied"}
        observation = self.observe()
        verdict = self.broker.admissible(proposal, observation)
        if not verdict.allowed:
            self.confirm(f"Blocked: {verdict.reason}")
            raise DecisionError(409, verdict.reason)
        task = self.registry.resolve(proposal["target_id"])
        if task is None:
            raise DecisionError(409, "identity_uncertain")
        self.execute(verdict.action or proposal["action"], task)
        self.confirm(f"Approved: {proposal['action']}")
        return {"status": "ok", "action": proposal["action"]}


def create_app(service: DecisionService | None = None):
    from fastapi import FastAPI, Header, HTTPException

    decision_service = service or DecisionService()
    application = FastAPI(title="Lifeguard Callback", docs_url=None, redoc_url=None)

    @application.post("/decision")
    async def decision(body: dict[str, Any], authorization: str | None = Header(default=None)):
        try:
            return decision_service.decide(authorization, body)
        except DecisionError as error:
            raise HTTPException(error.status_code, error.detail) from error

    @application.get("/status")
    async def status():
        return memory_snapshot()

    return application


try:
    app = create_app()
except ModuleNotFoundError:
    app = None


def start(port: int = 8000) -> None:
    import uvicorn

    uvicorn.run(app or create_app(), host="127.0.0.1", port=port, log_level="warning")
