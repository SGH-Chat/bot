from typing import List, Optional, Any
from pydantic import BaseModel, Field

class ResponseBodyChoice(BaseModel):
    index: int
    message: Optional[dict]  # Adjust based on actual structure
    refusal: Optional[Any] = None  # Adjust based on actual structure
    logprobs: Optional[Any] = None
    finish_reason: Optional[str] = None


class ResponseBody(BaseModel):
    choices: List[ResponseBodyChoice]


class ResponseData(BaseModel):
    id: str
    object: str
    created: int
    model: str
    choices: List[ResponseBodyChoice]
    usage: Optional[dict] = None
    system_fingerprint: Optional[str] = None


class BatchResponse(BaseModel):
    status_code: int
    request_id: str
    body: ResponseBody


class CompleteResponse(BaseModel):
    id: str
    custom_id: str
    response: BatchResponse
    error: Optional[Any] = None