#!/usr/bin/env python3
"""
Extended unit tests for configuration manager edge cases and validation.
"""

import os
from unittest.mock import patch, MagicMock
import pytest

from modules.config.manager import (
    ConfigManager,
    get_embedding_dimensions,
    ModelProvider,
    LLMConfig,
    EmbeddingConfig,
    get_default_base_dir,
)


class TestGetEmbeddingDimensions:
    """Test get_embedding_dimensions function."""

    def test_get_dimensions_for_known_model(self):
        """Test getting dimensions for a known embedding model."""
        assert get_embedding_dimensions("text-embedding-3-small") == 1536
        assert get_embedding_dimensions("text-embedding-3-large") == 3072
        assert get_embedding_dimensions("amazon.titan-embed-text-v1") == 1536

    def test_get_dimensions_with_default_fallback(self):
        """Test getting dimensions for unknown model uses default."""
        assert get_embedding_dimensions("unknown-model") == 1536
        assert get_embedding_dimensions("unknown-model", default=768) == 768

    def test_get_dimensions_raises_for_none(self):
        """Test that None model_name raises ValueError."""
        with pytest.raises(ValueError, match="model_name cannot be None or empty"):
            get_embedding_dimensions(None)

    def test_get_dimensions_raises_for_empty_string(self):
        """Test that empty string model_name raises ValueError."""
        with pytest.raises(ValueError, match="model_name cannot be None or empty"):
            get_embedding_dimensions("")

    def test_get_dimensions_for_azure_models(self):
        """Test getting dimensions for Azure embedding models."""
        assert get_embedding_dimensions("azure/text-embedding-3-small") == 1536
        assert get_embedding_dimensions("azure/text-embedding-3-large") == 3072

    def test_get_dimensions_for_gemini_models(self):
        """Test getting dimensions for Gemini embedding models."""
        assert get_embedding_dimensions("models/text-embedding-004") == 768
        assert get_embedding_dimensions("gemini/text-embedding-004") == 768


class TestConfigManagerAdvanced:
    """Extended tests for ConfigManager functionality."""

    def setup_method(self):
        """Set up test fixtures."""
        self.config_manager = ConfigManager()

    def test_get_default_region_with_valid_format(self):
        """Test getting default region with valid format."""
        with patch.dict(os.environ, {"AWS_REGION": "us-west-2"}):
            region = self.config_manager.get_default_region()
            assert region == "us-west-2"

    def test_get_default_region_with_invalid_format(self):
        """Test getting default region falls back to us-east-1 for invalid format."""
        with patch.dict(os.environ, {"AWS_REGION": "invalid-region"}):
            region = self.config_manager.get_default_region()
            assert region == "us-east-1"

    def test_get_default_region_without_env_var(self):
        """Test getting default region without environment variable."""
        with patch.dict(os.environ, {}, clear=True):
            region = self.config_manager.get_default_region()
            assert region == "us-east-1"

    def test_is_thinking_model_positive(self):
        """Test identifying thinking-capable models."""
        thinking_model = "us.anthropic.claude-sonnet-4-5-20250929-v1:0"
        assert self.config_manager.is_thinking_model(thinking_model) is True

    def test_is_thinking_model_negative(self):
        """Test non-thinking models return False."""
        regular_model = "anthropic.claude-v2"
        assert self.config_manager.is_thinking_model(regular_model) is False

    def test_get_thinking_model_config_for_sonnet_45(self):
        """Test configuration for Claude Sonnet 4.5 with thinking."""
        model_id = "us.anthropic.claude-sonnet-4-5-20250929-v1:0"
        config = self.config_manager.get_thinking_model_config(model_id, "us-east-1")
        
        assert config["model_id"] == model_id
        assert config["temperature"] == 1.0
        assert "anthropic_beta" in config["additional_request_fields"]
        assert "interleaved-thinking-2025-05-14" in config["additional_request_fields"]["anthropic_beta"]
        assert "context-1m-2025-08-07" in config["additional_request_fields"]["anthropic_beta"]
        assert "thinking" in config["additional_request_fields"]

    def test_get_thinking_model_config_with_env_overrides(self):
        """Test thinking model config respects environment variable overrides."""
        model_id = "us.anthropic.claude-sonnet-4-5-20250929-v1:0"
        
        with patch.dict(os.environ, {"MAX_TOKENS": "20000", "THINKING_BUDGET": "8000"}):
            config = self.config_manager.get_thinking_model_config(model_id, "us-east-1")
            
            assert config["max_tokens"] == 20000
            assert config["additional_request_fields"]["thinking"]["budget_tokens"] == 8000

    def test_get_standard_model_config_for_sonnet_4(self):
        """Test standard model config includes 1M context for Sonnet 4."""
        model_id = "us.anthropic.claude-sonnet-4-20250514-v1:0"
        config = self.config_manager.get_standard_model_config(model_id, "us-east-1", "bedrock")
        
        assert "additional_request_fields" in config
        assert "anthropic_beta" in config["additional_request_fields"]
        assert "context-1m-2025-08-07" in config["additional_request_fields"]["anthropic_beta"]

    def test_get_local_model_config(self):
        """Test getting configuration for local Ollama models."""
        model_id = "llama3.2:3b"
        
        with patch.object(self.config_manager, 'get_ollama_host', return_value="http://localhost:11434"):
            config = self.config_manager.get_local_model_config(model_id, "ollama")
            
            assert config["model_id"] == model_id
            assert config["host"] == "http://localhost:11434"
            assert "temperature" in config
            assert "max_tokens" in config

    def test_get_output_config(self):
        """Test getting output configuration."""
        with patch.dict(os.environ, {}, clear=True):
            self.config_manager._config_cache = {}
            config = self.config_manager.get_output_config("ollama")
            
            assert config.base_dir is not None
            assert config.enable_unified_output is True

    def test_get_sdk_config(self):
        """Test getting SDK configuration."""
        config = self.config_manager.get_sdk_config("ollama")
        
        assert config.enable_hooks is True
        assert config.enable_streaming is True
        assert config.hook_timeout_ms > 0
        assert config.max_concurrent_tools > 0

    def test_provider_defaults_exist(self):
        """Test that all expected provider defaults are initialized."""
        assert "ollama" in self.config_manager._default_configs
        assert "bedrock" in self.config_manager._default_configs
        assert "litellm" in self.config_manager._default_configs


