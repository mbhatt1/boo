"""Unit tests for runtime configuration system."""

import os
import pytest
from modules.config.runtime import (
    RuntimeConfig,
    ServiceConfig,
    get_config,
    reset_config
)


class TestServiceConfig:
    """Test service configuration loading."""
    
    def test_from_env_with_defaults(self, monkeypatch):
        """Test loading service config with default values."""
        # Clear any existing env vars
        for key in ['LANGFUSE_URL', 'OLLAMA_URL']:
            monkeypatch.delenv(key, raising=False)
        
        config = ServiceConfig.from_env()
        
        assert config.langfuse_url == 'http://localhost:3000'
        assert config.ollama_url == 'http://localhost:11434'
        assert config.langfuse_public_key is None
        assert config.langfuse_secret_key is None
    
    def test_from_env_with_custom_values(self, monkeypatch):
        """Test loading service config with custom values."""
        monkeypatch.setenv('LANGFUSE_URL', 'http://custom:4000')
        monkeypatch.setenv('OLLAMA_URL', 'http://custom-ollama:5000')
        monkeypatch.setenv('LANGFUSE_PUBLIC_KEY', 'test-pub-key')
        monkeypatch.setenv('LANGFUSE_SECRET_KEY', 'test-secret-key')
        
        config = ServiceConfig.from_env()
        
        assert config.langfuse_url == 'http://custom:4000'
        assert config.ollama_url == 'http://custom-ollama:5000'
        assert config.langfuse_public_key == 'test-pub-key'
        assert config.langfuse_secret_key == 'test-secret-key'


class TestRuntimeConfig:
    """Test runtime configuration loading."""
    
    def test_from_env_local_mode(self, monkeypatch):
        """Test configuration loads correctly for local mode."""
        monkeypatch.setenv('BOO_DEPLOYMENT_MODE', 'local')
        monkeypatch.setenv('BOO_OUTPUT_PATH', './outputs')
        reset_config()
        
        config = RuntimeConfig.from_env()
        
        assert config.deployment_mode == 'local'
        assert config.output_path == './outputs'
        assert config.is_local_mode()
        assert not config.is_docker_mode()
    
    def test_from_env_docker_mode(self, monkeypatch):
        """Test configuration loads correctly for Docker mode."""
        monkeypatch.setenv('BOO_DEPLOYMENT_MODE', 'docker')
        monkeypatch.setenv('LANGFUSE_URL', 'http://langfuse-web:3000')
        reset_config()
        
        config = RuntimeConfig.from_env()
        
        assert config.deployment_mode == 'docker'
        assert config.is_docker_mode()
        assert not config.is_local_mode()
        assert config.services.langfuse_url == 'http://langfuse-web:3000'
    
    def test_singleton_pattern(self, monkeypatch):
        """Test get_config returns same instance."""
        reset_config()
        
        config1 = get_config()
        config2 = get_config()
        
        assert config1 is config2


class TestConfigIntegration:
    """Integration tests for configuration system."""
    
    def test_load_from_local_fixture(self, monkeypatch):
        """Test loading configuration from local fixture."""
        # Load fixture
        import dotenv
        dotenv.load_dotenv('tests/fixtures/.env.local')
        reset_config()
        
        config = get_config()
        
        assert config.deployment_mode == 'local'
        assert config.services.langfuse_url == 'http://localhost:3000'
        assert config.services.ollama_url == 'http://localhost:11434'
    
    def test_load_from_docker_fixture(self, monkeypatch):
        """Test loading configuration from Docker fixture."""
        import dotenv
        dotenv.load_dotenv('tests/fixtures/.env.docker')
        reset_config()
        
        config = get_config()
        
        assert config.deployment_mode == 'docker'
        assert config.services.langfuse_url == 'http://langfuse-web:3000'