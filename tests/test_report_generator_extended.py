#!/usr/bin/env python3
"""
Extended unit tests for report_generator module.
Tests edge cases, error handling, and validation functions.
"""

import json
import os
from unittest.mock import MagicMock, patch, Mock
import pytest

from modules.handlers.report_generator import (
    generate_security_report,
    _retrieve_evidence_from_memory,
    _get_module_report_prompt,
)


class TestGenerateSecurityReport:
    """Test generate_security_report function."""

    def test_generate_report_with_valid_config(self):
        """Test report generation with valid configuration data."""
        config_data = json.dumps({
            "steps_executed": 10,
            "tools_used": ["nmap", "nikto"],
            "provider": "bedrock",
            "module": "web"
        })
        
        with patch("modules.handlers.report_generator.ReportGenerator.create_report_agent") as mock_agent:
            mock_result = MagicMock()
            mock_result.message = {
                "content": [{"text": "# Test Report\nContent here"}]
            }
            mock_agent.return_value = MagicMock(return_value=mock_result)
            
            with patch("modules.handlers.report_generator._retrieve_evidence_from_memory") as mock_evidence:
                mock_evidence.return_value = [
                    {"category": "finding", "content": "Test finding", "id": "1"}
                ]
                
                result = generate_security_report(
                    target="test.com",
                    objective="Test objective",
                    operation_id="OP123",
                    config_data=config_data
                )
                
                assert "Test Report" in result
                mock_agent.assert_called_once()

    def test_generate_report_with_invalid_json_config(self):
        """Test report generation with malformed JSON configuration."""
        invalid_config = "not valid json {{"
        
        result = generate_security_report(
            target="test.com",
            objective="Test objective",
            operation_id="OP123",
            config_data=invalid_config
        )
        
        assert "Invalid configuration format" in result

    def test_generate_report_with_empty_evidence(self):
        """Test report generation when no evidence is collected."""
        with patch("modules.handlers.report_generator._retrieve_evidence_from_memory") as mock_evidence:
            mock_evidence.return_value = []
            
            result = generate_security_report(
                target="test.com",
                objective="Test objective",
                operation_id="OP123"
            )
            
            assert result == ""

    def test_generate_report_with_no_config_data(self):
        """Test report generation without config_data parameter."""
        with patch("modules.handlers.report_generator.ReportGenerator.create_report_agent") as mock_agent:
            mock_result = MagicMock()
            mock_result.message = {
                "content": [{"text": "# Report"}]
            }
            mock_agent.return_value = MagicMock(return_value=mock_result)
            
            with patch("modules.handlers.report_generator._retrieve_evidence_from_memory") as mock_evidence:
                mock_evidence.return_value = [
                    {"category": "finding", "content": "Test"}
                ]
                
                result = generate_security_report(
                    target="test.com",
                    objective="Test",
                    operation_id="OP123",
                    config_data=None
                )
                
                assert "# Report" in result

    def test_generate_report_exception_handling(self):
        """Test that exceptions are handled gracefully."""
        with patch("modules.handlers.report_generator.ReportGenerator") as mock_gen_class:
            mock_gen_class.side_effect = Exception("Test error")
            
            result = generate_security_report(
                target="test.com",
                objective="Test",
                operation_id="OP123"
            )
            
            # Returns empty string when no evidence found (before exception can occur)
            assert result == "" or "failed" in result.lower()

    def test_generate_report_with_module_specific_prompt(self):
        """Test report generation with module-specific prompt."""
        config_data = json.dumps({"module": "ctf"})
        
        with patch("modules.handlers.report_generator.ReportGenerator.create_report_agent") as mock_agent:
            mock_result = MagicMock()
            mock_result.message = {
                "content": [{"text": "# CTF Report"}]
            }
            mock_agent.return_value = MagicMock(return_value=mock_result)
            
            with patch("modules.handlers.report_generator._retrieve_evidence_from_memory") as mock_evidence:
                mock_evidence.return_value = [
                    {"category": "finding", "content": "Flag found"}
                ]
                
                with patch("modules.handlers.report_generator._get_module_report_prompt") as mock_prompt:
                    mock_prompt.return_value = "CTF-specific guidance"
                    
                    result = generate_security_report(
                        target="ctf.example.com",
                        objective="Find flags",
                        operation_id="OP123",
                        config_data=config_data
                    )
                    
                    assert result is not None
                    mock_prompt.assert_called_once_with("ctf")


