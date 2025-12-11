"""Event emission system for Boo-AutoAgent."""

from .batch_emitter import BatchingEmitter
from .emitters import EventEmitter, StdoutEventEmitter, get_emitter
from .tool_protocol import ToolOutputProtocol

__all__ = ["EventEmitter", "StdoutEventEmitter", "get_emitter", "BatchingEmitter", "ToolOutputProtocol"]