class TestGetDefaultBaseDir:
    """Test get_default_base_dir function."""

    def test_returns_project_outputs_when_in_root(self):
        """Test returns outputs dir when in project root."""
        with patch("os.getcwd", return_value="/test/project"):
            with patch("os.path.exists") as mock_exists:
                mock_exists.return_value = True
                
                result = get_default_base_dir()
                
                assert result == "/test/project/outputs"

    def test_traverses_to_find_project_root(self):
        """Test traverses directory tree to find project root."""
        with patch("os.getcwd", return_value="/test/project/subdirectory"):
            with patch("os.path.exists") as mock_exists:
                def exists_side_effect(path):
                    return "project/pyproject.toml" in path
                mock_exists.side_effect = exists_side_effect
                
                result = get_default_base_dir()
                
                assert "outputs" in result

    def test_fallback_to_cwd_when_no_project_root(self):
        """Test fallback to current working directory when no project root found."""
        with patch("os.getcwd", return_value="/test/directory"):
            with patch("os.path.exists", return_value=False):
                
                result = get_default_base_dir()
                
                assert result == "/test/directory/outputs"


class TestLiteLLMProviderSupport:
    """Test LiteLLM provider support and configuration."""

    def setup_method(self):
        """Set up test fixtures."""
        self.config_manager = ConfigManager()

    def test_litellm_provider_in_defaults(self):
        """Test that LiteLLM provider is in default configs."""
        assert "litellm" in self.config_manager._default_configs

    def test_get_litellm_server_config(self):
        """Test getting LiteLLM server configuration."""
        config = self.config_manager.get_server_config("litellm")
        
        assert config.server_type == "litellm"
        assert config.llm.provider == ModelProvider.LITELLM
        assert config.embedding.provider == ModelProvider.LITELLM

    def test_litellm_embedding_config_dimensions(self):
        """Test LiteLLM embedding configuration dimensions."""
        config = self.config_manager.get_embedding_config("litellm")
        
        assert config.dimensions > 0
        assert config.provider == ModelProvider.LITELLM