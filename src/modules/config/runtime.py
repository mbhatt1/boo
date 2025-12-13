"""Runtime configuration system for Boo.

This module provides a centralized configuration system that replaces runtime
Docker detection with explicit configuration via environment variables.
"""

from dataclasses import dataclass
from typing import Optional
import os


@dataclass
class ServiceConfig:
    """Configuration for external services."""
    
    langfuse_url: str
    langfuse_public_key: Optional[str]
    langfuse_secret_key: Optional[str]
    ollama_url: str
    
    @classmethod
    def from_env(cls) -> 'ServiceConfig':
        """Load service configuration from environment variables.
        
        Returns:
            ServiceConfig with values from environment or sensible defaults.
        """
        return cls(
            langfuse_url=os.getenv('LANGFUSE_URL', 'http://localhost:3000'),
            langfuse_public_key=os.getenv('LANGFUSE_PUBLIC_KEY'),
            langfuse_secret_key=os.getenv('LANGFUSE_SECRET_KEY'),
            ollama_url=os.getenv('OLLAMA_URL', 'http://localhost:11434')
        )


@dataclass
class RuntimeConfig:
    """Complete runtime configuration for Boo.
    
    This replaces scattered is_docker() checks with explicit configuration.
    """
    
    services: ServiceConfig
    output_path: str
    deployment_mode: str  # 'local', 'docker', 'production'
    
    @classmethod
    def from_env(cls) -> 'RuntimeConfig':
        """Load complete runtime configuration from environment.
        
        Returns:
            RuntimeConfig with values from environment or sensible defaults.
        """
        return cls(
            services=ServiceConfig.from_env(),
            output_path=os.getenv('BOO_OUTPUT_PATH', './outputs'),
            deployment_mode=os.getenv('BOO_DEPLOYMENT_MODE', 'local')
        )
    
    def is_docker_mode(self) -> bool:
        """Check if running in Docker deployment mode."""
        return self.deployment_mode == 'docker'
    
    def is_local_mode(self) -> bool:
        """Check if running in local deployment mode."""
        return self.deployment_mode == 'local'


# Global configuration instance
_config: Optional[RuntimeConfig] = None


def get_config() -> RuntimeConfig:
    """Get the global configuration instance.
    
    Returns:
        RuntimeConfig singleton instance.
    """
    global _config
    if _config is None:
        _config = RuntimeConfig.from_env()
    return _config


def reset_config() -> None:
    """Reset the global configuration (mainly for testing)."""
    global _config
    _config = None