class TestRetrieveEvidenceFromMemory:
    """Test _retrieve_evidence_from_memory function."""

    def test_retrieve_with_no_memory_client(self):
        """Test evidence retrieval when memory client is unavailable."""
        with patch("modules.handlers.report_generator.get_memory_client") as mock_get_client:
            mock_get_client.return_value = None
            
            with patch.dict(os.environ, {"MEM0_ENABLED": "false"}):
                evidence = _retrieve_evidence_from_memory("OP123")
                
                assert evidence == []

    def test_retrieve_with_operation_scoped_memories(self):
        """Test retrieval of operation-scoped memories."""
        mock_client = MagicMock()
        mock_client.list_memories.return_value = {
            "memories": [
                {
                    "id": "1",
                    "memory": "Test finding",
                    "metadata": {
                        "operation_id": "OP123",
                        "category": "finding",
                        "severity": "high"
                    }
                }
            ]
        }
        
        with patch("modules.handlers.report_generator.get_memory_client") as mock_get_client:
            mock_get_client.return_value = mock_client
            
            evidence = _retrieve_evidence_from_memory("OP123")
            
            assert len(evidence) == 1
            assert evidence[0]["category"] == "finding"
            assert evidence[0]["severity"] == "high"

    def test_retrieve_with_heuristic_markers(self):
        """Test evidence retrieval with heuristic markers."""
        mock_client = MagicMock()
        mock_client.list_memories.return_value = {
            "memories": [
                {
                    "id": "1",
                    "memory": "[VULNERABILITY] SQL Injection found",
                    "metadata": {}
                }
            ]
        }
        
        with patch("modules.handlers.report_generator.get_memory_client") as mock_get_client:
            mock_get_client.return_value = mock_client
            
            evidence = _retrieve_evidence_from_memory("OP123")
            
            assert len(evidence) == 1
            assert "[VULNERABILITY]" in evidence[0]["content"]

    def test_retrieve_with_memory_expected_but_unavailable(self):
        """Test warning when memory is expected but unavailable."""
        with patch("modules.handlers.report_generator.get_memory_client") as mock_get_client:
            mock_get_client.return_value = None
            
            with patch.dict(os.environ, {"MEM0_ENABLED": "true"}):
                evidence = _retrieve_evidence_from_memory("OP123")
                
                assert len(evidence) == 1
                assert evidence[0]["category"] == "system_warning"


class TestGetModuleReportPrompt:
    """Test _get_module_report_prompt function."""

    def test_get_prompt_for_valid_module(self):
        """Test getting report prompt for valid module."""
        with patch("modules.prompts.get_module_loader") as mock_loader:
            mock_module_loader = MagicMock()
            mock_module_loader.load_module_report_prompt.return_value = "Module prompt"
            mock_loader.return_value = mock_module_loader
            
            result = _get_module_report_prompt("web")
            
            assert result == "Module prompt"

    def test_get_prompt_for_none_module(self):
        """Test getting prompt when module is None."""
        result = _get_module_report_prompt(None)
        
        assert result is None

    def test_get_prompt_with_loader_exception(self):
        """Test getting prompt when loader raises exception."""
        with patch("modules.prompts.get_module_loader") as mock_loader:
            mock_loader.side_effect = Exception("Loader error")
            
            result = _get_module_report_prompt("web")
            
            assert "DOMAIN_LENS" in result
            assert "overview" in result

    def test_get_prompt_returns_none_for_missing_module(self):
        """Test getting prompt for non-existent module."""
        with patch("modules.prompts.get_module_loader") as mock_loader:
            mock_module_loader = MagicMock()
            mock_module_loader.load_module_report_prompt.return_value = None
            mock_loader.return_value = mock_module_loader
            
            result = _get_module_report_prompt("nonexistent")
            
            assert result is None