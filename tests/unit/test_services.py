"""Unit tests for service URL resolution."""

import pytest
from modules.config.runtime import get_config, reset_config


class TestServiceURLResolution:
    """Test that service URLs resolve correctly in different modes."""
    
    def test_langfuse_url_local_mode(self, monkeypatch):
        """Test Langfuse URL resolves to localhost in local mode."""
        monkeypatch.setenv('BOO_DEPLOYMENT_MODE', 'local')
        monkeypatch.delenv('LANGFUSE_URL', raising=False)
        reset_config()
        
        config = get_config()
        
        assert config.services.langfuse_url == 'http://localhost:3000'
    
    def test_langfuse_url_docker_mode(self, monkeypatch):
        """Test Langfuse URL can be configured for Docker mode."""
        monkeypatch.setenv('BOO_DEPLOYMENT_MODE', 'docker')
        monkeypatch.setenv('LANGFUSE_URL', 'http://langfuse-web:3000')
        reset_config()
        
        config = get_config()
        
        assert config.services.langfuse_url == 'http://langfuse-web:3000'
    
    def test_ollama_url_local_mode(self, monkeypatch):
        """Test Ollama URL resolves to localhost in local mode."""
        monkeypatch.setenv('BOO_DEPLOYMENT_MODE', 'local')
        monkeypatch.delenv('OLLAMA_URL', raising=False)
        reset_config()
        
        config = get_config()
        
        assert config.services.ollama_url == 'http://localhost:11434'
    
    def test_ollama_url_docker_mode(self, monkeypatch):
        """Test Ollama URL can be configured for Docker mode."""
        monkeypatch.setenv('BOO_DEPLOYMENT_MODE', 'docker')
        monkeypatch.setenv('OLLAMA_URL', 'http://host.docker.internal:11434')
        reset_config()
        
        config = get_config()
        
        assert config.services.ollama_url == 'http://host.docker.internal:11434'