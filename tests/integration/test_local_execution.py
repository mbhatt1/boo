"""Integration tests for local execution."""

import pytest
import os
from modules.config.runtime import get_config, reset_config


@pytest.mark.integration
class TestLocalExecutionIntegration:
    """Integration tests for local agent execution."""
    
    def test_config_loads_for_local_mode(self, monkeypatch):
        """Test configuration loads correctly for local execution."""
        monkeypatch.setenv('BOO_DEPLOYMENT_MODE', 'local')
        reset_config()
        
        config = get_config()
        
        assert config.is_local_mode()
        assert config.services.langfuse_url.startswith('http://localhost')
        assert config.services.ollama_url.startswith('http://localhost')
    
    def test_output_path_creation(self, monkeypatch, tmp_path):
        """Test output path can be created for local mode."""
        output_dir = tmp_path / "test_outputs"
        monkeypatch.setenv('BOO_OUTPUT_PATH', str(output_dir))
        reset_config()
        
        config = get_config()
        
        # Create output directory
        os.makedirs(config.output_path, exist_ok=True)
        
        assert os.path.exists(config.output_path)
        assert os.path.isdir(config.output_path)
    
    def test_docker_mode_config(self, monkeypatch):
        """Test configuration loads correctly for Docker mode."""
        monkeypatch.setenv('BOO_DEPLOYMENT_MODE', 'docker')
        monkeypatch.setenv('LANGFUSE_URL', 'http://langfuse-web:3000')
        monkeypatch.setenv('OLLAMA_URL', 'http://host.docker.internal:11434')
        reset_config()
        
        config = get_config()
        
        assert config.is_docker_mode()
        assert config.services.langfuse_url == 'http://langfuse-web:3000'
        assert config.services.ollama_url == 'http://host.docker.internal:11434'