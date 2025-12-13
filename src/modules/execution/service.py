"""Abstract execution service interface for Boo agent execution.

This module provides a clean abstraction for agent execution that works
for both local and Docker deployment modes.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Dict, Optional
from enum import Enum


class ExecutionMode(Enum):
    """Execution mode for the agent."""
    LOCAL = "local"
    DOCKER = "docker"


@dataclass
class ExecutionParams:
    """Parameters for agent execution."""
    target: str
    objective: str
    module: str
    config: Dict[str, Any]
    auto_run: bool = False


class ExecutionService(ABC):
    """Abstract base class for all execution services."""
    
    @abstractmethod
    async def execute(self, params: ExecutionParams) -> None:
        """Execute the agent with given parameters.
        
        Args:
            params: Execution parameters including target, objective, and config.
        """
        pass
    
    @abstractmethod
    async def stop(self) -> None:
        """Stop the current execution."""
        pass
    
    @abstractmethod
    def is_active(self) -> bool:
        """Check if execution is currently active.
        
        Returns:
            True if agent is currently executing, False otherwise.
        """
        pass